import type { GreetingCheckIssue, GreetingPreferences } from '../shared/types';
import { DEFAULT_GREETING_PREFERENCES } from '../profile/manager';

// 打招呼语的本地校验（分为结构、事实、风格三类）：只做确定性规则检查，不额外调用模型。
// 注意：本地事实检查仅能发现部分表面矛盾（如无依据数字、年限或明确边界冲突），不能证明全部陈述真实，仍须人工核对。

/** 默认简洁模式下留出固定结尾的余量，超过即触发定向重写。 */
export const GREETING_MAX_CHARS = 160;

export interface CheckGreetingOptions {
  preferences?: Partial<GreetingPreferences>;
  extraNotes?: string;
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

function checkGreetingFacts(
  text: string,
  facts: string,
  prefs: GreetingPreferences,
  extraNotes?: string,
): GreetingCheckIssue[] {
  const issues: GreetingCheckIssue[] = [];
  const normalizedText = text.normalize('NFKC');
  const normalizedFacts = facts.normalize('NFKC');

  // 允许列表时，行首序号（如 "1. "、"2) "）属于格式标号，不作为数字事实核验对象
  const textForNumbers = prefs.allowLists
    ? normalizedText.replace(/^\s*\d+[.)、]\s*/gm, '')
    : normalizedText;

  // 1. 检查阿拉伯数字是否有匹配点或职位标题依据
  const numbers = /\d+(?:\.\d+)?/g;
  const supported = new Set(normalizedFacts.match(numbers));
  const unverified = [...new Set(textForNumbers.match(numbers))].filter((n) => !supported.has(n));
  if (unverified.length) {
    issues.push({
      kind: 'fact',
      message: `出现无法从匹配点或职位标题核对的数字（${unverified.join('、')}），请删除未经证实的年限或成果`,
    });
  }

  // 2. 检查明确中文数字年限（如“三年经验”“五年核心架构经验”）
  const cnYearPattern = /([一二两三四五六七八九十])\s*年(?:以上|多)?[\u4e00-\u9fa5]{0,6}?经验/g;
  const unverifiedCnYears: string[] = [];
  for (const m of normalizedText.matchAll(cnYearPattern)) {
    const cnDigit = m[1]!;
    const arabicDigit = CN_NUM_MAP[cnDigit];
    const hasCn = normalizedFacts.includes(`${cnDigit}年`);
    const hasArabic = arabicDigit ? normalizedFacts.includes(`${arabicDigit}年`) || supported.has(arabicDigit) : false;
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

function checkGreetingStyle(text: string, prefs: GreetingPreferences): GreetingCheckIssue[] {
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

  return issues;
}

function resolveCheckPreferences(opts?: Partial<GreetingPreferences> | CheckGreetingOptions): {
  prefs: GreetingPreferences;
  extraNotes?: string;
} {
  if (!opts) return { prefs: { ...DEFAULT_GREETING_PREFERENCES, maxChars: GREETING_MAX_CHARS } };
  if ('preferences' in opts || 'extraNotes' in opts) {
    const o = opts as CheckGreetingOptions;
    return {
      prefs: { ...DEFAULT_GREETING_PREFERENCES, maxChars: GREETING_MAX_CHARS, ...(o.preferences ?? {}) },
      extraNotes: o.extraNotes,
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
  const { prefs, extraNotes } = resolveCheckPreferences(options);
  return [
    ...checkGreetingStyle(text, prefs),
    ...checkGreetingFacts(text, facts, prefs, extraNotes),
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
