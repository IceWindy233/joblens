import { useState } from 'react';
import { browser } from 'wxt/browser';
import type {
  AnalysisResult,
  EffectiveGreetingConfig,
  GreetingCheckIssue,
  Job,
  JobState,
  MatchPoint,
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
import { useAnalysis, type GreetingVersion } from './useAnalysis';
import { GREETING_EXCERPT_LIMIT } from '../../analysis/greeting-examples';

const JOB_ERROR_TEXT: Record<string, string> = {
  UNSUPPORTED_PAGE: '请打开 BOSS 直聘职位页面',
  CONTENT_SCRIPT_MISSING: '请刷新当前 BOSS 页面后再试',
  NO_ACTIVE_JOB: '请点开一个具体职位查看分析',
  JOB_EXTRACTION_FAILED: '职位信息读取失败，页面结构可能已变更',
};

function openOptions() {
  void browser.runtime.openOptionsPage();
}

export default function App() {
  const data = useAppData();
  const { jobState, refresh, requestSnapshot } = useActiveTabJob();
  const job = jobState?.status === 'ready' ? jobState.job : null;
  const profile = data.profiles.find((p) => p.id === data.settings.activeProfileId) ?? null;
  const analysis = useAnalysis(job, profile, data.settings);

  let configIssue: AppErrorCode | 'NO_PROFILE' | null = null;
  if (!data.settings.llm) configIssue = 'LLM_NOT_CONFIGURED';
  else if (!data.hasPermission) configIssue = 'LLM_PERMISSION_MISSING';
  else if (!data.apiKey) configIssue = 'LLM_KEY_MISSING';
  else if (!profile) configIssue = 'NO_PROFILE';

  const canAnalyze = data.loaded && !configIssue && !!job && analysis.view.kind !== 'running';

  return (
    <div className="sp-shell">
      <header className="sp-header">
        <div className="profile-select-wrap">
          <IconUser size={14} className="muted" />
          <select
            aria-label="当前简历档案"
            value={profile?.id ?? ''}
            disabled={data.profiles.length === 0}
            onChange={(e) => void updateSettings({ activeProfileId: e.target.value || null })}
          >
            {data.profiles.length === 0 && <option value="">未创建档案</option>}
            {!profile && data.profiles.length > 0 && <option value="">请选择档案</option>}
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="打开设置"
          aria-label="打开设置"
          onClick={openOptions}
        >
          <IconSettings size={16} />
        </button>
      </header>

      <main className="sp-body">
        {data.loaded && configIssue && (
          <div className="notice warn row">
            <div className="row-sm grow">
              <IconAlert size={15} />
              <span className="small">
                {configIssue === 'NO_PROFILE' ? '请先创建并选择一份简历档案' : ERROR_MESSAGES[configIssue]}
              </span>
            </div>
            <button type="button" className="primary small" onClick={openOptions}>
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
          onAnalyze={() => {
            if (data.settings.llm && data.apiKey) void analysis.start(data.settings.llm, data.apiKey);
          }}
          onCancel={analysis.cancel}
        />

        {analysis.view.kind === 'error' && (
          <div className="notice err">
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
            onUpdateAnalysis={() => {
              if (data.settings.llm && data.apiKey) {
                void analysis.start(data.settings.llm, data.apiKey, { forceMatch: false, forceGreeting: false });
              }
            }}
            onForceReanalyze={() => {
              if (data.settings.llm && data.apiKey) {
                void analysis.start(data.settings.llm, data.apiKey, { forceMatch: true, forceGreeting: true });
              }
            }}
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

  return (
    <section className="panel-card stack">
      <div className="row between">
        <span className="muted">当前职位</span>
        <div className="row-sm">
          {state?.status === 'ready' && (
            <button
              type="button"
              className="link small"
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
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{state.job.title}</div>
          <div className="muted">
            {[state.job.company, state.job.location, state.job.salary].filter(Boolean).join(' · ')}
          </div>
          {expanded && <div className="pre jd-preview">{state.job.description}</div>}
        </div>
      )}

      {showAction && (
        runningPhase ? (
          <div className="row">
            <button type="button" className="grow" disabled>
              <IconRefresh size={14} className="spin" />
              {runningPhase === 'greeting' ? '2/2 撰写打招呼语…' : '1/2 分析岗位匹配度…'}
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
            分析当前职位
          </button>
        )
      )}
    </section>
  );
}

function MatchPointList({ items, kind, empty }: { items: MatchPoint[]; kind: 'strengths' | 'gaps'; empty: string }) {
  if (items.length === 0) return <div className="muted">{empty}</div>;
  return (
    <ul className={`dot-list ${kind === 'gaps' ? 'gaps' : ''}`}>
      {items.map((p, i) => (
        <li key={i}>
          <div className="row wrap" style={{ gap: 5 }}>
            <span className="req">{p.requirement}</span>
            {p.category === 'hard' && (
              <span className="badge warn">{REQUIREMENT_CATEGORY_LABEL.hard}</span>
            )}
            {p.category === 'bonus' && (
              <span className="badge">{REQUIREMENT_CATEGORY_LABEL.bonus}</span>
            )}
            {p.status === 'confirmed_lacking' && (
              <span className="badge err">{EVIDENCE_STATUS_LABEL.confirmed_lacking}</span>
            )}
            {p.status === 'not_shown' && (
              <span className="badge">{EVIDENCE_STATUS_LABEL.not_shown}</span>
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
  const [matchTab, setMatchTab] = useState<'all' | 'strengths' | 'gaps'>('all');
  const [showBasis, setShowBasis] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showExampleOpts, setShowExampleOpts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [examplePreferred, setExamplePreferred] = useState(false);
  const [exampleRoleTags, setExampleRoleTags] = useState(job.title);

  const badge =
    result.recommendation === 'recommended' ? 'ok' : result.recommendation === 'consider' ? 'warn' : 'err';
  const effectiveUseExamples = useExamplesOverride ?? effectiveConfig?.preferences.useExamples ?? true;
  const charCount = greeting.replace(/\s/g, '').length;

  const copy = async () => {
    await navigator.clipboard.writeText(greeting);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveExample = async () => {
    const text = greeting.trim();
    if (!text || savingExample) return;
    setSavingExample(true);
    setSaveMessage(null);
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
      setSaveMessage({ text: '已保存为当前档案样例', error: false });
      setShowExampleOpts(false);
    } catch (err) {
      setSaveMessage({ text: `保存失败：${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setSavingExample(false);
    }
  };

  return (
    <>
      {/* 匹配分析卡 */}
      <section className="panel-card stack">
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

        <div className="row between">
          <div className="score-badge-row">
            <span className="score-num">{result.matchScore}</span>
            <span className="muted">/100</span>
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

        <div className="segmented full">
          <button
            type="button"
            className={`seg-tab ${matchTab === 'all' ? 'active' : ''}`}
            onClick={() => setMatchTab('all')}
          >
            全部
          </button>
          <button
            type="button"
            className={`seg-tab ${matchTab === 'strengths' ? 'active' : ''}`}
            onClick={() => setMatchTab('strengths')}
          >
            优势 ({result.strengths.length})
          </button>
          <button
            type="button"
            className={`seg-tab ${matchTab === 'gaps' ? 'active' : ''}`}
            onClick={() => setMatchTab('gaps')}
          >
            差距 ({result.gaps.length})
          </button>
        </div>

        {(matchTab === 'all' || matchTab === 'strengths') && (
          <div className="stack-sm">
            {matchTab === 'all' && <div className="muted">匹配优势</div>}
            <MatchPointList items={result.strengths} kind="strengths" empty="未列出明确优势" />
          </div>
        )}

        {(matchTab === 'all' || matchTab === 'gaps') && (
          <div className="stack-sm">
            {matchTab === 'all' && <div className="muted">主要差距</div>}
            <MatchPointList items={result.gaps} kind="gaps" empty="未列出明显差距" />
          </div>
        )}
      </section>

      {/* 打招呼语工作台 */}
      <section className="panel-card stack">
        <div className="row between wrap">
          <div className="row-sm">
            <h3>打招呼语</h3>
            <span className="badge tabular">{charCount} 字</span>
            {isEdited && <span className="badge info">已编辑</span>}
          </div>
          <div className="row-sm">
            <button
              type="button"
              className={`ghost small ${showBasis ? 'primary' : ''}`}
              onClick={() => setShowBasis((v) => !v)}
            >
              <IconInfo size={13} />
              依据
            </button>
            {previousGreeting && (
              <button
                type="button"
                className="ghost small"
                onClick={() => setShowHistory((v) => !v)}
              >
                <IconHistory size={13} />
                上一版
              </button>
            )}
          </div>
        </div>

        {showBasis && (
          <div className="panel-card subtle stack-sm">
            {result.greetingPoints.length > 0 && (
              <div className="stack-sm">
                <span className="small" style={{ fontWeight: 600 }}>本次选中匹配事实（{result.greetingPoints.length} 条）</span>
                <ul className="dot-list">
                  {result.greetingPoints.map((p) => (
                    <li key={p}><span className="small">{p}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <div className="stack-sm">
              <span className="small" style={{ fontWeight: 600 }}>生效写作规则与参数</span>
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
          <div className="panel-card subtle stack-sm">
            <div className="row between">
              <span className="small" style={{ fontWeight: 600 }}>上一版内容</span>
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
                <button type="button" className="ghost icon-btn small" onClick={() => setShowHistory(false)}>
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
              {hasCachedGreeting ? '已命中该规则与样例配置的本地缓存' : '写作规则、临时要求或参考样例已变更'}
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
              <span className="small" style={{ fontWeight: 600, color: 'var(--primary-hover)' }}>
                新版本已生成（未覆盖你的手动编辑）
              </span>
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
              setSaveMessage(null);
            }}
          />
          <div className="composer-toolbar">
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
                className={`icon-btn small ${showExampleOpts ? 'primary' : ''}`}
                title="样例保存选项（优先参考与岗位标签）"
                aria-label="样例保存选项"
                onClick={() => setShowExampleOpts((v) => !v)}
              >
                <IconSliders size={13} />
              </button>
            </div>
          </div>
        </div>

        {showExampleOpts && (
          <div className="panel-card subtle stack-sm">
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

        {saveMessage && (
          <div role="status" className={saveMessage.error ? 'notice err' : 'notice ok'}>
            {saveMessage.text}
          </div>
        )}

        {/* 单次补充要求与独立重写 */}
        <div className="stack-sm">
          <div className="refine-bar">
            <input
              type="text"
              aria-label="单次生成补充要求"
              value={temporaryRule}
              disabled={analysisStale}
              placeholder={analysisStale ? '请先更新匹配分析…' : '微调要求，如：分3点写 / 精简到80字…'}
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

  const run = async (mode: 'copy' | 'download') => {
    try {
      const text = await requestSnapshot();
      if (mode === 'copy') {
        await navigator.clipboard.writeText(text);
        setMsg(`已复制（${text.length} 字符）`);
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `joblens-dom-${Date.now()}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMsg('已下载');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="row between">
        <span className="muted truncate">
          不自动发送 · 需人工核对{model ? ` · ${model}` : ''}
        </span>
        {canSnapshot && (
          <button type="button" className="link small" onClick={() => setOpen((v) => !v)}>
            {open ? '收起诊断' : '诊断'}
          </button>
        )}
      </div>
      {open && canSnapshot && (
        <div className="panel-card stack-sm">
          <div className="muted">导出页面 DOM 骨架以排查职位识别规则（仅本地生成）。</div>
          <div className="row">
            <button type="button" className="small" onClick={() => void run('download')}>
              下载页面结构
            </button>
            <button type="button" className="small" onClick={() => void run('copy')}>
              复制页面结构
            </button>
            <IconChevronDown size={12} className="muted" />
          </div>
          {msg && <div className="muted">{msg}</div>}
        </div>
      )}
    </>
  );
}
