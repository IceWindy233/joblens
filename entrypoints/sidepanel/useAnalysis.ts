import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisResult,
  AppSettings,
  GreetingCheckIssue,
  GreetingExample,
  GreetingPreferences,
  Job,
  LLMConfig,
  UserProfile,
} from '../../shared/types';
import { AppError, redactSecret, toAppError } from '../../shared/errors';
import {
  analyzeJobMatch,
  buildAnalysisCacheKey,
  buildGreetingCacheKey,
  computeJobContentHash,
  generateGreetingOnly,
  resolveEffectiveConfigFromInput,
  type GenerateGreetingOutput,
  type MatchAnalysisResult,
} from '../../analysis/analyze';
import { selectGreetingExamples } from '../../analysis/greeting-examples';
import { loadGreetingExamples, onStorageChanged } from '../../storage';

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
  greetingCacheKey: string;
  model: string;
  createdAt: string;
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

function pairKey(fingerprint: string, profileId: string): string {
  return `${fingerprint}\u0000${profileId}`;
}

function toGreetingVersion(out: GenerateGreetingOutput): GreetingVersion {
  return {
    text: out.greeting,
    edited: false,
    greetingIssues: out.greetingIssues,
    greetingIssueDetails: out.greetingIssueDetails,
    effectiveRules: out.effectiveRules,
    effectivePreferences: out.effectivePreferences,
    greetingCacheKey: out.greetingCacheKey,
    model: out.model,
    createdAt: out.createdAt,
  };
}

