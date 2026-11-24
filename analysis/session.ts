import type {
  AnalysisResult,
  AppSettings,
  EffectiveGreetingConfig,
  GreetingCheckIssue,
  GreetingExample,
  GreetingPreferences,
  GreetingStyleExample,
  Job,
  LLMConfig,
  UserProfile,
} from '../shared/types';
import { AppError, redactSecret, toAppError } from '../shared/errors';
import {
  analyzeJobMatch,
  buildAnalysisCacheKey,
  buildGreetingCacheKey,
  computeJobContentHash,
  generateGreetingOnly,
  resolveEffectiveConfigFromInput,
  type AnalyzeDeps,
  type GenerateGreetingOutput,
  type MatchAnalysisResult,
} from './analyze';
import { selectGreetingExamples } from './greeting-examples';

// 两阶段分析的会话状态机，与 UI 框架无关：Chrome 侧边栏通过 React hook 订阅，Android 引擎直接调用。

export type AnalysisView =
  | { kind: 'none' }
  | { kind: 'idle' }
  | { kind: 'running'; phase: 'analyzing' | 'greeting' }
  | { kind: 'error'; error: AppError }
  | { kind: 'done'; result: AnalysisResult };

/** 单个打招呼语版本的完整原子快照：正文、校验状态、规则摘要与缓存键严格绑定 */
export interface GreetingVersion {
  text: string;
  edited: boolean;
  greetingIssues: string[];
  greetingIssueDetails: GreetingCheckIssue[];
  effectiveRules: string;
  effectivePreferences: GreetingPreferences;
  greetingStyleExamples: GreetingStyleExample[];
  greetingCacheKey: string;
  model: string;
  createdAt: string;
  /** 生成此版本时使用的单次补充要求；生成成功后输入框清空，但此版本仍视为按它生成 */
  temporaryRule: string;
}

interface PairState {
  match: MatchAnalysisResult;
  current: GreetingVersion;
  previous: GreetingVersion | null;
  pending: GreetingVersion | null;
}

export interface StartAnalysisOptions {
  /** 是否跳过阶段 A 缓存强制重新分析匹配度（默认 false） */
  forceMatch?: boolean;
  /** 是否跳过阶段 B 缓存强制重新撰写打招呼语（默认 false） */
  forceGreeting?: boolean;
}

export interface RegenerateGreetingOptions {
  /** 是否跳过阶段 B 缓存强制重新生成（点击“重写”时默认为 true） */
  force?: boolean;
}

/** 一次分析针对的职位 × 档案组合。 */
export interface AnalysisTarget {
  job: Job;
  profile: UserProfile;
  settings?: AppSettings;
}

/** 两阶段结果缓存的可序列化快照 */
export interface AnalysisCacheSnapshot {
  matches: [string, MatchAnalysisResult][];
  greetings: [string, GenerateGreetingOutput][];
}

/** 跨界面实例保存结果缓存（Android 重建面板 WebView 后恢复，避免重复调用模型） */
export interface AnalysisCacheStore {
  load(): AnalysisCacheSnapshot | undefined;
  save(snapshot: AnalysisCacheSnapshot): void;
}

/** 每类缓存保留的最近条目数 */
const PERSISTED_CACHE_LIMIT = 40;

export interface AnalysisSessionDeps extends AnalyzeDeps {
  loadExamples(profileId: string): Promise<GreetingExample[]>;
  cacheStore?: AnalysisCacheStore;
}

/** 某个职位 × 档案组合当前可展示的全部派生状态。 */
export interface AnalysisSnapshot {
  view: AnalysisView;
  greeting: string | undefined;
  isEdited: boolean;
  previousGreeting: string | null;
  pendingGreeting: GreetingVersion | null;
  temporaryRule: string;
  useExamplesOverride: boolean | undefined;
  effectiveConfig: EffectiveGreetingConfig | null;
  analysisStale: boolean;
  greetingStale: boolean;
  hasCachedGreeting: boolean;
}

function pairKey(fingerprint: string, profileId: string): string {
  return `${fingerprint}\u0000${profileId}`;
}

function toGreetingVersion(out: GenerateGreetingOutput, temporaryRule: string): GreetingVersion {
  return {
    text: out.greeting,
    edited: false,
    greetingIssues: out.greetingIssues,
    greetingIssueDetails: out.greetingIssueDetails,
    effectiveRules: out.effectiveRules,
    effectivePreferences: out.effectivePreferences,
    greetingStyleExamples: out.greetingStyleExamples,
    greetingCacheKey: out.greetingCacheKey,
    model: out.model,
    createdAt: out.createdAt,
    temporaryRule,
  };
}

