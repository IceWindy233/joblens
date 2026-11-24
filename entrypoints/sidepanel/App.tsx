import { useEffect, useId, useRef, useState } from 'react';
import { getPlatform } from '../../platform';
import type {
  AnalysisResult,
  EffectiveGreetingConfig,
  GreetingCheckIssue,
  Job,
  JobState,
  MatchPoint,
  Recommendation,
  UserProfile,
} from '../../shared/types';
import {
  EVIDENCE_STATUS_LABEL,
  RECOMMENDATION_LABEL,
  REQUIREMENT_CATEGORY_LABEL,
} from '../../shared/types';
import { ERROR_MESSAGES, type AppErrorCode } from '../../shared/errors';
import { parseListInput } from '../../profile/manager';
import { saveGreetingExample, updateSettings } from '../../storage';
import { useAppData } from '../../components/useAppData';
import {
  IconAlert,
  IconBookmark,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconHistory,
  IconInfo,
  IconRefresh,
  IconSettings,
  IconSliders,
  IconSparkles,
  IconUser,
  IconWand,
  IconX,
  ToggleSwitch,
} from '../../components/Icons';
import { formatPreferencesSummary } from '../options/GreetingRulesConfig';
import { useActiveTabJob } from './useActiveTabJob';
import type { AnalysisView, GreetingVersion, StartAnalysisOptions } from '../../analysis/session';
import { useAnalysis } from './useAnalysis';
import { GREETING_EXCERPT_LIMIT } from '../../analysis/greeting-examples';

const JOB_ERROR_TEXT: Record<string, string> = {
  UNSUPPORTED_PAGE: '请打开 BOSS 直聘职位页面',
  CONTENT_SCRIPT_MISSING: '请刷新当前 BOSS 页面后再试',
  NO_ACTIVE_JOB: '请点开一个具体职位查看分析',
  JOB_EXTRACTION_FAILED: '职位信息读取失败，页面结构可能已变更',
};

function openSettings() {
  getPlatform().openSettings();
}

/** 宿主可观察的工作区状态（Android 用来绘制悬浮气泡与速览卡）。 */
export interface WorkspaceStatus {
  job: 'none' | 'loading' | 'ready' | 'truncated' | 'error';
  jobTitle: string | null;
  company: string | null;
  analysis: AnalysisView['kind'];
  score: number | null;
  recommendation: Recommendation | null;
  analysisStale: boolean;
  configIssue: boolean;
}

/** 一次快速分析请求（Android 点按气泡）的结果 */
export type QuickAnalysisOutcome =
  | { kind: 'done'; greeting: string; issueCount: number }
  | { kind: 'blocked'; reason: string }
  | { kind: 'failed'; message: string };

export interface WorkspaceProps {
  jobState: JobState | null;
  refresh: () => void;
  requestSnapshot: () => Promise<string>;
  /**
   * 每次变化表示用户请求快速分析：已有结果直接返回；可以分析时调用模型并等待结果；
   * 职位未就绪、JD 未展开或设置不全时不调用模型，返回原因。
   */
  analyzeRequest?: number;
  onAnalyzeRequestSettled?: (outcome: QuickAnalysisOutcome) => void;
  onStatusChange?: (status: WorkspaceStatus) => void;
  /** 提供时在顶栏显示收起按钮 */
  onClose?: () => void;
}

export default function App() {
  return <Workspace {...useActiveTabJob()} />;
}

