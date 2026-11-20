import type {
  AppSettings,
  EffectiveGreetingConfig,
  GreetingExample,
  GreetingPreferences,
  GreetingPresetId,
  ProfileFact,
  UserProfile,
} from '../shared/types';
import { AppError } from '../shared/errors';
import { isRecord } from '../shared/json';

// Profile CRUD、三级规则解析、预设模板与数据迁移纯函数（存储 IO 在 storage/）。

export const DEFAULT_GREETING_RULES = `不主动谈薪资、到岗时间等条件。
固定结尾：“对贵司该岗位很感兴趣，希望有机会进一步沟通！”`;

export const DEFAULT_GLOBAL_GREETING_RULES = '';

export const DEFAULT_GREETING_PREFERENCES: GreetingPreferences = {
  preset: 'concise',
  maxPoints: 4,
  allowGapExplanation: false,
  singleParagraph: true,
  allowLists: false,
  maxChars: 160,
  targetLengthHint: '80–140',
  useExamples: true,
};

export interface GreetingPreset {
  id: GreetingPresetId;
  label: string;
  description: string;
  rules: string;
  preferences: GreetingPreferences;
}

export const GREETING_PRESETS: Record<GreetingPresetId, GreetingPreset> = {
  concise: {
    id: 'concise',
    label: '简洁自然',
    description: '一段话直奔主题，突出最核心的匹配点，控制篇幅。',
    rules: `突出与当前岗位最直接相关的核心能力，不复述整份简历，用自然、克制的职业口吻沟通。
不主动谈薪资、到岗时间等条件。
固定结尾：“对贵司该岗位很感兴趣，希望有机会进一步沟通！”`,
    preferences: { ...DEFAULT_GREETING_PREFERENCES, preset: 'concise' },
  },
  technical: {
    id: 'technical',
    label: '技术详细',
    description: '允许较充裕篇幅与分段，展开技术栈、架构设计与工程实践细节。',
    rules: `重点展开与岗位匹配的核心技术架构、工程实现和关键技术选型细节，可保留必要的技术术语。
允许分段组织核心亮点，不必过度压缩技术细节。
固定结尾：“对贵司该岗位很感兴趣，期待有机会交流技术细节！”`,
    preferences: {
      preset: 'technical',
      maxPoints: 5,
      allowGapExplanation: false,
      singleParagraph: false,
      allowLists: false,
      maxChars: 300,
      targetLengthHint: '140–260',
      useExamples: true,
    },
  },
  achievement: {
    id: 'achievement',
    label: '突出项目成果',
    description: '聚焦业务问题、实际交付角色和可验证的项目成果与指标。',
    rules: `优先围绕岗位最关注的项目交付场景，讲清解决的问题、个人实际承担的职责和已验证的成果。
尽量将相近项目经验整合成有说服力的表达，避免流水账式罗列。
固定结尾：“对贵司该岗位很感兴趣，希望能进一步沟通项目细节！”`,
    preferences: {
      preset: 'achievement',
      maxPoints: 4,
      allowGapExplanation: false,
      singleParagraph: true,
      allowLists: false,
      maxChars: 220,
      targetLengthHint: '110–190',
      useExamples: true,
    },
  },
  custom: {
    id: 'custom',
    label: '自定义',
    description: '完全按自定义规则文本与校验参数生成，不套用固定风格模板。',
    rules: '',
    preferences: {
      preset: 'custom',
      maxPoints: 4,
      allowGapExplanation: false,
      singleParagraph: true,
      allowLists: false,
      maxChars: null,
      targetLengthHint: undefined,
      useExamples: true,
    },
  },
};

export type ProfileInput = Omit<UserProfile, 'id' | 'version' | 'createdAt' | 'updatedAt'>;
export type ProfilePatch = Partial<ProfileInput>;

/** 进入分析 Prompt 的字段：只有它们变化时 version +1。 */
export const VERSIONED_FIELDS = [
  'summary',
  'facts',
  'extraNotes',
  'targetRoles',
  'preferredLocations',
  'salaryPreference',
  'greetingRules',
  'greetingPreferences',
] as const satisfies readonly (keyof UserProfile)[];

function cleanList(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
}

