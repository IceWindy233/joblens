import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AppSettings, Job, LLMConfig, UserProfile } from '../../shared/types';
import {
  AnalysisSession,
  type RegenerateGreetingOptions,
  type StartAnalysisOptions,
} from '../../analysis/session';
import { loadGreetingExamples, onStorageChanged } from '../../storage';
import { getPlatform } from '../../platform';

/** 侧边栏对 AnalysisSession 的 React 绑定：订阅会话状态并把当前职位 × 档案作为操作目标。 */
export function useAnalysis(job: Job | null, profile: UserProfile | null, settings?: AppSettings) {
  const [session] = useState(
    () => new AnalysisSession({ loadExamples: loadGreetingExamples, cacheStore: getPlatform().analysisCache }),
  );
  const version = useSyncExternalStore(session.subscribe, session.getVersion);

  useEffect(() => () => session.abortAll(), [session]);

  // 实时加载当前档案样例并订阅存储变化，确保增删改样例时及时感知缓存变化
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    void session.refreshExamples(profileId);
    return onStorageChanged(() => void session.refreshExamples(profileId));
  }, [session, profileId]);

  // version 变化代表会话内部状态更新，需要重新取快照
  const snapshot = useMemo(() => session.snapshot(job, profile, settings), [session, version, job, profile, settings]);

  const actions = useMemo(() => {
    const target = job && profile ? { job, profile, settings } : null;
    return {
      start: async (config: LLMConfig, apiKey: string, options?: StartAnalysisOptions) => {
        if (target) await session.start(target, config, apiKey, options);
      },
      regenerateGreeting: async (config: LLMConfig, apiKey: string, options?: RegenerateGreetingOptions) => {
        if (target) await session.regenerateGreeting(target, config, apiKey, options);
      },
      applyCachedGreeting: () => {
        if (target) session.applyCachedGreeting(target);
      },
      cancel: () => {
        if (target) session.cancel(target);
      },
      setGreeting: (text: string) => {
        if (target) session.setGreeting(target, text);
      },
      acceptPendingGreeting: () => {
        if (target) session.acceptPendingGreeting(target);
      },
      discardPendingGreeting: () => {
        if (target) session.discardPendingGreeting(target);
      },
      restorePreviousGreeting: () => {
        if (target) session.restorePreviousGreeting(target);
      },
      setTemporaryRule: (rule: string) => {
        if (target) session.setTemporaryRule(target, rule);
      },
      setUseExamplesOverride: (enabled: boolean | undefined) => {
        if (target) session.setUseExamplesOverride(target, enabled);
      },
    };
  }, [session, job, profile, settings]);

  return { ...snapshot, ...actions };
}
