import type {
  AppSettings,
  ConflictPreferenceField,
  EffectiveGreetingConfig,
  GreetingExample,
  GreetingPreferences,
  GreetingPresetId,
  ProfileFact,
  RuleConflictResolution,
  RulePreferenceConflict,
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
  'selectionRules',
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
  if (prefs.conflictResolution === 'text' || prefs.conflictResolution === 'structured') {
    out.conflictResolution = prefs.conflictResolution;
  }
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
  if (out.selectionRules !== undefined) {
    const s = out.selectionRules.trim();
    out.selectionRules = s || undefined;
  }
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
  if ('selectionRules' in n && n.selectionRules === undefined) delete next.selectionRules;
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

// ---------- 三级规则解析、冲突检测与迁移 ----------

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
 * 仅提取自由文本规则中“显式出现”的参数指令（未提及的字段不产生覆盖）。
 * 同文本内按行顺序解析，保证后写配置覆盖先写配置。
 */
export function extractRuleTextDirectives(ruleText: string): Partial<GreetingPreferences> {
  const trimmed = ruleText.trim();
  if (!trimmed) return {};
  const extracted: Partial<GreetingPreferences> = {};

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. 列表 / 分点
    const explicitlySingle = /(?:不分段|一段话|单段|不要换行|禁止换行|不换行)/.test(line);
    if (/(?:禁止分点|不要分点|不用分点|禁止列表|不要列表|不使用列表|不分点)/.test(line)) {
      extracted.allowLists = false;
    } else if (/(?:分点|列表|逐条|条列|编号|使用清单|用项目符号)/.test(line)) {
      extracted.allowLists = true;
      if (!explicitlySingle) extracted.singleParagraph = false;
    }

    // 2. 段落 / 换行
    if (explicitlySingle) {
      extracted.singleParagraph = true;
    } else if (/(?:分段|多段|允许换行|可换行|换行)/.test(line)) {
      extracted.singleParagraph = false;
    }

    // 3. 长度限制
    if (/(?:不限字数|无字数限制|不限制字数|字数不限)/.test(line)) {
      extracted.maxChars = null;
      delete extracted.targetLengthHint;
    } else {
      const rangeMatch = /(\d{2,4})\s*[-~～到至]\s*(\d{2,4})\s*字/.exec(line);
      const capMatch = /(?:不超过|控制在|最多|限|小于|约|大约)?\s*(\d{2,4})\s*字(?:以内|以下|左右)?/.exec(line);
      if (rangeMatch) {
        const min = Number(rangeMatch[1]);
        const max = Number(rangeMatch[2]);
        if (max >= 20 && max >= min) {
          extracted.targetLengthHint = `${min}–${max}`;
          extracted.maxChars = Math.min(2000, max + Math.max(20, Math.round(max * 0.15)));
        }
      } else if (capMatch) {
        const cap = Number(capMatch[1]);
        if (cap >= 20) {
          const isApprox = /左右|约/.test(capMatch[0]);
          extracted.maxChars = isApprox ? Math.min(2000, Math.round(cap * 1.2)) : cap;
          extracted.targetLengthHint = isApprox ? `约 ${cap}` : `≤ ${cap}`;
        }
      } else if (/(?:非常简短|极简|一两句话|两句话以内|简短一两句)/.test(line)) {
        extracted.maxChars = 90;
        extracted.targetLengthHint = '30–80';
      } else if (/(?:详细|长文|充裕|全面介绍|详细自荐|展开介绍)/.test(line)) {
        if (extracted.maxChars === undefined || (extracted.maxChars !== null && extracted.maxChars < 350)) {
          extracted.maxChars = 350;
          extracted.targetLengthHint = '150–320';
        }
      }
    }

    // 4. 能力缺口 / 短板策略
    if (/(?:不主动提及|不要提及|不提|不写|回避|不暴露).*?(?:短板|不足|差距|缺口)|只写优势/.test(line)) {
      extracted.allowGapExplanation = false;
    } else if (/(?:提及|说明|解释|包含|允许写).*?(?:短板|不足|差距|缺口)|坦诚说明/.test(line)) {
      extracted.allowGapExplanation = true;
    }

    // 5. 选材数量
    const pointsMatch =
      /(?:选择|挑选|挑|选出|保留|覆盖)\s*(\d+)(?:\s*[-~～到至]\s*(\d+))?\s*(?:个|条)?(?:匹配点|事实|素材|亮点|优势)/.exec(line);
    if (pointsMatch) {
      const n = Number(pointsMatch[2] ?? pointsMatch[1]);
      if (Number.isFinite(n) && n >= 1) extracted.maxPoints = Math.min(8, Math.max(1, n));
    }

    // 6. 样例参考开关
    if (/(?:不使用样例|关闭样例|不参考样例|忽略样例)/.test(line)) {
      extracted.useExamples = false;
    } else if (/(?:使用样例|参考样例|开启样例)/.test(line)) {
      extracted.useExamples = true;
    }
  }

  return extracted;
}

/**
 * 从用户自由填写的规则文本中识别显式格式/长度/选材指令并应用到基础偏好上。
 */