export function normalizeProfileFact(raw: Partial<ProfileFact>): ProfileFact | null {
  const fact = typeof raw.fact === 'string' ? raw.fact.trim() : '';
  if (!fact) return null;
  const skills = Array.isArray(raw.skills)
    ? cleanList(raw.skills.filter((s): s is string => typeof s === 'string'))
    : [];
  const out: ProfileFact = {
    fact,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : '简历/手动补充',
    experienceType:
      typeof raw.experienceType === 'string' && raw.experienceType.trim() ? raw.experienceType.trim() : '其他',
    participationLevel:
      typeof raw.participationLevel === 'string' && raw.participationLevel.trim()
        ? raw.participationLevel.trim()
        : '参与',
    skills,
  };
  if (typeof raw.id === 'string' && raw.id.trim()) out.id = raw.id.trim();
  if (typeof raw.outcomes === 'string' && raw.outcomes.trim()) out.outcomes = raw.outcomes.trim();
  if (typeof raw.constraints === 'string' && raw.constraints.trim()) out.constraints = raw.constraints.trim();
  return out;
}

export function normalizeProfileFacts(facts: ProfileFact[] | undefined): ProfileFact[] | undefined {
  if (facts === undefined) return undefined;
  return facts.map((f) => normalizeProfileFact(f)).filter((f): f is ProfileFact => f !== null);
}

export function normalizeGreetingPreferences(
  prefs: Partial<GreetingPreferences> | undefined,
): Partial<GreetingPreferences> | undefined {
  if (!prefs) return undefined;
  const out: Partial<GreetingPreferences> = {};
  if (prefs.preset && prefs.preset in GREETING_PRESETS) out.preset = prefs.preset;
  if (typeof prefs.maxPoints === 'number' && Number.isFinite(prefs.maxPoints)) {
    out.maxPoints = Math.min(8, Math.max(1, Math.round(prefs.maxPoints)));
  }
  if (typeof prefs.allowGapExplanation === 'boolean') out.allowGapExplanation = prefs.allowGapExplanation;
  if (typeof prefs.singleParagraph === 'boolean') out.singleParagraph = prefs.singleParagraph;
  if (typeof prefs.allowLists === 'boolean') out.allowLists = prefs.allowLists;
  if (prefs.maxChars === null) {
    out.maxChars = null;
  } else if (typeof prefs.maxChars === 'number' && Number.isFinite(prefs.maxChars)) {
    out.maxChars = prefs.maxChars <= 0 ? null : Math.min(2000, Math.max(20, Math.round(prefs.maxChars)));
  }
  if (typeof prefs.targetLengthHint === 'string') {
    const h = prefs.targetLengthHint.trim();
    if (h) out.targetLengthHint = h;
  }
  if (typeof prefs.useExamples === 'boolean') out.useExamples = prefs.useExamples;
  return out;
}

function normalize<T extends ProfilePatch>(p: T): T {
  const out = { ...p };
  if (out.name !== undefined) out.name = out.name.trim();
  if (out.summary !== undefined) out.summary = out.summary.trim();
  if (out.facts !== undefined) out.facts = normalizeProfileFacts(out.facts);
  if (out.extraNotes !== undefined) out.extraNotes = out.extraNotes.trim();
  if (out.greetingRules !== undefined) out.greetingRules = out.greetingRules.trim();
  if (out.greetingPreferences !== undefined) {
    out.greetingPreferences = normalizeGreetingPreferences(out.greetingPreferences);
  }
  if (out.targetRoles !== undefined) out.targetRoles = cleanList(out.targetRoles);
  if (out.preferredLocations !== undefined) out.preferredLocations = cleanList(out.preferredLocations);
  if (out.salaryPreference !== undefined) {
    const s = out.salaryPreference.trim();
    out.salaryPreference = s || undefined;
  }
  return out;
}

export function validateProfile(p: Pick<UserProfile, 'name' | 'summary'>): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('档案名称不能为空');
  if (!p.summary.trim()) errors.push('档案摘要不能为空');
  return errors;
}

function assertValid(p: Pick<UserProfile, 'name' | 'summary'>) {
  const errors = validateProfile(p);
  if (errors.length) throw new AppError('PROFILE_INVALID', errors.join('；'));
}

