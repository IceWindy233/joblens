import type {
  AnalysisResult,
  AppSettings,
  EffectiveGreetingConfig,
  GreetingCheckIssue,
  GreetingContext,
  GreetingExample,
  GreetingPreferences,
  GreetingStyleExample,
  Job,
  LLMConfig,
  UserProfile,
} from '../shared/types';
import { AppError } from '../shared/errors';
import { parseModelJSON } from '../shared/json';
import { isJob } from '../shared/messages';
import { cyrb53, squashWhitespace } from '../shared/text';
import { chatCompletion, type ChatMessage } from '../llm/client';
import { resolveGreetingConfig } from '../profile/manager';
import { calibrateMatchAnalysis, type MatchAssessment } from './calibrate';
import {
  ANALYSIS_PROMPT_VERSION,
  GREETING_PROMPT_VERSION,
  buildAnalysisMessages,
  buildGreetingMessages,
  buildGreetingRevision,
} from './prompts';
import { validateAnalysisPayload } from './schema';
import { checkGreetingDetailed, cleanGreeting } from './greeting';
import { selectGreetingExamples } from './greeting-examples';

export interface AnalyzeInput {
  job: Job;
  profile: UserProfile;
  /** 已保存的样例；仅选用当前档案里与职位相近的 0–3 条。 */
  examples: GreetingExample[];
  config: LLMConfig;
  apiKey: string;
  signal?: AbortSignal;
  /** 可选全局设置（用于合并全局规则与偏好） */
  settings?: Partial<AppSettings>;
  /** 仅用于本次打招呼语撰写的补充要求。 */
  temporaryRule?: string;
  /** 可选单次偏好覆盖 */
  temporaryPreferences?: Partial<GreetingPreferences>;
  /** 显式控制本次是否参考样例（优先级高于规则中的 useExamples） */
  useExamples?: boolean;
}

export interface AnalyzeDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface CacheKeyOptions {
  model?: string;
  baseURL?: string;
  rulesHash?: string;
  examplesHash?: string;
  promptVersion?: string;
}

export interface MatchAnalysisResult extends MatchAssessment {
  jobFingerprint: string;
  jobContentHash: string;
  profileId: string;
  profileVersion: number;
  model: string;
  analysisCacheKey: string;
  createdAt: string;
}

export interface GenerateGreetingInput {
  job: Job;
  points: string[];
  greetingContext?: GreetingContext;
  profile: UserProfile;
  examples: GreetingExample[];
  config: LLMConfig;
  apiKey: string;
  signal?: AbortSignal;
  settings?: Partial<AppSettings>;
  temporaryRule?: string;
  temporaryPreferences?: Partial<GreetingPreferences>;
  useExamples?: boolean;
}

export interface GenerateGreetingOutput {
  greeting: string;
  greetingIssues: string[];
  greetingIssueDetails: GreetingCheckIssue[];
  effectiveRules: string;
  effectivePreferences: GreetingPreferences;
  greetingCacheKey: string;
  selectedExamplesCount: number;
  greetingStyleExamples: GreetingStyleExample[];
  model: string;
  createdAt: string;
}

/**
 * 兼容旧版调用方式：仅传前三个参数时返回 `fingerprint\0profileId\0version`；
 * 传入 extra 时附带模型、Prompt 版本与配置摘要。
 */
export function resultKey(
  fingerprint: string,
  profileId: string,
  version: number,
  extra?: CacheKeyOptions,
): string {
  const base = `${fingerprint}\u0000${profileId}\u0000${version}`;
  if (!extra) return base;
  return [
    base,
    extra.baseURL ?? '',
    extra.model ?? '',
    extra.promptVersion ?? '',
    extra.rulesHash ?? '',
    extra.examplesHash ?? '',
  ].join('\u0000');
}

/** 计算规范化后的 JD 正文内容哈希（检测同一职位 ID 下 JD 内容更新）。 */
export function computeJobContentHash(job: Pick<Job, 'title' | 'company' | 'description'>): string {
  return cyrb53([job.title, job.company, job.description].map(squashWhitespace).join('|'));
}

/** 计算档案核心事实指纹（不含纯写作规则，避免修改写作风格时误使匹配分析失效）。 */
export function profileFactsFingerprint(profile: UserProfile): string {
  return cyrb53(
    JSON.stringify({
      summary: profile.summary,
      facts: profile.facts ?? [],
      extraNotes: profile.extraNotes,
    }),
  );
}

/**
 * 阶段 A 匹配分析缓存键：
 * 包含 JD 指纹、JD 内容哈希、Profile ID、档案事实指纹、选材规则（selectionRules）、选材参数、模型与 Prompt 版本。
 */
