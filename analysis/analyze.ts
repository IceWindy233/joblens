import type { AnalysisResult, GreetingExample, Job, LLMConfig, UserProfile } from '../shared/types';
import { AppError } from '../shared/errors';
import { parseModelJSON } from '../shared/json';
import { isJob } from '../shared/messages';
import { chatCompletion, type ChatMessage } from '../llm/client';
import { buildAnalysisMessages, buildGreetingMessages, buildGreetingRevision } from './prompts';
import { validateAnalysisPayload } from './schema';
import { checkGreeting, cleanGreeting } from './greeting';
import { selectGreetingExamples } from './greeting-examples';

export interface AnalyzeInput {
  job: Job;
  profile: UserProfile;
  /** 已保存的样例；仅选用当前档案里与职位相近的 0–3 条。 */
  examples: GreetingExample[];
  config: LLMConfig;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AnalyzeDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** 结果缓存键：jobFingerprint + profileId + profileVersion（保证不会显示错配的结果）。 */
export function resultKey(fingerprint: string, profileId: string, version: number): string {
  return `${fingerprint}\u0000${profileId}\u0000${version}`;
}

/**
 * 两阶段：A 匹配分析并挑选打招呼素材；B 只用素材独立撰写打招呼语。
 * B 的结果未通过本地检查时，带具体问题定向重写一次；仍未通过则如实返回 greetingIssues。
 */
export async function analyzeJob(input: AnalyzeInput, deps: AnalyzeDeps = {}): Promise<AnalysisResult> {
  const { job, profile, examples, config, apiKey, signal } = input;
  if (!isJob(job)) throw new AppError('PROFILE_INVALID', '当前职位数据不完整');
  if (!profile.summary.trim()) throw new AppError('PROFILE_INVALID', '当前档案摘要为空');

  const call = (messages: ChatMessage[], jsonMode: boolean, temperature: number) => {
    if (signal?.aborted) throw new AppError('LLM_ABORTED');
    return chatCompletion({ config, apiKey, messages, signal, jsonMode, temperature, fetchImpl: deps.fetchImpl });
  };

  const parsed = parseModelJSON(await call(buildAnalysisMessages(job, profile), true, 0.3));
  if (parsed === undefined) throw new AppError('LLM_BAD_OUTPUT');
  const v = validateAnalysisPayload(parsed);
  if (!v.ok) {
    throw new AppError('LLM_BAD_OUTPUT', `模型返回格式无效：${v.errors.slice(0, 3).join('；')}`);
  }
  const analysis = v.value;

  const facts = [...analysis.greetingPoints, job.title].join('\n');
  const selected = selectGreetingExamples(job, profile.id, examples);
  const messages = buildGreetingMessages(job, analysis.greetingPoints, profile.greetingRules, selected);
  let greeting = cleanGreeting(await call(messages, false, 0.5));
  let greetingIssues = checkGreeting(greeting, facts);
  if (greetingIssues.length) {
    const revision = [...messages, ...buildGreetingRevision(greeting, greetingIssues)];
    greeting = cleanGreeting(await call(revision, false, 0.5));
    greetingIssues = checkGreeting(greeting, facts);
  }
  if (!greeting) throw new AppError('LLM_BAD_OUTPUT', '模型未返回打招呼语');

  return {
    ...analysis,
    greeting,
    greetingIssues,
    jobFingerprint: job.fingerprint,
    profileId: profile.id,
    profileVersion: profile.version,
    model: config.model,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}