export function newProfileId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfile(input: ProfileInput, now = new Date(), id = newProfileId()): UserProfile {
  const n = normalize(input) as ProfileInput;
  assertValid(n);
  const ts = now.toISOString();
  return { ...n, id, version: 1, createdAt: ts, updatedAt: ts };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => sameValue(a[k], b[k]));
  }
  return (a ?? '') === (b ?? '');
}

export function updateProfile(old: UserProfile, patch: ProfilePatch, now = new Date()): UserProfile {
  const n = normalize(patch);
  const next: UserProfile = { ...old, ...n };
  if ('salaryPreference' in n && n.salaryPreference === undefined) delete next.salaryPreference;
  if ('greetingPreferences' in n && n.greetingPreferences === undefined) delete next.greetingPreferences;
  if ('facts' in n && n.facts === undefined) delete next.facts;
  assertValid(next);
  const bump = VERSIONED_FIELDS.some((k) => sameValue(old[k], next[k]) === false);
  const anyChange = (Object.keys(n) as (keyof ProfileInput)[]).some((k) => !sameValue(old[k], next[k]));
  if (!anyChange) return old;
  return {
    ...next,
    version: bump ? old.version + 1 : old.version,
    updatedAt: now.toISOString(),
  };
}

export function upsertProfile(list: UserProfile[], profile: UserProfile): UserProfile[] {
  const idx = list.findIndex((p) => p.id === profile.id);
  if (idx < 0) return [...list, profile];
  const copy = list.slice();
  copy[idx] = profile;
  return copy;
}

/** 删除 Profile，并返回新的 activeProfileId（若删除的是当前项则切换到剩余第一个或 null）。 */
export function removeProfile(
  list: UserProfile[],
  id: string,
  activeId: string | null,
): { profiles: UserProfile[]; activeProfileId: string | null } {
  const profiles = list.filter((p) => p.id !== id);
  let activeProfileId = activeId;
  if (activeId === id || (activeId && !profiles.some((p) => p.id === activeId))) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  return { profiles, activeProfileId };
}

/** 解析逗号/顿号/换行分隔的列表输入。 */
export function parseListInput(text: string): string[] {
  return cleanList(text.split(/[,，、;；\n]/));
}

// ---------- 三级规则解析与迁移 ----------

function mergePreferences(
  base: GreetingPreferences,
  patch: Partial<GreetingPreferences> | undefined,
): GreetingPreferences {
  const clean = normalizeGreetingPreferences(patch);
  if (!clean) return base;
  const next = { ...base, ...clean };
  if (clean.maxChars === null) delete next.targetLengthHint;
  return next;
}

/**
 * 从用户自由填写的规则文本中识别显式格式/长度/选材指令。
 * 按行顺序执行，确保同一层内后配置覆盖先配置，高优先级层级覆盖低优先级层级。
 */
