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
  greeting: string;
  model: string;
  createdAt: string;
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommended: '推荐投递',
  consider: '可以考虑',
  not_recommended: '不太匹配',
};
