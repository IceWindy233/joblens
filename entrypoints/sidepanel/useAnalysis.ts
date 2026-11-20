import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult, Job, LLMConfig, UserProfile } from '../../shared/types';
import { AppError, redactSecret, toAppError } from '../../shared/errors';
import { analyzeJob, resultKey } from '../../analysis/analyze';
import { loadGreetingExamples } from '../../storage';

export type AnalysisView =
  | { kind: 'none' }
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; error: AppError }
  | { kind: 'done'; result: AnalysisResult };

/**
 * 结果按 (fingerprint, profileId, version) 缓存在内存中。
 * 进行中的请求在切换职位/档案后继续执行并写入自己的键，不影响当前视图。
 */
export function useAnalysis(job: Job | null, profile: UserProfile | null) {
  const results = useRef(new Map<string, AnalysisResult>());
  const errors = useRef(new Map<string, AppError>());
  const inflight = useRef(new Map<string, AbortController>());
  const greetings = useRef(new Map<string, string>());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  useEffect(
    () => () => {
      for (const c of inflight.current.values()) c.abort();
    },
    [],
  );

  const key = job && profile ? resultKey(job.fingerprint, profile.id, profile.version) : null;

  let view: AnalysisView = { kind: 'none' };
  if (key) {
    const r = results.current.get(key);
    const e = errors.current.get(key);
    if (inflight.current.has(key)) view = { kind: 'running' };
    else if (r) view = { kind: 'done', result: r };
    else if (e) view = { kind: 'error', error: e };
    else view = { kind: 'idle' };
  }

  const start = useCallback(
    async (config: LLMConfig, apiKey: string) => {
      if (!job || !profile) return;
      const k = resultKey(job.fingerprint, profile.id, profile.version);
      if (inflight.current.has(k)) return; // 不允许并发重复请求
      const controller = new AbortController();
      inflight.current.set(k, controller);
      errors.current.delete(k);
      rerender();
      try {
        const examples = await loadGreetingExamples(profile.id);
        const result = await analyzeJob({ job, profile, examples, config, apiKey, signal: controller.signal });
        results.current.set(k, result);
        greetings.current.delete(k);
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
    [job, profile, rerender],
  );

  const cancel = useCallback(() => {
    if (key) inflight.current.get(key)?.abort();
  }, [key]);

  const greeting = key ? greetings.current.get(key) : undefined;
  const setGreeting = useCallback(
    (text: string) => {
      if (!key) return;
      greetings.current.set(key, text);
      rerender();
    },
    [key, rerender],
  );

  return { view, start, cancel, greeting, setGreeting };
}