function composeAnalysisResult(match: MatchAnalysisResult, version: GreetingVersion): AnalysisResult {
  return {
    matchScore: match.matchScore,
    recommendation: match.recommendation,
    summary: match.summary,
    strengths: match.strengths,
    gaps: match.gaps,
    greetingPoints: match.greetingPoints,
    greeting: version.text,
    greetingIssues: version.greetingIssues,
    greetingIssueDetails: version.greetingIssueDetails,
    effectiveRules: version.effectiveRules,
    effectivePreferences: version.effectivePreferences,
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
export function useAnalysis(job: Job | null, profile: UserProfile | null, settings?: AppSettings) {
  const pairStates = useRef(new Map<string, PairState>());
  const matchCache = useRef(new Map<string, MatchAnalysisResult>());
  const greetingCache = useRef(new Map<string, GenerateGreetingOutput>());
  const errors = useRef(new Map<string, AppError>());
  const inflight = useRef(new Map<string, { controller: AbortController; phase: 'analyzing' | 'greeting' }>());
  const tempRules = useRef(new Map<string, string>());
  const useExamplesMap = useRef(new Map<string, boolean | undefined>());

  const [examples, setExamples] = useState<GreetingExample[]>([]);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  useEffect(
    () => () => {
      for (const item of inflight.current.values()) item.controller.abort();
    },
    [],
  );

  // 实时加载当前档案样例并订阅存储变化，确保增删改样例时及时感知缓存变化
  useEffect(() => {
    if (!profile?.id) {
      setExamples([]);
      return;
    }
    let cancelled = false;
    const reload = async () => {
      try {
        const list = await loadGreetingExamples(profile.id);
        if (!cancelled) setExamples(list);
      } catch {
        if (!cancelled) setExamples([]);
      }
    };
    void reload();
    const off = onStorageChanged(() => void reload());
    return () => {
      cancelled = true;
      off();
    };
  }, [profile?.id]);

  const key = job && profile ? pairKey(job.fingerprint, profile.id) : null;
  const temporaryRule = key ? (tempRules.current.get(key) ?? '') : '';
  const useExamplesOverride = key ? useExamplesMap.current.get(key) : undefined;

  const effectiveConfig = useMemo(() => {
    if (!profile) return null;
    return resolveEffectiveConfigFromInput({
      profile,
      settings,
      temporaryRule,
      useExamples: useExamplesOverride,
    });
  }, [profile, settings, temporaryRule, useExamplesOverride]);

  const jobContentHash = useMemo(() => (job ? computeJobContentHash(job) : ''), [job]);

  const currentAnalysisKey = useMemo(() => {
    if (!job || !profile || !settings?.llm || !effectiveConfig) return null;
    return buildAnalysisCacheKey({
      jobFingerprint: job.fingerprint,
      jobContentHash,
      profile,
      config: settings.llm,
      preferences: effectiveConfig.preferences,
      selectionRules: effectiveConfig.effectiveSelectionRules,
    });
  }, [job, jobContentHash, profile, settings?.llm, effectiveConfig]);

  const activePair = key ? pairStates.current.get(key) : undefined;
  const activeResult = activePair ? composeAnalysisResult(activePair.match, activePair.current) : undefined;

  const currentGreetingKey = useMemo(() => {
    if (!job || !profile || !settings?.llm || !effectiveConfig || !activePair) return null;
    const selected = selectGreetingExamples(job, profile.id, examples, {
      enabled: effectiveConfig.preferences.useExamples,
    });
    return buildGreetingCacheKey({
      jobFingerprint: job.fingerprint,
      jobContentHash,
      profileId: profile.id,
      config: settings.llm,
      points: activePair.match.greetingPoints,
      effectiveRules: effectiveConfig.effectiveWritingRules,
      preferences: effectiveConfig.preferences,
      examples: selected,
    });
  }, [job, jobContentHash, profile, settings?.llm, effectiveConfig, activePair, examples]);

  let view: AnalysisView = { kind: 'none' };
  if (key) {
    const running = inflight.current.get(key);
    const e = errors.current.get(key);
    if (running) view = { kind: 'running', phase: running.phase };
    else if (activeResult) view = { kind: 'done', result: activeResult };
    else if (e) view = { kind: 'error', error: e };
    else view = { kind: 'idle' };
  }

  const analysisStale = Boolean(
    activePair && currentAnalysisKey && activePair.match.analysisCacheKey !== currentAnalysisKey,
  );
  const greetingStale = Boolean(
    !analysisStale &&
      activePair &&
      currentGreetingKey &&
      activePair.current.greetingCacheKey !== currentGreetingKey,
  );
  const hasCachedGreeting = Boolean(
    !analysisStale && greetingStale && currentGreetingKey && greetingCache.current.has(currentGreetingKey),
  );

  const commitVersion = useCallback(
    (k: string, match: MatchAnalysisResult, generated: GenerateGreetingOutput) => {
      const nextVersion = toGreetingVersion(generated);
      const prevPair = pairStates.current.get(k);

      if (!prevPair) {
        pairStates.current.set(k, {
          match,
          current: nextVersion,
          previous: null,
          pending: null,
        });
        return;
      }

      if (prevPair.current.edited && prevPair.current.text !== nextVersion.text) {
        // 保留用户已编辑版本的正文与全部元数据，不交叉覆盖校验/缓存键；新版本整体存入 pending
        pairStates.current.set(k, {
          match,
          current: prevPair.current,
          previous: prevPair.previous,
          pending: nextVersion,
        });
        return;
      }

      const nextPrevious =
        prevPair.current.text && prevPair.current.text !== nextVersion.text
          ? prevPair.current
          : prevPair.previous;
      pairStates.current.set(k, {
        match,
        current: nextVersion,
        previous: nextPrevious,
        pending: null,
      });
    },
    [],
  );

  const start = useCallback(
    async (config: LLMConfig, apiKey: string, options: StartAnalysisOptions = {}) => {
      if (!job || !profile) return;
      const k = pairKey(job.fingerprint, profile.id);
      if (inflight.current.has(k)) return;
      const controller = new AbortController();
      inflight.current.set(k, { controller, phase: 'analyzing' });
      errors.current.delete(k);
      rerender();

      const tempRule = tempRules.current.get(k) ?? '';
      const useEx = useExamplesMap.current.get(k);
      const contentHash = computeJobContentHash(job);

      try {
        const eff = resolveEffectiveConfigFromInput({
          profile,
          settings,
          temporaryRule: tempRule,
          useExamples: useEx,
        });
        const aKey = buildAnalysisCacheKey({
          jobFingerprint: job.fingerprint,
          jobContentHash: contentHash,
          profile,
          config,
          preferences: eff.preferences,
          selectionRules: eff.effectiveSelectionRules,
        });

        let match = options.forceMatch ? undefined : matchCache.current.get(aKey);
        if (!match) {
          match = await analyzeJobMatch({
            job,
            profile,
            config,
            apiKey,
            signal: controller.signal,
            settings,
            temporaryRule: tempRule,
            useExamples: useEx,
          });
          matchCache.current.set(aKey, match);
        }

        const inflightEntry = inflight.current.get(k);
        if (inflightEntry) inflightEntry.phase = 'greeting';
        rerender();

        const latestExamples = await loadGreetingExamples(profile.id);
        setExamples(latestExamples);
        const selected = selectGreetingExamples(job, profile.id, latestExamples, {
          enabled: eff.preferences.useExamples,
        });
        const gKey = buildGreetingCacheKey({
          jobFingerprint: job.fingerprint,
          jobContentHash: contentHash,
          profileId: profile.id,
          config,
          points: match.greetingPoints,
          effectiveRules: eff.effectiveWritingRules,
          preferences: eff.preferences,
          examples: selected,
        });

        let generated = options.forceGreeting ? undefined : greetingCache.current.get(gKey);
        if (!generated) {
          generated = await generateGreetingOnly({
            job,
            points: match.greetingPoints,
            profile,
            examples: latestExamples,
            config,
            apiKey,
            signal: controller.signal,
            settings,
            temporaryRule: tempRule,
            useExamples: useEx,
          });
          greetingCache.current.set(generated.greetingCacheKey, generated);
        }

        commitVersion(k, match, generated);
      } catch (err) {
        const e = toAppError(err);
        if (e.code !== 'LLM_ABORTED') {
          errors.current.set(k, new AppError(e.code, redactSecret(e.message, apiKey)));
        }
      } finally {
        inflight.current.delete(k);
        rerender();
      }
    },
    [job, profile, settings, commitVersion, rerender],
  );

  /**
   * 仅重新生成打招呼语（不重跑阶段 A）。
   * 若当前分析已过期（analysisStale），拒绝基于旧事实直接生成，避免新档案混用旧匹配点。
   */
  const regenerateGreeting = useCallback(
    async (config: LLMConfig, apiKey: string, options: RegenerateGreetingOptions = { force: true }) => {
      if (!job || !profile) return;
      const k = pairKey(job.fingerprint, profile.id);
      const existingPair = pairStates.current.get(k);
      if (!existingPair || inflight.current.has(k)) return;

      const tempRule = tempRules.current.get(k) ?? '';
      const useEx = useExamplesMap.current.get(k);
      const contentHash = computeJobContentHash(job);
      const eff = resolveEffectiveConfigFromInput({
        profile,
        settings,
        temporaryRule: tempRule,
        useExamples: useEx,
      });
      const expectedAnalysisKey = buildAnalysisCacheKey({
        jobFingerprint: job.fingerprint,
        jobContentHash: contentHash,
        profile,
        config,
        preferences: eff.preferences,
        selectionRules: eff.effectiveSelectionRules,
      });

      // 守卫：禁止在阶段 A 已过期时使用旧 greetingPoints 单独重写
      if (existingPair.match.analysisCacheKey !== expectedAnalysisKey) {
        errors.current.set(k, new AppError('PROFILE_INVALID', '匹配分析已过期，请先更新分析后再重写打招呼语'));
        rerender();
        return;
      }

      const controller = new AbortController();
      inflight.current.set(k, { controller, phase: 'greeting' });
      errors.current.delete(k);
      rerender();

      try {
        const latestExamples = await loadGreetingExamples(profile.id);
        setExamples(latestExamples);
        const selected = selectGreetingExamples(job, profile.id, latestExamples, {
          enabled: eff.preferences.useExamples,
        });
        const gKey = buildGreetingCacheKey({
          jobFingerprint: job.fingerprint,
          jobContentHash: contentHash,
          profileId: profile.id,
          config,
          points: existingPair.match.greetingPoints,
          effectiveRules: eff.effectiveWritingRules,
          preferences: eff.preferences,
          examples: selected,
        });

        let generated = options.force === false ? greetingCache.current.get(gKey) : undefined;
        if (!generated) {
          generated = await generateGreetingOnly({
            job,
            points: existingPair.match.greetingPoints,
            profile,
            examples: latestExamples,
            config,
            apiKey,
            signal: controller.signal,
            settings,
            temporaryRule: tempRule,
            useExamples: useEx,
          });
          greetingCache.current.set(generated.greetingCacheKey, generated);
        }

        commitVersion(k, existingPair.match, generated);
      } catch (err) {
        const e = toAppError(err);
        if (e.code !== 'LLM_ABORTED') {
          errors.current.set(k, new AppError(e.code, redactSecret(e.message, apiKey)));
        }
      } finally {
        inflight.current.delete(k);
        rerender();
      }
    },
    [job, profile, settings, commitVersion, rerender],
  );

  /** 直接应用阶段 B 已命中的本地缓存（零模型调用） */
  const applyCachedGreeting = useCallback(() => {
    if (!key || !activePair || !currentGreetingKey || analysisStale) return;
    const cached = greetingCache.current.get(currentGreetingKey);
    if (!cached) return;
    commitVersion(key, activePair.match, cached);
    rerender();
  }, [key, activePair, currentGreetingKey, analysisStale, commitVersion, rerender]);

  const cancel = useCallback(() => {
    if (key) inflight.current.get(key)?.controller.abort();
  }, [key]);

  const setGreeting = useCallback(
    (text: string) => {
      if (!key) return;
      const pair = pairStates.current.get(key);
      if (!pair) return;
      pairStates.current.set(key, {
        ...pair,
        current: { ...pair.current, text, edited: true },
      });
      rerender();
    },
    [key, rerender],
  );

  const acceptPendingGreeting = useCallback(() => {
    if (!key) return;
    const pair = pairStates.current.get(key);
    if (!pair?.pending) return;
    pairStates.current.set(key, {
      ...pair,
      previous: pair.current,
      current: pair.pending,
      pending: null,
    });
    rerender();
  }, [key, rerender]);

  const discardPendingGreeting = useCallback(() => {
    if (!key) return;
    const pair = pairStates.current.get(key);
    if (!pair?.pending) return;
    pairStates.current.set(key, { ...pair, pending: null });
    rerender();
  }, [key, rerender]);

  const restorePreviousGreeting = useCallback(() => {
    if (!key) return;
    const pair = pairStates.current.get(key);
    if (!pair?.previous) return;
    pairStates.current.set(key, {
      ...pair,
      current: { ...pair.previous, edited: true },
      previous: pair.current,
    });
    rerender();
  }, [key, rerender]);

  const setTemporaryRule = useCallback(
    (rule: string) => {
      if (!key) return;
      tempRules.current.set(key, rule);
      rerender();
    },
    [key, rerender],
  );

  const setUseExamplesOverride = useCallback(
    (enabled: boolean | undefined) => {
      if (!key) return;
      useExamplesMap.current.set(key, enabled);
      rerender();
    },
    [key, rerender],
  );

  return {
    view,
    start,
    regenerateGreeting,
    applyCachedGreeting,
    cancel,
    greeting: activePair?.current.text,
    isEdited: Boolean(activePair?.current.edited),
    previousGreeting: activePair?.previous?.text ?? null,
    pendingGreeting: activePair?.pending ?? null,
    setGreeting,
    acceptPendingGreeting,
    discardPendingGreeting,
    restorePreviousGreeting,
    temporaryRule,
    setTemporaryRule,
    useExamplesOverride,
    setUseExamplesOverride,
    effectiveConfig,
    analysisStale,
    greetingStale,
    hasCachedGreeting,
  };
}
