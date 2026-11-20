import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisResult,
  AppSettings,
  GreetingExample,
  Job,
  LLMConfig,
  UserProfile,
} from '../../shared/types';
import { AppError, redactSecret, toAppError } from '../../shared/errors';
import {
  analyzeJobMatch,
  buildAnalysisCacheKey,
  buildGreetingCacheKey,
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

interface PairGreetingState {
  text: string;
  edited: boolean;
  previous: string | null;
  pending: GenerateGreetingOutput | null;
}

function pairKey(fingerprint: string, profileId: string): string {
  return `${fingerprint}\u0000${profileId}`;
}

/**
 * 两阶段结果缓存与编辑状态管理：
 * - 阶段 A（匹配分析）按 analysisCacheKey 缓存；仅改写作规则不失效；
 * - 阶段 B（打招呼语）按 greetingCacheKey 缓存；切换模型/改规则/改样例即时感知；
 * - 用户手动编辑打招呼语后，重新生成绝不自动覆盖，而是放入 pending 供对比采纳。
 */
export function useAnalysis(job: Job | null, profile: UserProfile | null, settings?: AppSettings) {
  const results = useRef(new Map<string, AnalysisResult>());
  const matchCache = useRef(new Map<string, MatchAnalysisResult>());
  const greetingCache = useRef(new Map<string, GenerateGreetingOutput>());
  const errors = useRef(new Map<string, AppError>());
  const inflight = useRef(new Map<string, { controller: AbortController; phase: 'analyzing' | 'greeting' }>());
  const greetingStates = useRef(new Map<string, PairGreetingState>());
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

  // 实时加载当前档案样例并订阅存储变化，确保在设置页增删改样例时能及时检测缓存失效
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

  const currentAnalysisKey = useMemo(() => {
    if (!job || !profile || !settings?.llm || !effectiveConfig) return null;
    return buildAnalysisCacheKey({
      jobFingerprint: job.fingerprint,
      profile,
      config: settings.llm,
      preferences: effectiveConfig.preferences,
    });
  }, [job, profile, settings?.llm, effectiveConfig]);

  const activeResult = key ? results.current.get(key) : undefined;

  const currentGreetingKey = useMemo(() => {
    if (!job || !profile || !settings?.llm || !effectiveConfig || !activeResult) return null;
    const selected = selectGreetingExamples(job, profile.id, examples, {
      enabled: effectiveConfig.preferences.useExamples,
    });
    return buildGreetingCacheKey({
      jobFingerprint: job.fingerprint,
      profileId: profile.id,
      config: settings.llm,
      points: activeResult.greetingPoints,
      effectiveRules: effectiveConfig.combinedRulesText,
      preferences: effectiveConfig.preferences,
      examples: selected,
    });
  }, [job, profile, settings?.llm, effectiveConfig, activeResult, examples]);

  let view: AnalysisView = { kind: 'none' };
  if (key) {
    const running = inflight.current.get(key);
    const r = results.current.get(key);
    const e = errors.current.get(key);
    if (running) view = { kind: 'running', phase: running.phase };
    else if (r) view = { kind: 'done', result: r };
    else if (e) view = { kind: 'error', error: e };
    else view = { kind: 'idle' };
  }

  const analysisStale =
    Boolean(activeResult && currentAnalysisKey && activeResult.analysisCacheKey !== currentAnalysisKey);
  const greetingStale =
    Boolean(
      !analysisStale &&
        activeResult &&
        currentGreetingKey &&
        activeResult.greetingCacheKey !== currentGreetingKey,
    );

  const applyGeneratedGreeting = useCallback(
    (k: string, baseResult: AnalysisResult, generated: GenerateGreetingOutput) => {
      const prevState = greetingStates.current.get(k);
      const currentText = prevState?.text ?? baseResult.greeting;

      if (prevState?.edited && currentText !== generated.greeting) {
        // 保留用户已编辑文本，新版本放入 pending 供对比采纳
        greetingStates.current.set(k, {
          ...prevState,
          pending: generated,
        });
        results.current.set(k, baseResult);
        return;
      }

      const nextPrevious =
        currentText && currentText !== generated.greeting ? currentText : (prevState?.previous ?? null);
      greetingStates.current.set(k, {
        text: generated.greeting,
        edited: false,
        previous: nextPrevious,
        pending: null,
      });
      results.current.set(k, {
        ...baseResult,
        greeting: generated.greeting,
        greetingIssues: generated.greetingIssues,
        greetingIssueDetails: generated.greetingIssueDetails,
        effectiveRules: generated.effectiveRules,
        effectivePreferences: generated.effectivePreferences,
        greetingCacheKey: generated.greetingCacheKey,
        model: generated.model,
        createdAt: generated.createdAt,
      });
    },
    [],
  );

  const start = useCallback(
    async (config: LLMConfig, apiKey: string) => {
      if (!job || !profile) return;
      const k = pairKey(job.fingerprint, profile.id);
      if (inflight.current.has(k)) return;
      const controller = new AbortController();
      inflight.current.set(k, { controller, phase: 'analyzing' });
      errors.current.delete(k);
      rerender();

      const tempRule = tempRules.current.get(k) ?? '';
      const useEx = useExamplesMap.current.get(k);

      try {
        const eff = resolveEffectiveConfigFromInput({
          profile,
          settings,
          temporaryRule: tempRule,
          useExamples: useEx,
        });
        const aKey = buildAnalysisCacheKey({
          jobFingerprint: job.fingerprint,
          profile,
          config,
          preferences: eff.preferences,
        });

        let match = matchCache.current.get(aKey);
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
        const generated = await generateGreetingOnly({
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

        const baseResult: AnalysisResult = {
          matchScore: match.matchScore,
          recommendation: match.recommendation,
          summary: match.summary,
          strengths: match.strengths,
          gaps: match.gaps,
          greetingPoints: match.greetingPoints,
          greeting: results.current.get(k)?.greeting ?? generated.greeting,
          greetingIssues: generated.greetingIssues,
          greetingIssueDetails: generated.greetingIssueDetails,
          effectiveRules: generated.effectiveRules,
          effectivePreferences: generated.effectivePreferences,
          analysisCacheKey: match.analysisCacheKey,
          greetingCacheKey: generated.greetingCacheKey,
          jobFingerprint: match.jobFingerprint,
          profileId: match.profileId,
          profileVersion: match.profileVersion,
          model: match.model,
          createdAt: generated.createdAt,
        };
        applyGeneratedGreeting(k, baseResult, generated);
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
    [job, profile, settings, applyGeneratedGreeting, rerender],
  );

  /** 仅重新生成打招呼语（不重新执行 JD 匹配分析；支持临时规则与新配置，且强制刷新本次生成）。 */
  const regenerateGreeting = useCallback(
    async (config: LLMConfig, apiKey: string) => {
      if (!job || !profile) return;
      const k = pairKey(job.fingerprint, profile.id);
      const baseResult = results.current.get(k);
      if (!baseResult || inflight.current.has(k)) return;

      const controller = new AbortController();
      inflight.current.set(k, { controller, phase: 'greeting' });
      errors.current.delete(k);
      rerender();

      const tempRule = tempRules.current.get(k) ?? '';
      const useEx = useExamplesMap.current.get(k);

      try {
        const latestExamples = await loadGreetingExamples(profile.id);
        setExamples(latestExamples);
        const generated = await generateGreetingOnly({
          job,
          points: baseResult.greetingPoints,
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
        applyGeneratedGreeting(k, baseResult, generated);
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
    [job, profile, settings, applyGeneratedGreeting, rerender],
  );

  const cancel = useCallback(() => {
    if (key) inflight.current.get(key)?.controller.abort();
  }, [key]);

  const gState = key ? greetingStates.current.get(key) : undefined;
  const greeting = gState?.text ?? activeResult?.greeting;

  const setGreeting = useCallback(
    (text: string) => {
      if (!key) return;
      const prev = greetingStates.current.get(key);
      greetingStates.current.set(key, {
        text,
        edited: true,
        previous: prev?.previous ?? null,
        pending: prev?.pending ?? null,
      });
      rerender();
    },
    [key, rerender],
  );

  const acceptPendingGreeting = useCallback(() => {
    if (!key) return;
    const prev = greetingStates.current.get(key);
    const base = results.current.get(key);
    if (!prev?.pending || !base) return;
    const pending = prev.pending;
    greetingStates.current.set(key, {
      text: pending.greeting,
      edited: false,
      previous: prev.text,
      pending: null,
    });
    results.current.set(key, {
      ...base,
      greeting: pending.greeting,
      greetingIssues: pending.greetingIssues,
      greetingIssueDetails: pending.greetingIssueDetails,
      effectiveRules: pending.effectiveRules,
      effectivePreferences: pending.effectivePreferences,
      greetingCacheKey: pending.greetingCacheKey,
      model: pending.model,
      createdAt: pending.createdAt,
    });
    rerender();
  }, [key, rerender]);

  const discardPendingGreeting = useCallback(() => {
    if (!key) return;
    const prev = greetingStates.current.get(key);
    if (!prev?.pending) return;
    greetingStates.current.set(key, { ...prev, pending: null });
    rerender();
  }, [key, rerender]);

  const restorePreviousGreeting = useCallback(() => {
    if (!key) return;
    const prev = greetingStates.current.get(key);
    if (!prev?.previous) return;
    greetingStates.current.set(key, {
      text: prev.previous,
      edited: true,
      previous: prev.text,
      pending: prev.pending,
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
    cancel,
    greeting,
    isEdited: Boolean(gState?.edited),
    previousGreeting: gState?.previous ?? null,
    pendingGreeting: gState?.pending ?? null,
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
  };
}
