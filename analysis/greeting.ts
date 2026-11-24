import type { GreetingCheckIssue, GreetingPreferences } from '../shared/types';
import { DEFAULT_GREETING_PREFERENCES } from '../profile/manager';

// 打招呼语的本地校验（分为结构、事实、风格三类）：只做确定性规则检查，不额外调用模型。
// 注意：本地事实检查仅能发现部分表面矛盾（如无依据数字、年限或明确边界冲突），不能证明全部陈述真实，仍须人工核对。

/** 默认简洁模式下留出固定结尾的余量，超过即触发定向重写。 */
export const GREETING_MAX_CHARS = 160;

export interface CheckGreetingOptions {
  preferences?: Partial<GreetingPreferences>;
  writingRules?: string;
  extraNotes?: string;
  /** 职位标题仅用于识别技术版本标识（如 Web3 / Vue3 / 5G），绝不允许标题中的年限或薪资数字背书候选人经历。 */
  jobTitle?: string;
}

const CN_NUM_MAP: Record<string, string> = {
  一: '1',
  二: '2',
  两: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
};

/** 去掉模型常见的外层包装：代码围栏、整段成对引号。 */
export function cleanGreeting(raw: string): string {
  let s = raw.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
  const m = /^(["“「])([\s\S]*)(["”」])$/.exec(s);
  if (m && '"“「'.indexOf(m[1]!) === '"”」'.indexOf(m[3]!)) s = m[2]!.trim();
  return s;
}

/** 从职位标题中仅提取字母+数字的技术标识（排除 20K/30W 等薪资及独立年限数字）。 */
function extractTechTokenNumbers(jobTitle: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!jobTitle?.trim()) return out;
  const normalized = jobTitle.normalize('NFKC');
  const techTokens = normalized.match(/[A-Za-z]+\d+(?:\.\d+)?|\d+(?:\.\d+)?[A-Za-z]+/g) ?? [];
  for (const token of techTokens) {
    if (/^\d+(?:\.\d+)?[kKwWmM]$/.test(token)) continue;
    for (const num of token.match(/\d+(?:\.\d+)?/g) ?? []) {
      out.add(num);
    }
  }
  return out;
}

