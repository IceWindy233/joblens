import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { AnalysisResult, Job, JobState, MatchPoint, UserProfile } from '../../shared/types';
import { RECOMMENDATION_LABEL } from '../../shared/types';
import { ERROR_MESSAGES, type AppErrorCode } from '../../shared/errors';
import { saveGreetingExample, updateSettings } from '../../storage';
import { useAppData } from '../../components/useAppData';
import { useActiveTabJob } from './useActiveTabJob';
import { useAnalysis } from './useAnalysis';
import { GREETING_EXCERPT_LIMIT } from '../../analysis/greeting-examples';

const JOB_ERROR_TEXT: Record<string, string> = {
  UNSUPPORTED_PAGE: '当前页面不支持读取职位，请打开 BOSS 直聘职位页',
  CONTENT_SCRIPT_MISSING: '请刷新 BOSS 页面后重试（扩展安装或更新后需要刷新）',
  NO_ACTIVE_JOB: '请先打开具体职位',
  JOB_EXTRACTION_FAILED: '当前职位读取失败（页面结构可能已变化）',
};

function openOptions() {
  void browser.runtime.openOptionsPage();
}

export default function App() {
  const data = useAppData();
  const { jobState, refresh, requestSnapshot } = useActiveTabJob();
  const job = jobState?.status === 'ready' ? jobState.job : null;
  const profile = data.profiles.find((p) => p.id === data.settings.activeProfileId) ?? null;
  const analysis = useAnalysis(job, profile);

  // 配置就绪检查
  let configIssue: AppErrorCode | 'NO_PROFILE' | null = null;
  if (!data.settings.llm) configIssue = 'LLM_NOT_CONFIGURED';
  else if (!data.hasPermission) configIssue = 'LLM_PERMISSION_MISSING';
  else if (!data.apiKey) configIssue = 'LLM_KEY_MISSING';
  else if (!profile) configIssue = 'NO_PROFILE';

  const canAnalyze = data.loaded && !configIssue && !!job && analysis.view.kind !== 'running';

  return (
    <div>
      {/* Chrome 侧边栏标题栏已显示扩展名，这里不再重复标题 */}
      <div className="row between section">
        <div style={{ flex: 1, minWidth: 0 }}>
          <ProfilePicker profiles={data.profiles} activeId={profile?.id ?? null} />
        </div>
        <button onClick={openOptions}>设置</button>
      </div>

      {data.loaded && configIssue && (
        <div className="section">
          <div className="notice warn row between">
            <span>{configIssue === 'NO_PROFILE' ? '请先在设置中导入简历并选择档案' : ERROR_MESSAGES[configIssue]}</span>
            <button className="link" onClick={openOptions}>去设置</button>
          </div>
        </div>
      )}

      <JobSection state={jobState} onRefresh={refresh} />

      <div className="section">
        {analysis.view.kind === 'running' ? (
          <button className="block" onClick={analysis.cancel}>分析中…（点击取消）</button>
        ) : (
          <button
            className="primary block"
            disabled={!canAnalyze}
            onClick={() => {
              if (data.settings.llm && data.apiKey) void analysis.start(data.settings.llm, data.apiKey);
            }}
          >
            {analysis.view.kind === 'done' ? '重新分析' : '分析当前职位'}
          </button>
        )}
        <p className="muted">仅在点击时调用模型；职位内容、档案摘要及选中的历史样例会发送给你配置的模型服务商。</p>
      </div>

      {analysis.view.kind === 'error' && (
        <div className="section">
          <div className="notice err">{analysis.view.error.message}</div>
        </div>
      )}

      {job && analysis.view.kind === 'done' && (
        <ResultSection
          key={JSON.stringify([job.fingerprint, analysis.view.result.profileId, analysis.view.result.profileVersion])}
          job={job}
          result={analysis.view.result}
          greeting={analysis.greeting ?? analysis.view.result.greeting}
          onGreetingChange={analysis.setGreeting}
        />
      )}

      {jobState?.status !== 'error' ||
      (jobState.code !== 'UNSUPPORTED_PAGE' && jobState.code !== 'CONTENT_SCRIPT_MISSING') ? (
        <DiagnosticsSection requestSnapshot={requestSnapshot} />
      ) : null}
    </div>
  );
}

/** 开发诊断：导出当前页面结构骨架，用于核验 BOSS 选择器（无需开发者工具）。 */
function DiagnosticsSection({ requestSnapshot }: { requestSnapshot: () => Promise<string> }) {
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
    <details className="section">
      <summary className="muted">开发诊断</summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <div className="muted">
          导出当前页面的结构骨架（标签、class 与可见文字片段），用于核验职位读取规则。只在点击时生成，不会自动上传。
        </div>
        <div className="row">
          <button onClick={() => void run('download')}>下载页面结构</button>
          <button onClick={() => void run('copy')}>复制页面结构</button>
        </div>
        {msg && <div className="muted">{msg}</div>}
      </div>
    </details>
  );
}