export function applyRuleTextDirectives(base: GreetingPreferences, ruleText: string): GreetingPreferences {
  const trimmed = ruleText.trim();
  if (!trimmed) return base;
  const next: GreetingPreferences = { ...base };

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. 列表 / 分点
    const explicitlySingle = /(?:不分段|一段话|单段|不要换行|禁止换行|不换行)/.test(line);
    if (/(?:禁止分点|不要分点|不用分点|禁止列表|不要列表|不使用列表|不分点)/.test(line)) {
      next.allowLists = false;
    } else if (/(?:分点|列表|逐条|条列|编号|使用清单|用项目符号)/.test(line)) {
      next.allowLists = true;
      if (!explicitlySingle) next.singleParagraph = false;
    }

    // 2. 段落 / 换行
    if (explicitlySingle) {
      next.singleParagraph = true;
    } else if (/(?:分段|多段|允许换行|可换行|换行)/.test(line)) {
      next.singleParagraph = false;
    }

    // 3. 长度限制
    if (/(?:不限字数|无字数限制|不限制字数|字数不限)/.test(line)) {
      next.maxChars = null;
      delete next.targetLengthHint;
    } else {
      const rangeMatch = /(\d{2,4})\s*[-~～到至]\s*(\d{2,4})\s*字/.exec(line);
      const capMatch = /(?:不超过|控制在|最多|限|小于|约|大约)?\s*(\d{2,4})\s*字(?:以内|以下|左右)?/.exec(line);
      if (rangeMatch) {
        const min = Number(rangeMatch[1]);
        const max = Number(rangeMatch[2]);
        if (max >= 20 && max >= min) {
          next.targetLengthHint = `${min}–${max}`;
          next.maxChars = Math.min(2000, max + Math.max(20, Math.round(max * 0.15)));
        }
      } else if (capMatch) {
        const cap = Number(capMatch[1]);
        if (cap >= 20) {
          const isApprox = /左右|约/.test(capMatch[0]);
          next.maxChars = isApprox ? Math.min(2000, Math.round(cap * 1.2)) : cap;
          next.targetLengthHint = isApprox ? `约 ${cap}` : `≤ ${cap}`;
        }
      } else if (/(?:非常简短|极简|一两句话|两句话以内|简短一两句)/.test(line)) {
        next.maxChars = 90;
        next.targetLengthHint = '30–80';
      } else if (/(?:详细|长文|充裕|全面介绍|详细自荐|展开介绍)/.test(line)) {
        if (next.maxChars !== null && next.maxChars < 350) {
          next.maxChars = 350;
          next.targetLengthHint = '150–320';
        }
      }
    }

    // 4. 能力缺口 / 短板策略
    if (/(?:不主动提及|不要提及|不提|不写|回避|不暴露).*?(?:短板|不足|差距|缺口)|只写优势/.test(line)) {
      next.allowGapExplanation = false;
    } else if (/(?:提及|说明|解释|包含|允许写).*?(?:短板|不足|差距|缺口)|坦诚说明/.test(line)) {
      next.allowGapExplanation = true;
    }

    // 5. 选材数量
    const pointsMatch =
      /(?:选择|挑选|挑|选出|保留|覆盖)\s*(\d+)(?:\s*[-~～到至]\s*(\d+))?\s*(?:个|条)?(?:匹配点|事实|素材|亮点|优势)/.exec(line);
    if (pointsMatch) {
      const n = Number(pointsMatch[2] ?? pointsMatch[1]);
      if (Number.isFinite(n) && n >= 1) next.maxPoints = Math.min(8, Math.max(1, n));
    }

    // 6. 样例参考开关
    if (/(?:不使用样例|关闭样例|不参考样例|忽略样例)/.test(line)) {
      next.useExamples = false;
    } else if (/(?:使用样例|参考样例|开启样例)/.test(line)) {
      next.useExamples = true;
    }
  }

  return next;
}

export interface ResolveGreetingConfigInput {
  settings?: Partial<AppSettings> | null;
  profile?: Partial<UserProfile> | null;
  temporaryRule?: string;
  temporaryPreferences?: Partial<GreetingPreferences>;
}

/**
 * 解析三级打招呼语配置：
 * 优先级：内置事实与安全约束 > 单次要求 > 档案专属规则 > 全局默认规则
 */
export function resolveGreetingConfig(input: ResolveGreetingConfigInput): EffectiveGreetingConfig {
  const globalRules = (input.settings?.globalGreetingRules ?? '').trim();
  const profileRules = (input.profile?.greetingRules ?? '').trim();
  const temporaryRule = (input.temporaryRule ?? '').trim();

  // 第 1 层：全局默认（文本指令先解析，显式结构化偏好可同层精确微调）
  let preferences = applyRuleTextDirectives({ ...DEFAULT_GREETING_PREFERENCES }, globalRules);
  preferences = mergePreferences(preferences, input.settings?.globalGreetingPreferences);

  // 第 2 层：档案专属（覆盖全局）
  preferences = applyRuleTextDirectives(preferences, profileRules);
  preferences = mergePreferences(preferences, input.profile?.greetingPreferences);

  // 第 3 层：单次生成补充要求（覆盖档案与全局）
  preferences = applyRuleTextDirectives(preferences, temporaryRule);
  preferences = mergePreferences(preferences, input.temporaryPreferences);

  const sections: string[] = [];
  if (globalRules) sections.push(`[全局默认规则]\n${globalRules}`);
  if (profileRules) sections.push(`[当前档案专属规则（覆盖全局规则）]\n${profileRules}`);
  if (temporaryRule) sections.push(`[本次单次补充要求（最高用户优先级）]\n${temporaryRule}`);

  const combinedRulesText = sections.join('\n\n');

  return {
    globalRules,
    profileRules,
    temporaryRule,
    combinedRulesText,
    preferences,
  };
}

