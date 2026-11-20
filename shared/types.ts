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

export type ExperienceType = '正式工作' | '兼职' | '实习' | '个人项目' | '学术/课程' | '其他';
export type ParticipationLevel = '了解' | '参与' | '负责' | '独立完成' | '主导';

export interface ProfileFact {
  id?: string;
  /** 具体做过什么 */
  fact: string;
  /** 对应哪段简历或用户确认内容 */
  source: string;
  /** 正式工作、兼职、实习、个人项目等 */
  experienceType: string;
  /** 了解、参与、负责、独立完成、主导 */
  participationLevel: string;
  /** 该事实能支持什么能力判断 */
  skills: string[];
  /** 可以验证的结果或指标 */
  outcomes?: string;
  /** 开发中、仅测试、未上线等限制条件 */
  constraints?: string;
}

export type GreetingPresetId = 'concise' | 'technical' | 'achievement' | 'custom';
export type RuleConflictResolution = 'text' | 'structured';

export type ConflictPreferenceField =
  | 'singleParagraph'
  | 'allowLists'
  | 'maxChars'
  | 'allowGapExplanation'
  | 'maxPoints'
  | 'useExamples';

export interface RulePreferenceConflict {
  layer: 'global' | 'profile' | 'temporary';
  field: ConflictPreferenceField;
  label: string;
  textValue: string;
  structuredValue: string;
  resolvedValue: string;
}

export interface GreetingPreferences {
  /** 预设风格模板标识（仅作可编辑模板标识，不构成硬编码限制） */
  preset?: GreetingPresetId;
  /** 同层自由文本规则与结构化参数冲突时的优先策略（默认 'text'：文字规则优先） */
  conflictResolution?: RuleConflictResolution;
  /** 阶段 A 挑选匹配素材条数上限（1~8，默认 4） */
  maxPoints: number;
  /** 是否允许在素材与打招呼语中主动提及或解释能力差距（默认 false） */
  allowGapExplanation: boolean;
  /** 是否要求单段无换行（默认 true；允许分段时为 false） */
  singleParagraph: boolean;
  /** 是否允许使用分点、列表或标题（默认 false） */
  allowLists: boolean;
  /** 最大字数限制（默认 160；null 或 <=0 表示不限制字数） */
  maxChars: number | null;
  /** 建议字数范围提示（如 "80–140"、"150–260"，可选） */
  targetLengthHint?: string;
  /** 是否启用历史打招呼语样例参考（默认 true） */
  useExamples: boolean;
}

export interface EffectiveGreetingConfig {
  globalRules: string;
  profileRules: string;
  temporaryRule: string;
  /** 按优先级合并后的完整规则说明文本 */
  combinedRulesText: string;
  /** 专用于阶段 A（JD 匹配与选材）的有效规则 */
  effectiveSelectionRules: string;
  /** 专用于阶段 B（打招呼语表达与格式）的有效规则 */
  effectiveWritingRules: string;
  /** 同层自由文本规则与结构化参数冲突明细 */
  conflicts: RulePreferenceConflict[];
  /** 实际生效的校验与选材参数（已结合自由文本规则做冲突消解） */
  preferences: GreetingPreferences;
}

export interface UserProfile {
  id: string;
  name: string;
  resumeFileName: string;
  resumeText: string;
  summary: string;
  /** 结构化档案事实清单（保留经历类型、参与程度、能力证据与限制条件） */
  facts?: ProfileFact[];
  extraNotes: string;
  targetRoles: string[];
  preferredLocations: string[];
  salaryPreference?: string;
  /** 选材与岗位重点规则（影响阶段 A 匹配选材，并纳入阶段 A 缓存键） */
  selectionRules?: string;
  greetingRules: string;
  greetingPreferences?: Partial<GreetingPreferences>;
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
  /** 全局默认选材与岗位重点规则（影响阶段 A） */
  globalSelectionRules?: string;
  /** 全局默认打招呼语规则（优先级低于档案规则和单次补充要求） */
  globalGreetingRules?: string;
  /** 全局默认打招呼语格式与选材偏好 */
  globalGreetingPreferences?: Partial<GreetingPreferences>;
}

// ---------- ③ 分析结果层 ----------

export type Recommendation = 'recommended' | 'consider' | 'not_recommended';

export type RequirementCategory = 'core' | 'general' | 'bonus' | 'focus' | 'hard';
export type EvidenceStatus = 'matched' | 'partial' | 'not_shown' | 'confirmed_lacking';

export interface MatchPoint {
  requirement: string;
  evidence: string;
  /** 任职要求类别：核心要求 / 一般要求 / 加分项 / 实际工作重点 / 硬性条件 */
  category?: RequirementCategory;
  /** 证据状态：已匹配 / 部分匹配 / 简历未体现 / 已确认不具备 */
  status?: EvidenceStatus;
}

export type GreetingIssueKind = 'structure' | 'fact' | 'style';

export interface GreetingCheckIssue {
  kind: GreetingIssueKind;
  message: string;
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
  /** 阶段 A 选出的档案事实（条数上限由有效配置决定，默认 4 条）。 */
  greetingPoints: string[];
  greeting: string;
  /** 定向重写后仍未通过的本地检查项；正常为空 */
  greetingIssues: string[];
  /** 分类后的本地检查项（结构 / 事实 / 风格） */
  greetingIssueDetails?: GreetingCheckIssue[];
  /** 生成该结果时实际生效的合并规则文本 */
  effectiveRules?: string;
  /** 生成该结果时实际生效的校验与选材参数 */
  effectivePreferences?: GreetingPreferences;
  /** 阶段 A 匹配分析缓存键（不含阶段 B 纯写作规则） */
  analysisCacheKey?: string;
  /** 阶段 B 打招呼语缓存键 */
  greetingCacheKey?: string;
  /** JD 内容哈希（用于检测同职位 ID 下正文变更） */
  jobContentHash?: string;
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
  /** 用户是否指定为优先参考 */
  preferred?: boolean;
  /** 适用岗位类型标签（如 AI Agent、前端开发、企业落地） */
  roleTags?: string[];
  createdAt: string;
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommended: '推荐投递',
  consider: '可以考虑',
  not_recommended: '不太匹配',
};

export const REQUIREMENT_CATEGORY_LABEL: Record<RequirementCategory, string> = {
  hard: '硬性条件',
  core: '核心要求',
  focus: '工作重点',
  general: '一般要求',
  bonus: '加分项',
};

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  matched: '证据充分',
  partial: '部分匹配',
  not_shown: '简历未体现',
  confirmed_lacking: '已确认不具备',
};