function ProfilePicker({ profiles, activeId }: { profiles: UserProfile[]; activeId: string | null }) {
  return (
    <div className="row">
      <span className="small">当前简历</span>
      <select
        className="grow"
        value={activeId ?? ''}
        disabled={profiles.length === 0}
        onChange={(e) => void updateSettings({ activeProfileId: e.target.value || null })}
      >
        {profiles.length === 0 && <option value="">（尚无档案）</option>}
        {!activeId && profiles.length > 0 && <option value="">请选择档案</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function JobSection({ state, onRefresh }: { state: JobState | null; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="section stack">
      <div className="row between">
        <h2>当前职位</h2>
        <button className="link small" onClick={onRefresh}>重新读取</button>
      </div>
      {(!state || state.status === 'loading') && <div className="muted">正在识别当前职位…</div>}
      {state?.status === 'error' && (
        <div className={state.code === 'JOB_EXTRACTION_FAILED' ? 'notice err' : 'notice'}>
          {JOB_ERROR_TEXT[state.code]}
          {state.detail && <div className="muted">{state.detail}</div>}
        </div>
      )}
      {state?.status === 'ready' && (
        <>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{state.job.title}</div>
          <div className="small">
            {[state.job.company, state.job.location, state.job.salary].filter(Boolean).join(' | ')}
          </div>
          <div className="row">
            <span className="badge ok">JD 已识别</span>
            <button className="link small" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起 JD 预览' : '展开 JD 预览'}
            </button>
          </div>
          {expanded ? (
            <div className="pre jd-preview">{state.job.description}</div>
          ) : (
            <div className="muted pre">
              {state.job.description.slice(0, 120)}
              {state.job.description.length > 120 ? '…' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Points({ items, empty }: { items: MatchPoint[]; empty: string }) {
  if (items.length === 0) return <div className="muted">{empty}</div>;
  return (
    <ul className="points">
      {items.map((p, i) => (
        <li key={i}>
          <span className="req">{p.requirement}</span>
          <div className="small">{p.evidence}</div>
        </li>
      ))}
    </ul>
  );
}

function ResultSection({
  job,
  result,
  greeting,
  onGreetingChange,
}: {
  job: Job;
  result: AnalysisResult;
  greeting: string;
  onGreetingChange: (t: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; error: boolean } | null>(null);
  const badge =
    result.recommendation === 'recommended' ? 'ok' : result.recommendation === 'consider' ? 'warn' : 'err';

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
        createdAt: new Date().toISOString(),
      });
      setSaveMessage({ text: '已保存为当前档案的样例', error: false });
    } catch (err) {
      setSaveMessage({ text: `样例保存失败：${err instanceof Error ? err.message : String(err)}`, error: true });
    } finally {
      setSavingExample(false);
    }
  };

  return (
    <>
      <div className="section stack">
        <div className="row">
          <span className="score">{result.matchScore}</span>
          <span className="muted">/100 辅助评分</span>
          <span className={`badge ${badge}`}>{RECOMMENDATION_LABEL[result.recommendation]}</span>
        </div>
        <div className="pre">{result.summary}</div>
        <h3>主要优势</h3>
        <Points items={result.strengths} empty="未列出明确优势" />
        <h3>主要差距</h3>
        <Points items={result.gaps} empty="未列出明显差距" />
        <div className="muted">
          评分由模型主观给出，仅供参考，不代表录用概率。模型：{result.model} ·{' '}
          {new Date(result.createdAt).toLocaleTimeString()}
        </div>
      </div>
      <div className="section stack">
        <h3>打招呼语</h3>
        {result.greetingPoints.length > 0 && (
          <details>
            <summary className="muted">本次使用的候选匹配事实</summary>
            <ul className="points">{result.greetingPoints.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>
        )}
        {result.greetingIssues.length > 0 && (
          <div className="notice warn">模型草稿待核对：{result.greetingIssues.join('；')}</div>
        )}
        <textarea
          aria-label="打招呼语"
          className="autosize"
          rows={8}
          value={greeting}
          disabled={savingExample}
          onChange={(e) => {
            onGreetingChange(e.target.value);
            setSaveMessage(null);
          }}
        />
        <div className="row">
          <button className="primary" onClick={() => void copy()}>
            {copied ? '已复制' : '复制打招呼语'}
          </button>
          <button disabled={savingExample || !greeting.trim()} onClick={() => void saveExample()}>
            {savingExample ? '保存中…' : '保存为样例'}
          </button>
        </div>
        {saveMessage && <div role="status" className={saveMessage.error ? 'notice err' : 'muted'}>{saveMessage.text}</div>}
        <div className="muted">确认内容真实后可保存为样例；下次分析相近岗位时仅作为写法参考。</div>
        <div className="muted">插件不会自动发送消息，请自行粘贴到聊天框。</div>
      </div>
    </>
  );
}
