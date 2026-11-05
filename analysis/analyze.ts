import type { AnalysisResult, Job, LLMConfig, UserProfile } from '../shared/types';
import { AppError } from '../shared/errors';
import { parseModelJSON } from '../shared/json';
import { isJob } from '../shared/messages';
import { chatCompletion } from '../llm/client';
import { buildAnalysisMessages } from './prompts';
import { validateAnalysisPayload } from './schema';

export interface AnalyzeDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** 结果缓存键：jobFingerprint + profileId + profileVersion（保证不会显示错配的结果）。 */
export function resultKey(fingerprint: string, profileId: string, version: number): string {
  return `${fingerprint}\u0000${profileId}\u0000${version}`;
}

/** 一次 LLM 调用生成匹配分析与打招呼语。 */
export async function analyzeJob(
  job: Job,
  profile: UserProfile,
  config: LLMConfig,
  apiKey: string,
  signal?: AbortSignal,
  deps: AnalyzeDeps = {},
): Promise<AnalysisResult> {
  if (!isJob(job)) throw new AppError('PROFILE_INVALID', '当前职位数据不完整');
  if (!profile.summary.trim()) throw new AppError('PROFILE_INVALID', '当前档案摘要为空');

  const content = await chatCompletion({
    config,
    apiKey,
    messages: buildAnalysisMessages(job, profile),
    signal,
    jsonMode: true,
    temperature: 0.3,
    fetchImpl: deps.fetchImpl,
  });

  const parsed = parseModelJSON(content);
  if (parsed === undefined) throw new AppError('LLM_BAD_OUTPUT');
  const v = validateAnalysisPayload(parsed);
  if (!v.ok) {
    throw new AppError('LLM_BAD_OUTPUT', `模型返回格式无效：${v.errors.slice(0, 3).join('；')}`);
  }

  return {
    ...v.value,
    jobFingerprint: job.fingerprint,
    profileId: profile.id,
    profileVersion: profile.version,
    model: config.model,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}