export function Workspace({
  jobState,
  refresh,
  requestSnapshot,
  analyzeRequest,
  onAnalyzeRequestSettled,
  onStatusChange,
  onClose,
}: WorkspaceProps) {
  const data = useAppData();
  const job = jobState?.status === 'ready' ? jobState.job : null;
  const profile = data.profiles.find((p) => p.id === data.settings.activeProfileId) ?? null;
  const analysis = useAnalysis(job, profile, data.settings);

  let configIssue: AppErrorCode | 'NO_PROFILE' | null = null;
  if (!data.settings.llm) configIssue = 'LLM_NOT_CONFIGURED';
  else if (!data.hasPermission) configIssue = 'LLM_PERMISSION_MISSING';
  else if (!data.apiKey) configIssue = 'LLM_KEY_MISSING';
  else if (!profile) configIssue = 'NO_PROFILE';

  const canAnalyze = data.loaded && !configIssue && !!job && analysis.view.kind !== 'running';
  const progressAnnouncement =
    analysis.view.kind === 'running'
      ? analysis.view.phase === 'greeting'
        ? '2/2 正在撰写打招呼语'
        : '1/2 正在核对岗位并准备素材'
      : analysis.view.kind === 'done'
        ? '打招呼语已生成'
        : '';

  const startAnalysis = (options?: StartAnalysisOptions) => {
    if (data.settings.llm && data.apiKey) void analysis.start(data.settings.llm, data.apiKey, options);
  };

  const doneOutcome = (result: AnalysisResult): QuickAnalysisOutcome => ({
    kind: 'done',
    greeting: analysis.greeting ?? result.greeting,
    issueCount: result.greetingIssues.length,
  });

  const blockedReason = (): string | null => {
    if (!data.loaded) return '设置尚未加载，请稍后再试';
    if (configIssue) return configIssue === 'NO_PROFILE' ? '请先创建并选择一份简历档案' : ERROR_MESSAGES[configIssue];
    if (!jobState || jobState.status === 'loading') return '正在识别职位，请稍候';
    if (jobState.status === 'error') return JOB_ERROR_TEXT[jobState.code] ?? '未识别到职位';
    if (jobState.job.descriptionTruncated) return 'JD 未展开：请先在 BOSS 点「查看更多」，或打开详情按已读内容生成';
    return null;
  };

  // 快速分析请求：只响应新的请求，不在挂载时回放旧请求
  const handledRequest = useRef(analyzeRequest);
  const pendingRequest = useRef<'starting' | 'running' | null>(null);
  useEffect(() => {
    if (analyzeRequest === handledRequest.current) return;
    handledRequest.current = analyzeRequest;
    const view = analysis.view;
    if (view.kind === 'done' && !analysis.analysisStale) {
      onAnalyzeRequestSettled?.(doneOutcome(view.result));
      return;
    }
    if (view.kind === 'running') {
      pendingRequest.current = 'running';
      return;
    }
    const reason = blockedReason();
    if (reason) {
      onAnalyzeRequestSettled?.({ kind: 'blocked', reason });
      return;
    }
    pendingRequest.current = 'starting';
    startAnalysis();
  });

  // 等待本次请求触发的分析结束（完成、失败、取消或切换了职位/档案）
  useEffect(() => {
    const view = analysis.view;
    if (pendingRequest.current === null) return;
    if (view.kind === 'running') {
      pendingRequest.current = 'running';
      return;
    }
    if (pendingRequest.current === 'starting') return;
    pendingRequest.current = null;
    if (view.kind === 'done') onAnalyzeRequestSettled?.(doneOutcome(view.result));
    else if (view.kind === 'error') onAnalyzeRequestSettled?.({ kind: 'failed', message: view.error.message });
    else onAnalyzeRequestSettled?.({ kind: 'blocked', reason: '分析已取消' });
  });

  const jobStatus: WorkspaceStatus['job'] =
    !jobState || jobState.status === 'loading'
      ? 'loading'
      : jobState.status === 'error'
        ? jobState.code === 'JOB_EXTRACTION_FAILED'
          ? 'error'
          : 'none'
        : jobState.job.descriptionTruncated
          ? 'truncated'
          : 'ready';
  const score = analysis.view.kind === 'done' ? analysis.view.result.matchScore : null;
  const recommendation = analysis.view.kind === 'done' ? analysis.view.result.recommendation : null;
  useEffect(() => {
    onStatusChange?.({
      job: jobStatus,
      jobTitle: job?.title ?? null,
      company: job?.company ?? null,
      analysis: analysis.view.kind,
      score,
      recommendation,
      analysisStale: analysis.analysisStale,
      configIssue: configIssue !== null,
    });
  }, [
    onStatusChange,
    jobStatus,
    job?.title,
    job?.company,
    analysis.view.kind,
    score,
    recommendation,
    analysis.analysisStale,
    configIssue,
  ]);

  return (
    <div className="sp-shell">
      <header className="sp-header">
        <h1 className="sr-only">JobLens 职镜</h1>
        <ProfilePicker profiles={data.profiles} profile={profile} />
        <button
          type="button"
          className="icon-btn"
          title="打开设置"
          aria-label="打开设置"
          onClick={openSettings}
        >
          <IconSettings size={16} />
        </button>
        {onClose && (
          <button type="button" className="icon-btn" title="收起" aria-label="收起" onClick={onClose}>
            <IconX size={16} />
          </button>
        )}
      </header>

      <main className="sp-body">
        <p className="sr-only" role="status">{progressAnnouncement}</p>
        {data.loaded && configIssue && (
          <div className="notice warn row">
            <div className="row-sm grow">
              <IconAlert size={15} />
              <span className="small">
                {configIssue === 'NO_PROFILE' ? '请先创建并选择一份简历档案' : ERROR_MESSAGES[configIssue]}
              </span>
            </div>
            <button type="button" className="primary small" onClick={openSettings}>
              去设置
            </button>
          </div>
        )}

        <JobCard
          state={jobState}
          onRefresh={refresh}
          showAction={analysis.view.kind !== 'done'}
          runningPhase={analysis.view.kind === 'running' ? analysis.view.phase : null}
          canAnalyze={canAnalyze}
          onAnalyze={() => startAnalysis()}
          onCancel={analysis.cancel}
        />

        {analysis.view.kind === 'error' && (
          <div className="notice err" role="alert">
            <div className="row-sm">
              <IconAlert size={15} />
              <span>{analysis.view.error.message}</span>
            </div>
          </div>
        )}

        {job && analysis.view.kind === 'done' && (
          <ResultWorkspace
            key={JSON.stringify([job.fingerprint, analysis.view.result.profileId, analysis.view.result.profileVersion])}
            job={job}
            result={analysis.view.result}
            greeting={analysis.greeting ?? analysis.view.result.greeting}
            isEdited={analysis.isEdited}
            previousGreeting={analysis.previousGreeting}
            pendingGreeting={analysis.pendingGreeting}
            temporaryRule={analysis.temporaryRule}
            useExamplesOverride={analysis.useExamplesOverride}
            effectiveConfig={analysis.effectiveConfig}
            analysisStale={analysis.analysisStale}
            greetingStale={analysis.greetingStale}
            hasCachedGreeting={analysis.hasCachedGreeting}
            canRegenerate={canAnalyze}
            currentModel={data.settings.llm?.model}
            onGreetingChange={analysis.setGreeting}
            onTemporaryRuleChange={analysis.setTemporaryRule}
            onUseExamplesChange={analysis.setUseExamplesOverride}
            onRegenerateGreeting={() => {
              if (data.settings.llm && data.apiKey) {
                void analysis.regenerateGreeting(data.settings.llm, data.apiKey, { force: true });
              }
            }}
            onApplyCachedGreeting={analysis.applyCachedGreeting}
            onUpdateAnalysis={() => startAnalysis({ forceMatch: false, forceGreeting: false })}
            onForceReanalyze={() => startAnalysis({ forceMatch: true, forceGreeting: true })}
            onAcceptPending={analysis.acceptPendingGreeting}
            onDiscardPending={analysis.discardPendingGreeting}
            onRestorePrevious={analysis.restorePreviousGreeting}
          />
        )}
      </main>

      <footer className="sp-footer">
        <DiagnosticsFooter
          model={analysis.view.kind === 'done' ? analysis.view.result.model : data.settings.llm?.model}
          canSnapshot={
            jobState?.status !== 'error' ||
            (jobState.code !== 'UNSUPPORTED_PAGE' && jobState.code !== 'CONTENT_SCRIPT_MISSING')
          }
          requestSnapshot={requestSnapshot}
        />
      </footer>
    </div>
  );
}