export interface ExportedGreetingRulesConfig {
  version: 1;
  rules: string;
  preferences: Partial<GreetingPreferences>;
}

export function exportGreetingRulesConfig(
  rules: string,
  preferences?: Partial<GreetingPreferences>,
): string {
  const payload: ExportedGreetingRulesConfig = {
    version: 1,
    rules: rules.trim(),
    preferences: normalizeGreetingPreferences(preferences) ?? {},
  };
  return JSON.stringify(payload, null, 2);
}

export function importGreetingRulesConfig(
  rawJson: string,
): { rules: string; preferences: Partial<GreetingPreferences> } | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!isRecord(parsed)) return null;
    const rules = typeof parsed.rules === 'string' ? parsed.rules.trim() : '';
    const rawPrefs = isRecord(parsed.preferences)
      ? (parsed.preferences as Partial<GreetingPreferences>)
      : undefined;
    const preferences = normalizeGreetingPreferences(rawPrefs) ?? {};
    return { rules, preferences };
  } catch {
    return null;
  }
}

/**
 * 无损迁移老版本档案：
 * - 完整保留已保存的 greetingRules、summary、extraNotes、version 等字段；
 * - 规范化可选新字段（facts / greetingPreferences），绝不用默认模板覆盖用户内容。
 */
export function migrateProfile(raw: UserProfile): UserProfile {
  const migrated: UserProfile = {
    ...raw,
    name: typeof raw.name === 'string' ? raw.name : '',
    resumeFileName: typeof raw.resumeFileName === 'string' ? raw.resumeFileName : '',
    resumeText: typeof raw.resumeText === 'string' ? raw.resumeText : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    extraNotes: typeof raw.extraNotes === 'string' ? raw.extraNotes : '',
    targetRoles: Array.isArray(raw.targetRoles) ? cleanList(raw.targetRoles.filter((x): x is string => typeof x === 'string')) : [],
    preferredLocations: Array.isArray(raw.preferredLocations)
      ? cleanList(raw.preferredLocations.filter((x): x is string => typeof x === 'string'))
      : [],
    greetingRules: typeof raw.greetingRules === 'string' ? raw.greetingRules : '',
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
  if (Array.isArray(raw.facts)) {
    migrated.facts = normalizeProfileFacts(raw.facts);
  }
  if (isRecord(raw.greetingPreferences)) {
    const prefs = normalizeGreetingPreferences(raw.greetingPreferences as Partial<GreetingPreferences>);
    if (prefs && Object.keys(prefs).length > 0) migrated.greetingPreferences = prefs;
    else delete migrated.greetingPreferences;
  }
  return migrated;
}

export function migrateSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  const base: AppSettings = {
    activeProfileId: raw?.activeProfileId ?? null,
    llm: raw?.llm ?? null,
  };
  if (typeof raw?.globalGreetingRules === 'string' && raw.globalGreetingRules.trim()) {
    base.globalGreetingRules = raw.globalGreetingRules;
  } else if (raw?.globalGreetingRules === '') {
    base.globalGreetingRules = '';
  }
  if (isRecord(raw?.globalGreetingPreferences)) {
    const prefs = normalizeGreetingPreferences(raw.globalGreetingPreferences as Partial<GreetingPreferences>);
    if (prefs && Object.keys(prefs).length > 0) base.globalGreetingPreferences = prefs;
  }
  return base;
}

export function migrateGreetingExample(raw: GreetingExample): GreetingExample {
  const out: GreetingExample = {
    ...raw,
    points: Array.isArray(raw.points) ? raw.points.filter((p): p is string => typeof p === 'string') : [],
    preferred: Boolean(raw.preferred),
    roleTags: Array.isArray(raw.roleTags)
      ? cleanList(raw.roleTags.filter((t): t is string => typeof t === 'string'))
      : [],
  };
  return out;
}