function composeAnalysisResult(match: MatchAnalysisResult, version: GreetingVersion): AnalysisResult {
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
    greeting: version.text,
    greetingIssues: version.greetingIssues,
    greetingIssueDetails: version.greetingIssueDetails,
    effectiveRules: version.effectiveRules,
    effectivePreferences: version.effectivePreferences,
    greetingStyleExamples: version.greetingStyleExamples,
    analysisCacheKey: match.analysisCacheKey,
    greetingCacheKey: version.greetingCacheKey,
    jobContentHash: match.jobContentHash,
    jobFingerprint: match.jobFingerprint,
    profileId: match.profileId,
    profileVersion: match.profileVersion,
    model: version.model,
    createdAt: version.createdAt,
  };
}

/**
 * 两阶段结果缓存与原子版本状态管理：
 * - 阶段 A（匹配分析）按 JD 内容哈希 + 档案事实 + 选材规则 + 模型缓存；
 * - 阶段 B（打招呼语）按阶段 A 素材 + 写作规则 + 样例摘要缓存并真正读取复用；
 * - 阶段 A 过期时禁止单独用旧 greetingPoints 重写；
 * - 每个打招呼语版本绑定正文、校验问题与缓存键，绝不交叉污染。
 */
export class AnalysisSession {
  private readonly pairStates = new Map<string, PairState>();
  private readonly matchCache = new Map<string, MatchAnalysisResult>();
  private readonly greetingCache = new Map<string, GenerateGreetingOutput>();
  private readonly errors = new Map<string, AppError>();
  private readonly inflight = new Map<string, { controller: AbortController; phase: 'analyzing' | 'greeting' }>();
  private readonly tempRules = new Map<string, string>();
  private readonly useExamplesMap = new Map<string, boolean | undefined>();
  private readonly examplesByProfile = new Map<string, GreetingExample[]>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly deps: AnalysisSessionDeps) {
    const saved = deps.cacheStore?.load();
    for (const [key, match] of saved?.matches ?? []) this.matchCache.set(key, match);
    for (const [key, greeting] of saved?.greetings ?? []) this.greetingCache.set(key, greeting);
  }

  private persistCaches(): void {
    const store = this.deps.cacheStore;
    if (!store) return;
    store.save({
      matches: [...this.matchCache].slice(-PERSISTED_CACHE_LIMIT),
      greetings: [...this.greetingCache].slice(-PERSISTED_CACHE_LIMIT),
    });
  }

  /** 订阅任意状态变化；返回取消订阅函数。 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** 单调递增的状态版本号，供外部判断是否需要重新取快照。 */
  getVersion = (): number => this.version;

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** 中止全部进行中的模型调用。 */
  abortAll(): void {
    for (const item of this.inflight.values()) item.controller.abort();
  }

  /** 重新读取某档案的样例（样例变化会影响阶段 B 缓存键）。 */
  async refreshExamples(profileId: string): Promise<void> {
    let list: GreetingExample[];
    try {
      list = await this.deps.loadExamples(profileId);
    } catch {
      list = [];
    }
    this.examplesByProfile.set(profileId, list);
    this.notify();
  }

  snapshot(job: Job | null, profile: UserProfile | null, settings?: AppSettings): AnalysisSnapshot {
    return this.derive(job, profile, settings).snapshot;
  }

  private derive(
    job: Job | null,
    profile: UserProfile | null,
    settings?: AppSettings,
  ): {
    snapshot: AnalysisSnapshot;
    activePair: PairState | undefined;
    currentGreetingKey: string | null;
    /** currentGreetingKey 所用的单次补充要求 */
    greetingRule: string;
  } {
    const key = job && profile ? pairKey(job.fingerprint, profile.id) : null;
    const temporaryRule = key ? (this.tempRules.get(key) ?? '') : '';
    const useExamplesOverride = key ? this.useExamplesMap.get(key) : undefined;
    const analysisConfig = profile ? resolveEffectiveConfigFromInput({ profile, settings }) : null;
    const effectiveConfig = profile
      ? resolveEffectiveConfigFromInput({ profile, settings, temporaryRule, useExamples: useExamplesOverride })
      : null;
    const jobContentHash = job ? computeJobContentHash(job) : '';

    const currentAnalysisKey =
      job && profile && settings?.llm && analysisConfig
        ? buildAnalysisCacheKey({
            jobFingerprint: job.fingerprint,
            jobContentHash,
            profile,
            config: settings.llm,
            preferences: analysisConfig.preferences,
            selectionRules: analysisConfig.effectiveSelectionRules,
          })
        : null;

    const activePair = key ? this.pairStates.get(key) : undefined;

    // 单次要求生成后即清空：输入框为空时，当前版本按它自己用过的要求判断是否过期
    const greetingRule = temporaryRule || activePair?.current.temporaryRule || '';
    let currentGreetingKey: string | null = null;
    if (job && profile && settings?.llm && activePair) {
      const keyConfig = resolveEffectiveConfigFromInput({
        profile,
        settings,
        temporaryRule: greetingRule,
        useExamples: useExamplesOverride,
      });
      const selected = selectGreetingExamples(job, profile.id, this.examplesByProfile.get(profile.id) ?? [], {
        enabled: keyConfig.preferences.useExamples,
      });
      currentGreetingKey = buildGreetingCacheKey({
        jobFingerprint: job.fingerprint,
        jobContentHash,
        profileId: profile.id,
        config: settings.llm,
        points: activePair.match.greetingPoints,
        greetingContext: activePair.match.greetingContext,
        effectiveRules: keyConfig.effectiveWritingRules,
        preferences: keyConfig.preferences,
        examples: selected,
      });
    }

    let view: AnalysisView = { kind: 'none' };
    if (key) {
      const running = this.inflight.get(key);
      const e = this.errors.get(key);
      if (running) view = { kind: 'running', phase: running.phase };
      else if (activePair) view = { kind: 'done', result: composeAnalysisResult(activePair.match, activePair.current) };
      else if (e) view = { kind: 'error', error: e };
      else view = { kind: 'idle' };
    }

    const analysisStale = Boolean(
      activePair && currentAnalysisKey && activePair.match.analysisCacheKey !== currentAnalysisKey,
    );
    const greetingStale = Boolean(
      !analysisStale && activePair && currentGreetingKey && activePair.current.greetingCacheKey !== currentGreetingKey,
    );
    const hasCachedGreeting = Boolean(
      !analysisStale && greetingStale && currentGreetingKey && this.greetingCache.has(currentGreetingKey),
    );

    return {
      snapshot: {
        view,
        greeting: activePair?.current.text,
        isEdited: Boolean(activePair?.current.edited),
        previousGreeting: activePair?.previous?.text ?? null,
        pendingGreeting: activePair?.pending ?? null,
        temporaryRule,
        useExamplesOverride,
        effectiveConfig,
        analysisStale,
        greetingStale,
        hasCachedGreeting,
      },
      activePair,
      currentGreetingKey,
      greetingRule,
    };
  }

  private commitVersion(
    k: string,
    match: MatchAnalysisResult,
    generated: GenerateGreetingOutput,
    temporaryRule: string,
  ): void {
    const nextVersion = toGreetingVersion(generated, temporaryRule);
    const prevPair = this.pairStates.get(k);

    if (!prevPair) {
      this.pairStates.set(k, { match, current: nextVersion, previous: null, pending: null });
      return;
    }

    if (prevPair.current.edited && prevPair.current.text !== nextVersion.text) {
      // 保留用户已编辑版本的正文与全部元数据，不交叉覆盖校验/缓存键；新版本整体存入 pending
      this.pairStates.set(k, {
        match,
        current: prevPair.current,
        previous: prevPair.previous,
        pending: nextVersion,
      });
      return;
    }

    const nextPrevious =
      prevPair.current.text && prevPair.current.text !== nextVersion.text ? prevPair.current : prevPair.previous;
    this.pairStates.set(k, { match, current: nextVersion, previous: nextPrevious, pending: null });
  }

  private async loadLatestExamples(profileId: string): Promise<GreetingExample[]> {
    const latest = await this.deps.loadExamples(profileId);
    this.examplesByProfile.set(profileId, latest);
    return latest;
  }

  private recordFailure(k: string, err: unknown, apiKey: string): void {
    const e = toAppError(err);
    if (e.code !== 'LLM_ABORTED') {
      this.errors.set(k, new AppError(e.code, redactSecret(e.message, apiKey)));
    }
  }

  async start(
    { job, profile, settings }: AnalysisTarget,
    config: LLMConfig,
    apiKey: string,
    options: StartAnalysisOptions = {},
  ): Promise<void> {
    const k = pairKey(job.fingerprint, profile.id);
    if (this.inflight.has(k)) return;
    const controller = new AbortController();
    this.inflight.set(k, { controller, phase: 'analyzing' });
    this.errors.delete(k);
    this.notify();

    const tempRule = this.tempRules.get(k) ?? '';
    const useEx = this.useExamplesMap.get(k);
    const contentHash = computeJobContentHash(job);
    const { fetchImpl, now } = this.deps;

    try {
      const analysisConfig = resolveEffectiveConfigFromInput({ profile, settings });
      const eff = resolveEffectiveConfigFromInput({ profile, settings, temporaryRule: tempRule, useExamples: useEx });
      const aKey = buildAnalysisCacheKey({
        jobFingerprint: job.fingerprint,
        jobContentHash: contentHash,
        profile,
        config,
        preferences: analysisConfig.preferences,
        selectionRules: analysisConfig.effectiveSelectionRules,
      });

      let match = options.forceMatch ? undefined : this.matchCache.get(aKey);
      if (!match) {
        match = await analyzeJobMatch(
          { job, profile, config, apiKey, signal: controller.signal, settings },
          { fetchImpl, now },
        );
        this.matchCache.set(aKey, match);
        this.persistCaches();
      }

      const inflightEntry = this.inflight.get(k);
      if (inflightEntry) inflightEntry.phase = 'greeting';
      this.notify();

      const latestExamples = await this.loadLatestExamples(profile.id);
      const selected = selectGreetingExamples(job, profile.id, latestExamples, {
        enabled: eff.preferences.useExamples,
      });
      const gKey = buildGreetingCacheKey({
        jobFingerprint: job.fingerprint,
        jobContentHash: contentHash,
        profileId: profile.id,
        config,
        points: match.greetingPoints,
        greetingContext: match.greetingContext,
        effectiveRules: eff.effectiveWritingRules,
        preferences: eff.preferences,
        examples: selected,
      });

      let generated = options.forceGreeting ? undefined : this.greetingCache.get(gKey);
      if (!generated) {
        generated = await generateGreetingOnly(
          {
            job,
            points: match.greetingPoints,
            greetingContext: match.greetingContext,
            profile,
            examples: latestExamples,
            config,
            apiKey,
            signal: controller.signal,
            settings,
            temporaryRule: tempRule,
            useExamples: useEx,
          },
          { fetchImpl, now },
        );
        this.greetingCache.set(generated.greetingCacheKey, generated);
        this.persistCaches();
      }

      this.commitVersion(k, match, generated, tempRule);
      this.consumeTemporaryRule(k, tempRule);
    } catch (err) {
      this.recordFailure(k, err, apiKey);
    } finally {
      this.inflight.delete(k);
      this.notify();
    }
  }

  /**
   * 仅重新生成打招呼语（不重跑阶段 A）。
   * 若当前分析已过期（analysisStale），拒绝基于旧事实直接生成，避免新档案混用旧匹配点。
   */
  async regenerateGreeting(
    { job, profile, settings }: AnalysisTarget,
    config: LLMConfig,
    apiKey: string,
    options: RegenerateGreetingOptions = { force: true },
  ): Promise<void> {
    const k = pairKey(job.fingerprint, profile.id);
    const existingPair = this.pairStates.get(k);
    if (!existingPair || this.inflight.has(k)) return;

    const tempRule = this.tempRules.get(k) ?? '';
    const useEx = this.useExamplesMap.get(k);
    const contentHash = computeJobContentHash(job);
    const analysisConfig = resolveEffectiveConfigFromInput({ profile, settings });
    const eff = resolveEffectiveConfigFromInput({ profile, settings, temporaryRule: tempRule, useExamples: useEx });
    const expectedAnalysisKey = buildAnalysisCacheKey({
      jobFingerprint: job.fingerprint,
      jobContentHash: contentHash,
      profile,
      config,
      preferences: analysisConfig.preferences,
      selectionRules: analysisConfig.effectiveSelectionRules,
    });

    // 守卫：禁止在阶段 A 已过期时使用旧 greetingPoints 单独重写
    if (existingPair.match.analysisCacheKey !== expectedAnalysisKey) {
      this.errors.set(k, new AppError('PROFILE_INVALID', '匹配分析已过期，请先更新分析后再重写打招呼语'));
      this.notify();
      return;
    }

    const controller = new AbortController();
    this.inflight.set(k, { controller, phase: 'greeting' });
    this.errors.delete(k);
    this.notify();

    try {
      const latestExamples = await this.loadLatestExamples(profile.id);
      const selected = selectGreetingExamples(job, profile.id, latestExamples, {
        enabled: eff.preferences.useExamples,
      });
      const gKey = buildGreetingCacheKey({
        jobFingerprint: job.fingerprint,
        jobContentHash: contentHash,
        profileId: profile.id,
        config,
        points: existingPair.match.greetingPoints,
        greetingContext: existingPair.match.greetingContext,
        effectiveRules: eff.effectiveWritingRules,
        preferences: eff.preferences,
        examples: selected,
      });

      let generated = options.force === false ? this.greetingCache.get(gKey) : undefined;
      if (!generated) {
        generated = await generateGreetingOnly(
          {
            job,
            points: existingPair.match.greetingPoints,
            greetingContext: existingPair.match.greetingContext,
            profile,
            examples: latestExamples,
            config,
            apiKey,
            signal: controller.signal,
            settings,
            temporaryRule: tempRule,
            useExamples: useEx,
          },
          { fetchImpl: this.deps.fetchImpl, now: this.deps.now },
        );
        this.greetingCache.set(generated.greetingCacheKey, generated);
        this.persistCaches();
      }

      this.commitVersion(k, existingPair.match, generated, tempRule);
      this.consumeTemporaryRule(k, tempRule);
    } catch (err) {
      this.recordFailure(k, err, apiKey);
    } finally {
      this.inflight.delete(k);
      this.notify();
    }
  }

  /** 单次补充要求只用于一次生成；生成期间用户又改了输入则保留新输入 */
  private consumeTemporaryRule(k: string, used: string): void {
    if ((this.tempRules.get(k) ?? '') === used) this.tempRules.delete(k);
  }

  /** 直接应用阶段 B 已命中的本地缓存（零模型调用） */
  applyCachedGreeting({ job, profile, settings }: AnalysisTarget): void {
    const { snapshot, activePair, currentGreetingKey, greetingRule } = this.derive(job, profile, settings);
    if (!activePair || !currentGreetingKey || snapshot.analysisStale) return;
    const cached = this.greetingCache.get(currentGreetingKey);
    if (!cached) return;
    this.commitVersion(pairKey(job.fingerprint, profile.id), activePair.match, cached, greetingRule);
    this.notify();
  }

  cancel({ job, profile }: AnalysisTarget): void {
    this.inflight.get(pairKey(job.fingerprint, profile.id))?.controller.abort();
  }

  setGreeting({ job, profile }: AnalysisTarget, text: string): void {
    const k = pairKey(job.fingerprint, profile.id);
    const pair = this.pairStates.get(k);
    if (!pair) return;
    this.pairStates.set(k, { ...pair, current: { ...pair.current, text, edited: true } });
    this.notify();
  }

  acceptPendingGreeting({ job, profile }: AnalysisTarget): void {
    const k = pairKey(job.fingerprint, profile.id);
    const pair = this.pairStates.get(k);
    if (!pair?.pending) return;
    this.pairStates.set(k, { ...pair, previous: pair.current, current: pair.pending, pending: null });
    this.notify();
  }

  discardPendingGreeting({ job, profile }: AnalysisTarget): void {
    const k = pairKey(job.fingerprint, profile.id);
    const pair = this.pairStates.get(k);
    if (!pair?.pending) return;
    this.pairStates.set(k, { ...pair, pending: null });
    this.notify();
  }

  restorePreviousGreeting({ job, profile }: AnalysisTarget): void {
    const k = pairKey(job.fingerprint, profile.id);
    const pair = this.pairStates.get(k);
    if (!pair?.previous) return;
    this.pairStates.set(k, {
      ...pair,
      current: { ...pair.previous, edited: true },
      previous: pair.current,
    });
    this.notify();
  }

  setTemporaryRule({ job, profile }: AnalysisTarget, rule: string): void {
    this.tempRules.set(pairKey(job.fingerprint, profile.id), rule);
    this.notify();
  }

  setUseExamplesOverride({ job, profile }: AnalysisTarget, enabled: boolean | undefined): void {
    this.useExamplesMap.set(pairKey(job.fingerprint, profile.id), enabled);
    this.notify();
  }
}