/** 当前档案选择。悬浮窗中的 WebView 弹不出原生下拉框，改用页内列表。 */
function ProfilePicker({ profiles, profile }: { profiles: UserProfile[]; profile: UserProfile | null }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const choose = (id: string | null) => void updateSettings({ activeProfileId: id });

  if (getPlatform().selectPopups) {
    return (
      <div className="profile-select-wrap">
        <IconUser size={14} className="muted" />
        <select
          aria-label="当前简历档案"
          value={profile?.id ?? ''}
          disabled={profiles.length === 0}
          onChange={(e) => choose(e.target.value || null)}
        >
          {profiles.length === 0 && <option value="">未创建档案</option>}
          {!profile && profiles.length > 0 && <option value="">请选择档案</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="profile-select-wrap profile-picker">
      <IconUser size={14} className="muted" />
      <button
        type="button"
        className="profile-trigger"
        aria-label={`当前简历档案：${profile?.name ?? '未选择'}`}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={profiles.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{profile?.name ?? (profiles.length ? '请选择档案' : '未创建档案')}</span>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div id={menuId} className="profile-menu" role="group" aria-label="选择简历档案">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === profile?.id}
              onClick={() => {
                choose(p.id);
                setOpen(false);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  state,
  onRefresh,
  showAction,
  runningPhase,
  canAnalyze,
  onAnalyze,
  onCancel,
}: {
  state: JobState | null;
  onRefresh: () => void;
  showAction: boolean;
  runningPhase: 'analyzing' | 'greeting' | null;
  canAnalyze: boolean;
  onAnalyze: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const jdId = useId();
  const statusAnnouncement =
    !state || state.status === 'loading'
      ? '正在识别页面中的职位信息'
      : state.status === 'error'
        ? JOB_ERROR_TEXT[state.code]
        : '';

  return (
    <section className="panel-card stack">
      <p className="sr-only" role="status">{statusAnnouncement}</p>
      <div className="row between">
        <h2 className="section-label">当前职位</h2>
        <div className="row-sm">
          {state?.status === 'ready' && (
            <button
              type="button"
              className="link small"
              aria-expanded={expanded}
              aria-controls={jdId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '收起 JD' : '查看 JD'}
            </button>
          )}
          <button
            type="button"
            className="ghost icon-btn small"
            title="重新读取职位"
            aria-label="重新读取职位"
            onClick={onRefresh}
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {(!state || state.status === 'loading') && (
        <div className="muted">正在识别页面中的职位信息…</div>
      )}

      {state?.status === 'error' && (
        <div className={state.code === 'JOB_EXTRACTION_FAILED' ? 'notice err' : 'notice'}>
          <div>{JOB_ERROR_TEXT[state.code]}</div>
          {state.detail && <div className="muted">{state.detail}</div>}
        </div>
      )}

      {state?.status === 'ready' && (
        <div className="stack-sm">
          <h3 className="job-title">{state.job.title}</h3>
          <div className="muted">
            {[state.job.company, state.job.location, state.job.salary].filter(Boolean).join(' · ')}
          </div>
          {state.job.descriptionTruncated && (
            <div className="notice warn small" role="note">
              JD 被折叠，只读到了前半部分。在 BOSS 中点「查看更多」展开后会自动补全；也可以直接按已读到的内容生成。
            </div>
          )}
          {expanded && <div id={jdId} className="pre jd-preview">{state.job.description}</div>}
        </div>
      )}

      {showAction && (
        runningPhase ? (
          <div className="row">
            <button type="button" className="grow" disabled>
              <IconRefresh size={14} className="spin" />
              {runningPhase === 'greeting' ? '2/2 撰写打招呼语…' : '1/2 核对岗位并准备素材…'}
            </button>
            <button type="button" className="ghost small" onClick={onCancel}>
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="primary block"
            disabled={!canAnalyze}
            onClick={onAnalyze}
          >
            <IconSparkles size={15} />
            生成打招呼语
          </button>
        )
      )}
    </section>
  );
}

function MatchPointList({
  items,
  kind,
}: {
  items: MatchPoint[];
  kind: 'strengths' | 'gaps' | 'confirm' | 'hard';
}) {
  return (
    <ul className={`dot-list ${kind}`}>
      {items.map((p, i) => (
        <li key={i}>
          <div className="row-sm wrap">
            <span className="req">{p.requirement}</span>
            {p.dimension === 'preference' && (
              <span className="badge info">个人意愿/条件</span>
            )}
            {p.category === 'hard' && kind !== 'hard' && (
              <span className="badge warn">{REQUIREMENT_CATEGORY_LABEL.hard}</span>
            )}
            {p.category === 'bonus' && (
              <span className="badge">{REQUIREMENT_CATEGORY_LABEL.bonus}</span>
            )}
            {p.status === 'confirmed_lacking' && (
              <span className="badge err">{kind === 'hard' ? '明确冲突' : EVIDENCE_STATUS_LABEL.confirmed_lacking}</span>
            )}
            {kind === 'hard' && (p.status === 'partial' || p.status === 'not_shown') && (
              <span className="badge warn">高影响待确认</span>
            )}
            {kind !== 'hard' && p.status === 'not_shown' && (
              <span className="badge">{p.dimension === 'preference' ? '待确认' : EVIDENCE_STATUS_LABEL.not_shown}</span>
            )}
            {kind !== 'hard' && p.status === 'partial' && (
              <span className="badge warn">{EVIDENCE_STATUS_LABEL.partial}</span>
            )}
            {p.status === 'transferable' && (
              <span className="badge info">{EVIDENCE_STATUS_LABEL.transferable}</span>
            )}
            {kind === 'hard' && p.status === 'matched' && (
              <span className="badge ok">{EVIDENCE_STATUS_LABEL.matched}</span>
            )}
          </div>
          <div className="ev">{p.evidence}</div>
        </li>
      ))}
    </ul>
  );
}

function IssueNotices({
  issues,
  details,
}: {
  issues: string[];
  details?: GreetingCheckIssue[];
}) {
  if (!issues.length && !details?.length) return null;
  const factIssues = details ? details.filter((d) => d.kind === 'fact').map((d) => d.message) : [];
  const otherIssues = details ? details.filter((d) => d.kind !== 'fact').map((d) => d.message) : issues;

  return (
    <div className="stack-sm">
      {factIssues.length > 0 && (
        <div className="notice warn">
          <span><strong>事实待核对：</strong>{factIssues.join('；')}</span>
        </div>
      )}
      {otherIssues.length > 0 && (
        <div className="notice warn">
          <span><strong>风格提示：</strong>{otherIssues.join('；')}</span>
        </div>
      )}
    </div>
  );
}

function ResultWorkspace({
  job,
  result,
  greeting,
  isEdited,
  previousGreeting,
  pendingGreeting,
  temporaryRule,
  useExamplesOverride,
  effectiveConfig,
  analysisStale,
  greetingStale,
  hasCachedGreeting,
  canRegenerate,
  currentModel,
  onGreetingChange,
  onTemporaryRuleChange,
  onUseExamplesChange,
  onRegenerateGreeting,
  onApplyCachedGreeting,
  onUpdateAnalysis,
  onForceReanalyze,
  onAcceptPending,
  onDiscardPending,
  onRestorePrevious,
}: {
  job: Job;
  result: AnalysisResult;
  greeting: string;
  isEdited: boolean;
  previousGreeting: string | null;
  pendingGreeting: GreetingVersion | null;
  temporaryRule: string;
  useExamplesOverride: boolean | undefined;
  effectiveConfig: EffectiveGreetingConfig | null;
  analysisStale: boolean;
  greetingStale: boolean;
  hasCachedGreeting: boolean;
  canRegenerate: boolean;
  currentModel?: string;
  onGreetingChange: (t: string) => void;
  onTemporaryRuleChange: (r: string) => void;
  onUseExamplesChange: (enabled: boolean | undefined) => void;
  onRegenerateGreeting: () => void;
  onApplyCachedGreeting: () => void;
  onUpdateAnalysis: () => void;
  onForceReanalyze: () => void;
  onAcceptPending: () => void;
  onDiscardPending: () => void;
  onRestorePrevious: () => void;
}) {
  const toConfirm = result.toConfirm ?? [];
  const hardRequirements = result.hardRequirements ?? [];
  const decisionFactors = result.decisionFactors ?? [];
  const capabilityEvidence = result.capabilityEvidence;
  const capabilityCoverage = result.capabilityCoverage;
  const scoreEvidence = capabilityEvidence &&
    (['matched', 'transferable', 'partial', 'not_shown', 'confirmed_lacking'] as const)
      .filter((status) => capabilityEvidence[status] > 0)
      .map((status) => `${EVIDENCE_STATUS_LABEL[status]} ${capabilityEvidence[status]} 项`)
      .join(' · ');
  const scoreGuide = '评分由 AI 根据整份职位描述和你的档案综合判断，仅供投递参考。证据覆盖率表示已有证据支持的能力主题占比。';
  const matchGroups = [
    { label: '硬性条件', kind: 'hard', items: hardRequirements },
    { label: '匹配优势', kind: 'strengths', items: result.strengths },
    { label: '能力差距', kind: 'gaps', items: result.gaps },
    { label: '其他待确认事项', kind: 'confirm', items: toConfirm },
  ] as const;
  const [showBasis, setShowBasis] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showExampleOpts, setShowExampleOpts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const basisId = useId();
  const historyId = useId();
  const exampleOptsId = useId();
  const [examplePreferred, setExamplePreferred] = useState(false);
  const [exampleRoleTags, setExampleRoleTags] = useState(job.title);

  const badge =
    result.recommendation === 'recommended' ? 'ok' : result.recommendation === 'consider' ? 'warn' : 'err';
  const effectiveUseExamples = useExamplesOverride ?? effectiveConfig?.preferences.useExamples ?? true;
  const charCount = greeting.replace(/\s/g, '').length;

  const copy = async () => {
    try {
      await getPlatform().copyText(greeting);
      setFeedback(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setFeedback({
        text: `复制失败：${err instanceof Error ? err.message : String(err)}。请在文本框中手动选中复制`,
        error: true,
      });
    }
  };
  const actionAnnouncement = copied ? '已复制打招呼语' : feedback?.text ?? '';
  const stateAnnouncement = analysisStale
    ? '匹配分析已过期，请先更新分析'
    : pendingGreeting
      ? '新版本已生成，未覆盖你的手动编辑'
      : '';

  const saveExample = async () => {
    const text = greeting.trim();
    if (!text || savingExample) return;
    setSavingExample(true);
    setFeedback(null);
    try {
      await saveGreetingExample({
        profileId: result.profileId,
        jobFingerprint: job.fingerprint,
        jobTitle: job.title,
        company: job.company,
        jobExcerpt: job.description.slice(0, GREETING_EXCERPT_LIMIT),
        points: result.greetingPoints,
        greeting: text,
        preferred: examplePreferred,
        roleTags: parseListInput(exampleRoleTags),
        createdAt: new Date().toISOString(),
      });
      setFeedback({ text: '已保存为当前档案样例', error: false });
      setShowExampleOpts(false);
    } catch (err) {
      setFeedback({ text: `保存失败：${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setSavingExample(false);
    }
  };

  return (
    <>
      {/* 匹配分析卡 */}
      <section className="panel-card stack">
        <h2 className="sr-only">匹配分析</h2>
        <p className="sr-only" role="status">{stateAnnouncement}</p>
        {analysisStale && (
          <div className="notice warn row wrap">
            <span className="small grow">
              职位内容、档案事实、选材规则或模型（{result.model}{currentModel && currentModel !== result.model ? ` → ${currentModel}` : ''}）已更新，当前分析已过期
            </span>
            <button type="button" className="primary small" disabled={!canRegenerate} onClick={onUpdateAnalysis}>
              更新分析
            </button>
          </div>
        )}

        <div className="row between wrap">
          <div className="score-badge-row">
            {result.matchScore === null ? (
              <span className="muted small">
                {capabilityCoverage === 0 ? '证据不足，暂不评分' : 'AI 暂未评分'}
              </span>
            ) : (
              <span>
                <span className="score-num">{result.matchScore}</span>
                <span className="muted small"> /100 AI 能力匹配</span>
              </span>
            )}
            <span className={`badge ${badge}`}>{RECOMMENDATION_LABEL[result.recommendation]}</span>
          </div>
          <button
            type="button"
            className="ghost small"
            title="忽略本地缓存，强制重新执行完整两阶段分析"
            disabled={!canRegenerate}
            onClick={onForceReanalyze}
          >
            <IconRefresh size={13} />
            强制重分析
          </button>
        </div>

        <div className="pre">{result.summary}</div>

        {decisionFactors.length > 0 && (
          <ul className="decision-list" aria-label="投递前优先核对">
            {decisionFactors.map((item) => {
              const label =
                item.status === 'confirmed_lacking' && item.category === 'hard'
                  ? '明确冲突'
                  : item.category === 'hard'
                    ? '高影响待确认'
                    : item.status && EVIDENCE_STATUS_LABEL[item.status];
              return (
                <li key={item.requirement}>
                  <span>{item.requirement}</span>
                  {label && (
                    <span className={`badge ${item.status === 'confirmed_lacking' ? 'err' : item.category === 'hard' ? 'warn' : ''}`}>
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      </section>

      {/* 打招呼语工作台 */}
      <section className="panel-card stack">
        <div className="row between wrap">
          <div className="row-sm">
            <h2 className="card-title">打招呼语</h2>
            <span className="badge tabular">{charCount} 字</span>
            {isEdited && <span className="badge info">已编辑</span>}
          </div>
          <div className="row-sm">
            <button
              type="button"
              className="ghost small"
              aria-expanded={showBasis}
              aria-controls={basisId}
              onClick={() => setShowBasis((v) => !v)}
            >
              <IconInfo size={13} />
              依据
            </button>
            {previousGreeting && (
              <button
                type="button"
                className="ghost small"
                aria-expanded={showHistory}
                aria-controls={historyId}
                onClick={() => setShowHistory((v) => !v)}
              >
                <IconHistory size={13} />
                上一版
              </button>
            )}
          </div>
        </div>

        {showBasis && (
          <div id={basisId} className="panel-card subtle stack-sm">
            {result.greetingContext && (
              <div className="small"><strong>沟通重点</strong> · {result.greetingContext.focus}</div>
            )}
            {result.greetingPoints.length > 0 && (
              <div className="stack-sm">
                <h3 className="subhead">本次选材（{result.greetingPoints.length} 条，按优先级排列）</h3>
                <ul className="dot-list">
                  {result.greetingPoints.map((point, index) => (
                    <li key={point}>
                      {result.greetingContext?.requirements[index] && (
                        <div className="req">{result.greetingContext.requirements[index]}</div>
                      )}
                      <span className="small">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.greetingStyleExamples && (
              <div className="stack-sm">
                <h3 className="subhead">本次写作样例</h3>
                {result.greetingStyleExamples.length ? (
                  <ul className="dot-list">
                    {result.greetingStyleExamples.map((example, index) => (
                      <li key={example.jobFingerprint} className="small">
                        {index === 0 ? '主要样例' : '辅助样例'} · {[example.jobTitle, example.company].filter(Boolean).join(' · ')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted small">
                    {result.effectivePreferences?.useExamples ? '未找到相关历史样例，使用默认写法' : '本次已关闭历史样例参考'}
                  </span>
                )}
              </div>
            )}
            <div className="stack-sm">
              <h3 className="subhead">生效写作规则与参数</h3>
              {(effectiveConfig?.preferences ?? result.effectivePreferences) && (
                <div className="muted">
                  {formatPreferencesSummary((effectiveConfig?.preferences ?? result.effectivePreferences)!)}
                </div>
              )}
              <div className="pre muted">
                {(effectiveConfig?.combinedRulesText ?? result.effectiveRules) || '未配置自定义规则，按默认自然风格生成'}
              </div>
            </div>
          </div>
        )}

        {showHistory && previousGreeting && (
          <div id={historyId} className="panel-card subtle stack-sm">
            <div className="row between wrap">
              <h3 className="subhead">上一版内容</h3>
              <div className="row-sm">
                <button
                  type="button"
                  className="small"
                  onClick={() => {
                    onRestorePrevious();
                    setShowHistory(false);
                  }}
                >
                  恢复此版
                </button>
                <button
                  type="button"
                  className="ghost icon-btn small"
                  aria-label="关闭上一版"
                  title="关闭上一版"
                  onClick={() => setShowHistory(false)}
                >
                  <IconX size={13} />
                </button>
              </div>
            </div>
            <div className="pre">{previousGreeting}</div>
          </div>
        )}

        {analysisStale && (
          <div className="notice warn row wrap">
            <span className="small grow">匹配分析已过期，请先点击上方“更新分析”同步最新事实后再重写打招呼语</span>
          </div>
        )}

        {greetingStale && !analysisStale && (
          <div className="notice warn row wrap">
            <span className="small grow">
              {hasCachedGreeting ? '已命中该规则与样例配置的本地缓存' : '写作设置已更新，可重写打招呼语'}
            </span>
            <div className="row-sm">
              {hasCachedGreeting && (
                <button type="button" className="primary small" onClick={onApplyCachedGreeting}>
                  使用缓存
                </button>
              )}
              <button type="button" className="small" disabled={!canRegenerate} onClick={onRegenerateGreeting}>
                {hasCachedGreeting ? '重新生成' : '按新规则重写'}
              </button>
            </div>
          </div>
        )}

        <IssueNotices issues={result.greetingIssues} details={result.greetingIssueDetails} />

        {pendingGreeting && (
          <div className="compare-box stack-sm">
            <div className="row between wrap">
              <p className="subhead compare-title">新版本已生成（未覆盖你的手动编辑）</p>
              <div className="row-sm">
                <button type="button" className="primary small" onClick={onAcceptPending}>
                  采用新版
                </button>
                <button type="button" className="small" onClick={onDiscardPending}>
                  保留编辑
                </button>
              </div>
            </div>
            <IssueNotices
              issues={pendingGreeting.greetingIssues}
              details={pendingGreeting.greetingIssueDetails}
            />
            <div className="pre">{pendingGreeting.text}</div>
          </div>
        )}

        <div className="composer-box">
          <textarea
            aria-label="打招呼语"
            className="autosize"
            rows={6}
            value={greeting}
            disabled={savingExample}
            onChange={(e) => {
              onGreetingChange(e.target.value);
              setFeedback(null);
            }}
          />
          <div className="composer-toolbar">
            <p className="sr-only" role="status">{actionAnnouncement}</p>
            <button type="button" className="primary small" onClick={() => void copy()}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              {copied ? '已复制' : '复制打招呼语'}
            </button>
            <div className="row-sm">
              <button
                type="button"
                className="small"
                disabled={savingExample || !greeting.trim()}
                onClick={() => void saveExample()}
              >
                <IconBookmark size={13} />
                {savingExample ? '保存中…' : '存为样例'}
              </button>
              <button
                type="button"
                className="icon-btn small"
                title="样例保存选项（优先参考与岗位标签）"
                aria-label="样例保存选项"
                aria-expanded={showExampleOpts}
                aria-controls={exampleOptsId}
                onClick={() => setShowExampleOpts((v) => !v)}
              >
                <IconSliders size={13} />
              </button>
            </div>
          </div>
        </div>

        {showExampleOpts && (
          <div id={exampleOptsId} className="panel-card subtle stack-sm">
            <ToggleSwitch
              checked={examplePreferred}
              onChange={setExamplePreferred}
              label="设为当前档案的优先参考样例"
            />
            <label className="field">
              <span>适用岗位标签（逗号或顿号分隔）</span>
              <input
                type="text"
                value={exampleRoleTags}
                onChange={(e) => setExampleRoleTags(e.target.value)}
                placeholder="例：AI Agent、企业交付"
              />
            </label>
          </div>
        )}

        {feedback && (
          <div className={feedback.error ? 'notice err' : 'notice ok'}>
            {feedback.text}
          </div>
        )}

        {/* 单次补充要求与独立重写 */}
        <div className="stack-sm">
          <div className="refine-bar">
            <textarea
              rows={1}
              enterKeyHint="send"
              aria-label="单次生成补充要求"
              value={temporaryRule}
              placeholder="微调要求，如：分3点写 / 精简到80字…"
              onChange={(e) => onTemporaryRuleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && canRegenerate && !analysisStale) {
                  e.preventDefault();
                  onRegenerateGreeting();
                }
              }}
            />
            <button
              type="button"
              className="small"
              disabled={!canRegenerate || analysisStale}
              onClick={onRegenerateGreeting}
              title={analysisStale ? '匹配分析已过期，请先更新分析' : '强制重新生成打招呼语，不重跑匹配分析'}
            >
              <IconWand size={13} />
              重写
            </button>
          </div>
          <div className="row between wrap">
            <ToggleSwitch
              checked={effectiveUseExamples}
              onChange={(v) => onUseExamplesChange(v)}
              label="参考历史样例风格"
            />
            <span className="muted">不重跑匹配分析</span>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <h2 className="sr-only">逐项分析</h2>
        <details className="drawer match-details">
          <summary>
            查看逐项分析
            <IconChevronDown size={14} className="chevron" />
          </summary>
          <div className="stack match-details-body">
            <p className="small muted">{scoreGuide}</p>
            {capabilityCoverage != null && (
              <div className="small muted">证据覆盖率 {capabilityCoverage}%</div>
            )}
            {scoreEvidence && <div className="small muted">能力主题 · {scoreEvidence}</div>}
            {matchGroups.map(({ label, kind, items }) => items.length > 0 && (
              <div key={kind} className="stack-sm">
                <h3>{label}（{items.length}）</h3>
                <MatchPointList items={items} kind={kind} />
              </div>
            ))}
          </div>
        </details>
      </section>
    </>
  );
}

function DiagnosticsFooter({
  model,
  canSnapshot,
  requestSnapshot,
}: {
  model?: string;
  canSnapshot: boolean;
  requestSnapshot: () => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const panelId = useId();

  const run = async (mode: 'copy' | 'download') => {
    try {
      const text = await requestSnapshot();
      if (mode === 'copy') {
        await getPlatform().copyText(text);
        setMsg(`已复制（${text.length} 字符）`);
      } else {
        await getPlatform().saveTextFile(`joblens-page-${Date.now()}.txt`, text);
        setMsg('已导出');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <p className="sr-only" role="status">{msg ?? ''}</p>
      <div className="row between">
        <span className="muted truncate">
          不自动发送 · 需人工核对{model ? ` · ${model}` : ''}
        </span>
        {canSnapshot && (
          <button
            type="button"
            className="link small"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '收起诊断' : '诊断'}
          </button>
        )}
      </div>
      {open && canSnapshot && (
        <div id={panelId} className="panel-card stack-sm">
          <div className="muted">导出页面结构以排查职位识别规则（仅本地生成）。</div>
          <div className="row wrap">
            <button type="button" className="small" onClick={() => void run('download')}>
              导出页面结构
            </button>
            <button type="button" className="small" onClick={() => void run('copy')}>
              复制页面结构
            </button>
          </div>
          {msg && <div className="muted">{msg}</div>}
        </div>
      )}
    </>
  );
}