export function buildAnalysisCacheKey(input: {
  jobFingerprint: string;
  jobContentHash?: string;
  job?: Pick<Job, 'title' | 'company' | 'description'>;
  profile: UserProfile;
  config: LLMConfig;
  preferences: Pick<GreetingPreferences, 'maxPoints' | 'allowGapExplanation'>;
  selectionRules?: string;
}): string {
  const contentHash = input.jobContentHash ?? (input.job ? computeJobContentHash(input.job) : '');
  const factsHash = profileFactsFingerprint(input.profile);
  const analysisParamsHash = cyrb53(
    JSON.stringify({
      maxPoints: input.preferences.maxPoints,
      allowGapExplanation: input.preferences.allowGapExplanation,
      selectionRules: (input.selectionRules ?? '').trim(),
    }),
  );
  return [
    'A',
    ANALYSIS_PROMPT_VERSION,
    input.jobFingerprint,
    contentHash,
    input.profile.id,
    factsHash,
    input.config.baseURL,
    input.config.model,
    analysisParamsHash,
  ].join('\u0000');
}

/** 阶段 B 打招呼语缓存键：JD 指纹 + JD 内容哈希 + Profile ID + 模型 + 写作规则与参数 + 样例摘要 + 匹配素材 + Prompt 版本。 */
export function buildGreetingCacheKey(input: {
  jobFingerprint: string;
  jobContentHash?: string;
  job?: Pick<Job, 'title' | 'company' | 'description'>;
  profileId: string;
  config: LLMConfig;
  points: string[];
  greetingContext?: GreetingContext;
  effectiveRules: string;
  preferences: GreetingPreferences;
  examples: GreetingExample[];
}): string {
  const contentHash = input.jobContentHash ?? (input.job ? computeJobContentHash(input.job) : '');
  const pointsHash = cyrb53(JSON.stringify([input.points, input.greetingContext]));
  const rulesHash = cyrb53(
    JSON.stringify({
      effectiveRules: input.effectiveRules,
      preferences: input.preferences,
    }),
  );
  const examplesHash = cyrb53(
    JSON.stringify(
      input.examples.map((e) => ({
        jobFingerprint: e.jobFingerprint,
        greeting: e.greeting,
        preferred: Boolean(e.preferred),
        roleTags: e.roleTags ?? [],
        createdAt: e.createdAt,
      })),
    ),
  );
  return [
    'B',
    GREETING_PROMPT_VERSION,
    input.jobFingerprint,
    contentHash,
    input.profileId,
    input.config.baseURL,
    input.config.model,
    pointsHash,
    rulesHash,
    examplesHash,
  ].join('\u0000');
}

export function resolveEffectiveConfigFromInput(input: {
  profile: UserProfile;
  settings?: Partial<AppSettings>;
  temporaryRule?: string;
  temporaryPreferences?: Partial<GreetingPreferences>;
  useExamples?: boolean;
}): EffectiveGreetingConfig {
  const tempPrefs: Partial<GreetingPreferences> = {
    ...(input.temporaryPreferences ?? {}),
    ...(input.useExamples !== undefined ? { useExamples: input.useExamples } : {}),
  };
  return resolveGreetingConfig({
    settings: input.settings,
    profile: input.profile,
    temporaryRule: input.temporaryRule,
    temporaryPreferences: Object.keys(tempPrefs).length ? tempPrefs : undefined,
  });
}

function createLLMCaller(config: LLMConfig, apiKey: string, signal: AbortSignal | undefined, deps: AnalyzeDeps) {
  return (messages: ChatMessage[], jsonMode: boolean, temperature: number) => {
    if (signal?.aborted) throw new AppError('LLM_ABORTED');
    return chatCompletion({
      config,
      apiKey,
      messages,
      signal,
      jsonMode,
      temperature,
      fetchImpl: deps.fetchImpl,
    });
  };
}