export function applyRuleTextDirectives(base: GreetingPreferences, ruleText: string): GreetingPreferences {
  const directives = extractRuleTextDirectives(ruleText);
  if (Object.keys(directives).length === 0) return base;
  return mergePreferences(base, directives);
}

const PURE_WRITING_LINE_RE =
  /(?:字数|不超过|控制在|最多\s*\d+\s*字|以内|不限字数|分段|多段|一段话|单段|换行|分点|列表|逐条|编号|固定结尾|结尾\s*[:：]|不(?:主动)?谈薪|到岗时间|口吻|语气|客套话|样例)/;
const SELECTION_SIGNAL_RE =
  /(?:优先|突出|强调|侧重|重点|岗位|项目|经历|事实|技术|选材|素材|匹配点|短板|差距|缺口|不足|了解|参与|主导|业务|架构|工程|研发|测试|评测|安全|Agent|RAG|FDE)/i;

/**
 * 将混合规则文本拆分为：
 * - selectionLines：影响阶段 A 匹配选材与岗位重点的行（修改它们须使阶段 A 缓存失效）；
 * - writingLines：所有写作/格式规则行（仅修改纯表达格式行时，阶段 A 缓存保持命中）。
 */
export function splitSelectionAndWritingRules(ruleText: string): {
  selectionLines: string[];
  writingLines: string[];
} {
  const selectionLines: string[] = [];
  const writingLines: string[] = [];
  for (const raw of ruleText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    writingLines.push(line);
    const isPureWriting = PURE_WRITING_LINE_RE.test(line) && !SELECTION_SIGNAL_RE.test(line);
    if (!isPureWriting) selectionLines.push(line);
  }
  return { selectionLines, writingLines };
}

const CONFLICT_FIELD_LABELS: Record<ConflictPreferenceField, string> = {
  singleParagraph: '段落格式',
  allowLists: '分点/列表',
  maxChars: '字数上限',
  allowGapExplanation: '能力差距说明',
  maxPoints: '选材条数上限',
  useExamples: '样例参考',
};

function formatConflictFieldValue(field: ConflictPreferenceField, value: unknown): string {
  switch (field) {
    case 'singleParagraph':
      return value ? '单段（禁止换行）' : '允许分段';
    case 'allowLists':
      return value ? '允许分点/列表' : '禁止分点/列表';
    case 'maxChars':
      return value === null ? '不限字数' : `${String(value)} 字`;
    case 'allowGapExplanation':
      return value ? '允许解释差距' : '不主动提及短板';
    case 'maxPoints':
      return `最多 ${String(value)} 条`;
    case 'useExamples':
      return value ? '参考样例' : '关闭样例';
  }
}

function collectLayerConflicts(
  layer: 'global' | 'profile' | 'temporary',
  textDirectives: Partial<GreetingPreferences>,
  structuredPrefs: Partial<GreetingPreferences> | undefined,
  resolution: RuleConflictResolution,
): RulePreferenceConflict[] {
  if (!structuredPrefs) return [];
  const conflicts: RulePreferenceConflict[] = [];
  const fields: readonly ConflictPreferenceField[] = [
    'singleParagraph',
    'allowLists',
    'maxChars',
    'allowGapExplanation',
    'maxPoints',
    'useExamples',
  ];
  for (const field of fields) {
    const tVal = textDirectives[field];
    const sVal = structuredPrefs[field];
    if (tVal === undefined || sVal === undefined || tVal === sVal) continue;
    const resolved = resolution === 'structured' ? sVal : tVal;
    conflicts.push({
      layer,
      field,
      label: CONFLICT_FIELD_LABELS[field],
      textValue: formatConflictFieldValue(field, tVal),
      structuredValue: formatConflictFieldValue(field, sVal),
      resolvedValue: formatConflictFieldValue(field, resolved),
    });
  }
  return conflicts;
}

/** 仅返回与基线不同的显式修改项，避免无意持久化默认校验值覆盖文本指令。 */
export function diffGreetingPreferences(
  current: GreetingPreferences,
  baseline: GreetingPreferences = DEFAULT_GREETING_PREFERENCES,
): Partial<GreetingPreferences> {
  const out: Partial<GreetingPreferences> = {};
  if (current.preset && current.preset !== baseline.preset) out.preset = current.preset;
  if (current.conflictResolution && current.conflictResolution !== baseline.conflictResolution) {
    out.conflictResolution = current.conflictResolution;
  }
  if (current.maxPoints !== baseline.maxPoints) out.maxPoints = current.maxPoints;
  if (current.allowGapExplanation !== baseline.allowGapExplanation) {
    out.allowGapExplanation = current.allowGapExplanation;
  }
  if (current.singleParagraph !== baseline.singleParagraph) out.singleParagraph = current.singleParagraph;
  if (current.allowLists !== baseline.allowLists) out.allowLists = current.allowLists;
  if (current.maxChars !== baseline.maxChars) out.maxChars = current.maxChars;
  if (current.targetLengthHint !== baseline.targetLengthHint && current.targetLengthHint) {
    out.targetLengthHint = current.targetLengthHint;
  }
  if (current.useExamples !== baseline.useExamples) out.useExamples = current.useExamples;
  return out;
}