function checkGreetingFacts(
  text: string,
  facts: string,
  prefs: GreetingPreferences,
  extraNotes?: string,
  jobTitle?: string,
): GreetingCheckIssue[] {
  const issues: GreetingCheckIssue[] = [];
  const normalizedText = text.normalize('NFKC');
  const normalizedFacts = facts.normalize('NFKC');

  // 允许列表时，行首序号（如 "1. "、"2) "）属于格式标号，不作为数字事实核验对象
  const textForNumbers = prefs.allowLists
    ? normalizedText.replace(/^\s*\d+[.)、]\s*/gm, '')
    : normalizedText;

  // 1. 候选人事实数字 vs 职位标题技术标识数字严格分离
  const numbers = /\d+(?:\.\d+)?/g;
  const candidateNumbers = new Set(normalizedFacts.match(numbers));
  const titleTechNumbers = extractTechTokenNumbers(jobTitle);

  // 候选人年限/成果/规模声明中的数字必须严格来自候选人匹配事实（禁止职位标题背书）
  const claimNumberPattern =
    /(\d+(?:\.\d+)?)\s*(?:\+|多|余|以上|左右)?\s*(?:年|个月|周|天|%|倍|万|千|亿|个|项|次|人|条|款)/g;
  const unverifiedClaimNumbers = new Set<string>();
  for (const m of textForNumbers.matchAll(claimNumberPattern)) {
    const num = m[1]!;
    if (!candidateNumbers.has(num)) unverifiedClaimNumbers.add(num);
  }

  const unverifiedOtherNumbers = [...new Set(textForNumbers.match(numbers))].filter(
    (n) => !candidateNumbers.has(n) && !titleTechNumbers.has(n) && !unverifiedClaimNumbers.has(n),
  );

  const allUnverified = [...new Set([...unverifiedClaimNumbers, ...unverifiedOtherNumbers])];
  if (allUnverified.length) {
    issues.push({
      kind: 'fact',
      message: `出现无法从候选匹配事实核对的数字（${allUnverified.join('、')}），请删除未经证实的年限或成果`,
    });
  }

  // 2. 检查明确中文数字年限（如“三年经验”“五年核心架构经验”）
  const cnYearPattern = /([一二两三四五六七八九十])\s*年(?:以上|多)?[\u4e00-\u9fa5]{0,6}?经验/g;
  const unverifiedCnYears: string[] = [];
  for (const m of normalizedText.matchAll(cnYearPattern)) {
    const cnDigit = m[1]!;
    const arabicDigit = CN_NUM_MAP[cnDigit];
    const hasCn = normalizedFacts.includes(`${cnDigit}年`);
    const hasArabic = arabicDigit
      ? normalizedFacts.includes(`${arabicDigit}年`) || candidateNumbers.has(arabicDigit)
      : false;
    if (!hasCn && !hasArabic) unverifiedCnYears.push(m[0]);
  }
  if (unverifiedCnYears.length) {
    issues.push({
      kind: 'fact',
      message: `出现无法从匹配点核对的年限表述（${[...new Set(unverifiedCnYears)].join('、')}），请删除或改为客观描述`,
    });
  }

  // 3. 检查是否明显违背 extraNotes 标注“仅自学/无项目经验”的技术边界
  if (extraNotes?.trim()) {
    const boundaryPattern = /([A-Za-z][A-Za-z0-9+#._-]{1,24})\s*(?:仅自学|只自学|只是自学|没有项目经验|无项目经验|未实战)/gi;
    for (const m of extraNotes.normalize('NFKC').matchAll(boundaryPattern)) {
      const tech = m[1]!;
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const overclaim = new RegExp(
        `${escaped}\\s*(?:实战|生产|商业项目|主导|负责.*?(?:上线|架构))`,
        'i',
      );
      if (overclaim.test(normalizedText)) {
        issues.push({
          kind: 'fact',
          message: `能力边界提示“${tech}”仅自学或无项目经验，请勿写成实战或生产经验`,
        });
      }
    }
  }

  return issues;
}

/** 只检查末尾相邻的收尾短句，避免把经历中的沟通协作写法当作客套话。 */
function hasRepeatedClosing(text: string): boolean {
  const clauses = text.trim().split(/[。！？!?，,；;\r\n]+/).map((clause) => clause.trim()).filter(Boolean);
  const invitation = /^(?:也|并|最后)?(?:我)?(?:希望|期待|想|有机会|如有机会)[^。！？!?]{0,26}?(?:沟通|交流|聊聊|面谈|详谈)/;
  const courtesy = /^(?:我?对.{1,24}(?:感兴趣|很有兴趣)|(?:感谢|谢谢)(?:您|招聘方|阅读))/;
  let invitations = 0;
  for (const clause of clauses.reverse()) {
    if (invitation.test(clause)) {
      invitations++;
      if (invitations > 1) return true;
    } else if (!courtesy.test(clause)) {
      break;
    }
  }
  return false;
}

/** 简洁模式中，将“有多个项目，包括甲、乙、丙”式开场交给模型归纳。 */
function hasProjectInventory(text: string): boolean {
  const introductions = /(?:多个|多项|若干|几个|几项|数个|三[个项]|四[个项]|一系列)[^，,。！？；\n]{0,24}(?:项目|作品|案例)[^，,。！？；\n]{0,12}[，,]?\s*(?:包括|例如|比如|分别(?:是|为))[：:]?\s*([^。！？；\n]+)/g;
  return Array.from(text.matchAll(introductions)).some(([, list]) =>
    (list ?? '').split(/、|[，,]?\s*(?:以及|还有)\s*/).filter((item) => item.trim()).length >= 3,
  );
}

function checkGreetingStyle(text: string, prefs: GreetingPreferences, writingRules?: string): GreetingCheckIssue[] {
  const issues: GreetingCheckIssue[] = [];

  if (prefs.singleParagraph && !prefs.allowLists && /[\r\n\u2028\u2029]/.test(text)) {
    issues.push({ kind: 'style', message: '存在换行，应为一段话' });
  }

  if (
    !prefs.allowLists &&
    /^\s*(?:[-*•·]|[0-9一二三四五六七八九十]+[.、)）]|#{1,6}\s|(?:打招呼语|开场白|问候语)\s*[:：])/m.test(text)
  ) {
    issues.push({ kind: 'style', message: '使用了分点或标题' });
  }

  if (prefs.maxChars !== null && prefs.maxChars > 0) {
    const length = text.replace(/\s/g, '').length;
    if (length > prefs.maxChars) {
      const hint = prefs.targetLengthHint
        ? `请控制在 ${prefs.targetLengthHint} 字`
        : '请适当精简';
      issues.push({
        kind: 'style',
        message: `长度 ${length} 字，超过 ${prefs.maxChars} 字，${hint}`,
      });
    }
  }

  if (hasRepeatedClosing(text)) {
    issues.push({ kind: 'style', message: '结尾重复表达沟通意愿。删掉多余的邀约，保留用户指定的固定结尾或一句简短邀请。' });
  }

  const requestsProjectNames = /(?:^|[\n。；;，,：:])\s*(?:请|可以|可|必须|需要|允许)?\s*(?:列出|列举|列明|逐项写|逐个写|保留|写出|写明|提及|提到)[^。；;\r\n，,]{0,18}(?:项目名|作品名|项目标题|案例名|具体项目|代表项目)/.test(writingRules ?? '');
  if (prefs.preset === 'concise' && !prefs.allowLists && !requestsProjectNames && hasProjectInventory(text)) {
    issues.push({ kind: 'style', message: '开头罗列了多个项目。把同类项目归纳为与岗位有关的经验，用已有事实说明能承担的任务或掌握的方法，再补充一项互补经历。' });
  }

  return issues;
}

function resolveCheckPreferences(opts?: Partial<GreetingPreferences> | CheckGreetingOptions): {
  prefs: GreetingPreferences;
  writingRules?: string;
  extraNotes?: string;
  jobTitle?: string;
} {
  if (!opts) return { prefs: { ...DEFAULT_GREETING_PREFERENCES, maxChars: GREETING_MAX_CHARS } };
  if ('preferences' in opts || 'writingRules' in opts || 'extraNotes' in opts || 'jobTitle' in opts) {
    const o = opts as CheckGreetingOptions;
    return {
      prefs: { ...DEFAULT_GREETING_PREFERENCES, maxChars: GREETING_MAX_CHARS, ...(o.preferences ?? {}) },
      writingRules: o.writingRules,
      extraNotes: o.extraNotes,
      jobTitle: o.jobTitle,
    };
  }
  return {
    prefs: { ...DEFAULT_GREETING_PREFERENCES, maxChars: GREETING_MAX_CHARS, ...(opts as Partial<GreetingPreferences>) },
  };
}

/**
 * 返回分类后的检查结果（structure / fact / style）。
 * 默认（不传配置时）保持一段话、不分点、160 字上限的默认检查行为；传入用户实际配置后严格按配置执行。
 */
export function checkGreetingDetailed(
  text: string,
  facts: string,
  options?: Partial<GreetingPreferences> | CheckGreetingOptions,
): GreetingCheckIssue[] {
  if (!text || !text.trim()) return [{ kind: 'structure', message: '内容为空' }];
  const { prefs, writingRules, extraNotes, jobTitle } = resolveCheckPreferences(options);
  return [
    ...checkGreetingStyle(text, prefs, writingRules),
    ...checkGreetingFacts(text, facts, prefs, extraNotes, jobTitle),
  ];
}

/**
 * 返回未通过的检查项（中文，可直接作为重写反馈）。
 * facts：匹配点和职位标题，用于提示没有依据的数字或明显事实冲突，不替代人工事实核对。
 */
export function checkGreeting(
  text: string,
  facts: string,
  options?: Partial<GreetingPreferences> | CheckGreetingOptions,
): string[] {
  return checkGreetingDetailed(text, facts, options).map((issue) => issue.message);
}