/** 阶段 A：单独执行 JD 匹配分析与素材选择。 */
export async function analyzeJobMatch(
  input: Omit<AnalyzeInput, 'examples'>,
  deps: AnalyzeDeps = {},
): Promise<MatchAnalysisResult> {
  const { job, profile, config, apiKey, signal } = input;
  if (!isJob(job)) throw new AppError('PROFILE_INVALID', '当前职位数据不完整');
  if (!profile.summary.trim()) throw new AppError('PROFILE_INVALID', '当前档案摘要为空');

  const effective = resolveEffectiveConfigFromInput({ profile, settings: input.settings });
  const call = createLLMCaller(config, apiKey, signal, deps);

  const parsed = parseModelJSON(
    await call(
      buildAnalysisMessages(job, profile, { effectiveConfig: effective }),
      true,
      0.3,
    ),
  );
  if (parsed === undefined) throw new AppError('LLM_BAD_OUTPUT');
  const v = validateAnalysisPayload(parsed, { maxGreetingPoints: effective.preferences.maxPoints });
  if (!v.ok) {
    throw new AppError('LLM_BAD_OUTPUT', `模型返回格式无效：${v.errors.slice(0, 3).join('；')}`);
  }

  const calibrated = calibrateMatchAnalysis(v.value, effective.preferences.allowGapExplanation, { job, profile }, {
    maxPoints: effective.preferences.maxPoints,
    prioritizeTasks: !effective.effectiveSelectionRules,
  });
  const jobContentHash = computeJobContentHash(job);

  return {
    ...calibrated,
    jobFingerprint: job.fingerprint,
    jobContentHash,
    profileId: profile.id,
    profileVersion: profile.version,
    model: config.model,
    analysisCacheKey: buildAnalysisCacheKey({
      jobFingerprint: job.fingerprint,
      jobContentHash,
      profile,
      config,
      preferences: effective.preferences,
      selectionRules: effective.effectiveSelectionRules,
    }),
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}

/** 阶段 B：仅基于已选匹配素材、生效规则和样例重新生成打招呼语，不重复调用阶段 A 匹配分析。 */
export async function generateGreetingOnly(
  input: GenerateGreetingInput,
  deps: AnalyzeDeps = {},
): Promise<GenerateGreetingOutput> {
  const { job, points, profile, examples, config, apiKey, signal } = input;
  if (!isJob(job)) throw new AppError('PROFILE_INVALID', '当前职位数据不完整');

  const effective = resolveEffectiveConfigFromInput(input);
  const call = createLLMCaller(config, apiKey, signal, deps);

  const candidateFacts = points.join('\n');
  const selected = selectGreetingExamples(job, profile.id, examples, {
    enabled: effective.preferences.useExamples,
  });
  const messages = buildGreetingMessages(
    job,
    points,
    effective.effectiveWritingRules,
    selected,
    effective.preferences,
    input.greetingContext,
  );

  let greeting = cleanGreeting(await call(messages, false, 0.5));
  const checkOptions = {
    preferences: effective.preferences,
    writingRules: effective.effectiveWritingRules,
    extraNotes: profile.extraNotes,
    jobTitle: job.title,
  };
  let greetingIssueDetails = checkGreetingDetailed(greeting, candidateFacts, checkOptions);

  if (greetingIssueDetails.length) {
    const issueMessages = greetingIssueDetails.map((d) => d.message);
    const revision = [...messages, ...buildGreetingRevision(greeting, issueMessages)];
    greeting = cleanGreeting(await call(revision, false, 0.5));
    greetingIssueDetails = checkGreetingDetailed(greeting, candidateFacts, checkOptions);
  }

  if (!greeting) throw new AppError('LLM_BAD_OUTPUT', '模型未返回打招呼语');

  const jobContentHash = computeJobContentHash(job);

  return {
    greeting,
    greetingIssues: greetingIssueDetails.map((d) => d.message),
    greetingIssueDetails,
    effectiveRules: effective.effectiveWritingRules,
    effectivePreferences: effective.preferences,
    greetingCacheKey: buildGreetingCacheKey({
      jobFingerprint: job.fingerprint,
      jobContentHash,
      profileId: profile.id,
      config,
      points,
      greetingContext: input.greetingContext,
      effectiveRules: effective.effectiveWritingRules,
      preferences: effective.preferences,
      examples: selected,
    }),
    selectedExamplesCount: selected.length,
    greetingStyleExamples: selected.map(({ jobFingerprint, jobTitle, company }) => ({ jobFingerprint, jobTitle, company })),
    model: config.model,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}

/**
 * 两阶段：A 匹配分析并挑选打招呼素材；B 只用素材独立撰写打招呼语。
 * B 的结果未通过本地检查时，带具体问题定向重写一次；仍未通过则如实返回 greetingIssues 与分级细节。
 */
export async function analyzeJob(input: AnalyzeInput, deps: AnalyzeDeps = {}): Promise<AnalysisResult> {
  const match = await analyzeJobMatch(input, deps);
  const generated = await generateGreetingOnly(
    {
      job: input.job,
      points: match.greetingPoints,
      greetingContext: match.greetingContext,
      profile: input.profile,
      examples: input.examples,
      config: input.config,
      apiKey: input.apiKey,
      signal: input.signal,
      settings: input.settings,
      temporaryRule: input.temporaryRule,
      temporaryPreferences: input.temporaryPreferences,
      useExamples: input.useExamples,
    },
    deps,
  );

  return {
    matchScore: match.matchScore,
    capabilityCoverage: match.capabilityCoverage,
    capabilityEvidence: match.capabilityEvidence,
    recommendation: match.recommendation,
    summary: match.summary,
    decisionFactors: match.decisionFactors,
    strengths: match.strengths,
    gaps: match.gaps,
    toConfirm: match.toConfirm,
    hardRequirements: match.hardRequirements,
    greetingPoints: match.greetingPoints,
    greetingContext: match.greetingContext,
    greeting: generated.greeting,
    greetingIssues: generated.greetingIssues,
    greetingIssueDetails: generated.greetingIssueDetails,
    effectiveRules: generated.effectiveRules,
    effectivePreferences: generated.effectivePreferences,
    greetingStyleExamples: generated.greetingStyleExamples,
    analysisCacheKey: match.analysisCacheKey,
    greetingCacheKey: generated.greetingCacheKey,
    jobContentHash: match.jobContentHash,
    jobFingerprint: match.jobFingerprint,
    profileId: match.profileId,
    profileVersion: match.profileVersion,
    model: match.model,
    createdAt: generated.createdAt,
  };
}
