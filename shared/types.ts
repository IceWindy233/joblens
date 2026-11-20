// 三层稳定数据契约：JD 获取层 / 档案层 / 分析层。修改须同步更新测试。

// ---------- ① JD 获取层 ----------

export interface Job {
  source: 'boss';
  sourceId?: string;
  url: string;
  title: string;
  company: string;
  salary?: string;
  location?: string;
  description: string;
  fingerprint: string;
  capturedAt: string;
}

export type JobErrorCode =
  | 'UNSUPPORTED_PAGE'
  | 'NO_ACTIVE_JOB'
  | 'JOB_EXTRACTION_FAILED'
  | 'CONTENT_SCRIPT_MISSING';

export type JobState =
  | { status: 'ready'; job: Job }
  | { status: 'loading' }
  | { status: 'error'; code: JobErrorCode; detail?: string };

export interface JobAdapter {
  getJobState(): JobState;
  onJobStateChange(listener: (state: JobState) => void): () => void;
}

// ---------- ② 用户配置层 ----------

export interface UserProfile {
  id: string;
  name: string;
  resumeFileName: string;
  resumeText: string;
  summary: string;
  extraNotes: string;
  targetRoles: string[];
  preferredLocations: string[];
  salaryPreference?: string;
  greetingRules: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LLMConfig {
  baseURL: string;
  model: string;
}

export interface AppSettings {
  activeProfileId: string | null;
  llm: LLMConfig | null;
}

// ---------- ③ 分析结果层 ----------

export type Recommendation = 'recommended' | 'consider' | 'not_recommended';

export interface MatchPoint {
  requirement: string;
  evidence: string;
}

export interface AnalysisResult {
  jobFingerprint: string;
  profileId: string;
  profileVersion: number;
  matchScore: number;
  recommendation: Recommendation;
  summary: string;
  strengths: MatchPoint[];
  gaps: MatchPoint[];
  /** 阶段 A 选出的档案事实（优先 2–4 条；证据不足时可少选）。 */
  greetingPoints: string[];
  greeting: string;
  /** 定向重写后仍未通过的本地检查项；正常为空 */
  greetingIssues: string[];
  model: string;
  createdAt: string;
}

/** 用户确认过的打招呼语，按档案隔离，作为 Few-shot 参考。 */
export interface GreetingExample {
  profileId: string;
  jobFingerprint: string;
  jobTitle: string;
  company: string;
  /** JD 摘录（已截断），用于相似度选择与 Few-shot 上下文 */
  jobExcerpt: string;
  points: string[];
  greeting: string;
  createdAt: string;
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommended: '推荐投递',
  consider: '可以考虑',
  not_recommended: '不太匹配',
};