export interface ResolveGreetingConfigInput {
  settings?: Partial<AppSettings> | null;
  profile?: Partial<UserProfile> | null;
  temporaryRule?: string;
  temporaryPreferences?: Partial<GreetingPreferences>;
}

/**
 * 解析三级打招呼语配置：
 * - 优先级：内置事实与安全约束 > 单次要求 > 档案专属规则 > 全局默认规则
 * - 同层自由文本规则与结构化参数冲突时，默认以文字规则为准（可通过 conflictResolution: 'structured' 显式切换），并输出冲突明细供界面提示。
 * - 同时输出拆分后的 effectiveSelectionRules（阶段 A）与 effectiveWritingRules（阶段 B）。
 */
export function resolveGreetingConfig(input: ResolveGreetingConfigInput): EffectiveGreetingConfig {
  const globalRules = (input.settings?.globalGreetingRules ?? '').trim();
  const profileRules = (input.profile?.greetingRules ?? '').trim();
  const temporaryRule = (input.temporaryRule ?? '').trim();

  const globalSelection = (input.settings?.globalSelectionRules ?? '').trim();
  const profileSelection = (input.profile?.selectionRules ?? '').trim();

  const globalStruct = normalizeGreetingPreferences(input.settings?.globalGreetingPreferences);
  const profileStruct = normalizeGreetingPreferences(input.profile?.greetingPreferences);
  const tempStruct = normalizeGreetingPreferences(input.temporaryPreferences);

  const globalText = extractRuleTextDirectives(globalRules);
  const profileText = extractRuleTextDirectives(profileRules);
  const tempText = extractRuleTextDirectives(temporaryRule);

  const globalResolution: RuleConflictResolution = globalStruct?.conflictResolution ?? 'text';
  const profileResolution: RuleConflictResolution =
    profileStruct?.conflictResolution ?? globalResolution;
  const tempResolution: RuleConflictResolution =
    tempStruct?.conflictResolution ?? profileResolution;

  const conflicts: RulePreferenceConflict[] = [
    ...collectLayerConflicts('global', globalText, globalStruct, globalResolution),
    ...collectLayerConflicts('profile', profileText, profileStruct, profileResolution),
    ...collectLayerConflicts('temporary', tempText, tempStruct, tempResolution),
  ];

  const applyLayer = (
    base: GreetingPreferences,
    textDir: Partial<GreetingPreferences>,
    structDir: Partial<GreetingPreferences> | undefined,
    resolution: RuleConflictResolution,
  ): GreetingPreferences => {
    if (resolution === 'structured') {
      return mergePreferences(mergePreferences(base, textDir), structDir);
    }
    return mergePreferences(mergePreferences(base, structDir), textDir);
  };

  let preferences = { ...DEFAULT_GREETING_PREFERENCES };
  preferences = applyLayer(preferences, globalText, globalStruct, globalResolution);
  preferences = applyLayer(preferences, profileText, profileStruct, profileResolution);
  preferences = applyLayer(preferences, tempText, tempStruct, tempResolution);

  const writingSections: string[] = [];
  if (globalRules) writingSections.push(`[全局默认规则]\n${globalRules}`);
  if (profileRules) writingSections.push(`[当前档案专属规则（覆盖全局规则）]\n${profileRules}`);
  if (temporaryRule) writingSections.push(`[本次单次补充要求（最高用户优先级）]\n${temporaryRule}`);

  const combinedRulesText = writingSections.join('\n\n');

  const gSel = splitSelectionAndWritingRules(globalRules).selectionLines.join('\n');
  const pSel = splitSelectionAndWritingRules(profileRules).selectionLines.join('\n');
  const tSel = splitSelectionAndWritingRules(temporaryRule).selectionLines.join('\n');

  const selectionSections: string[] = [];
  const mergedGlobalSel = [globalSelection, gSel].filter(Boolean).join('\n');
  const mergedProfileSel = [profileSelection, pSel].filter(Boolean).join('\n');
  if (mergedGlobalSel) selectionSections.push(`[全局选材偏好]\n${mergedGlobalSel}`);
  if (mergedProfileSel) selectionSections.push(`[当前档案选材规则（覆盖全局）]\n${mergedProfileSel}`);
  if (tSel) selectionSections.push(`[本次补充选材要求]\n${tSel}`);

  return {
    globalRules,
    profileRules,
    temporaryRule,
    combinedRulesText,
    effectiveSelectionRules: selectionSections.join('\n\n'),
    effectiveWritingRules: combinedRulesText,
    conflicts,
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
  if (typeof raw.selectionRules === 'string' && raw.selectionRules.trim()) {
    migrated.selectionRules = raw.selectionRules.trim();
  }
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
  if (typeof raw?.globalSelectionRules === 'string' && raw.globalSelectionRules.trim()) {
    base.globalSelectionRules = raw.globalSelectionRules.trim();
  }
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
