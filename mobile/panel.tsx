import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { JobState } from '../shared/types';
import { RECOMMENDATION_LABEL } from '../shared/types';
import { jobStateKey } from '../shared/messages';
import { BossAppJobTracker } from '../adapters/boss-app/tracker';
import type { AppTreeSnapshot } from '../adapters/boss-app/parse';
import { Workspace, type QuickAnalysisOutcome, type WorkspaceStatus } from '../entrypoints/sidepanel/App';
import { installNative, native, onNative } from './native';
import '../components/styles.css';

// 常驻于无障碍服务中的 WebView：收起时仍接收节点树，驱动悬浮气泡与速览卡；展开时作为“详情”面板。
// 点按气泡 = 一次快速分析请求：出分后把打招呼语写入剪贴板。只有用户点按时才会调用模型。

type Tone = 'muted' | 'primary' | 'ok' | 'warn' | 'danger';

/** 与 android/.../overlay/BubbleView.kt 的 render 契约一致 */
interface BubbleState {
  /** idle 未识别；ready 可分析；setup 需先完成设置；truncated JD 被折叠；busy 分析中；score 已出分；error 出错 */
  kind: 'idle' | 'ready' | 'setup' | 'truncated' | 'busy' | 'score' | 'error';
  score: number | null;
  /** 已出分但档案或 JD 已变化 */
  stale: boolean;
  description: string;
}

/** 与 android/.../overlay/QuickCard.kt 的 render 契约一致 */
interface CardState {
  subtitle: string;
  score: number | null;
  verdict: string | null;
  verdictTone: Tone;
  message: string;
  messageTone: Tone;
}

const COPIED = '打招呼语已写入剪贴板';

function bubbleFor(s: WorkspaceStatus): BubbleState {
  const base = { score: null, stale: false };
  if (s.analysis === 'running') return { ...base, kind: 'busy', description: '正在分析' };
  if (s.analysis === 'done' && s.score !== null) {
    return {
      kind: 'score',
      score: s.score,
      stale: s.analysisStale,
      description: s.analysisStale ? `匹配度 ${s.score}，分析已过期` : `匹配度 ${s.score}`,
    };
  }
  if (s.analysis === 'error' || s.job === 'error') return { ...base, kind: 'error', description: '出错，点开查看' };
  if (s.job === 'truncated') return { ...base, kind: 'truncated', description: 'JD 未完整读取' };
  if (s.job === 'ready') {
    return s.configIssue
      ? { ...base, kind: 'setup', description: '需要先完成设置' }
      : { ...base, kind: 'ready', description: '点按开始分析' };
  }
  return { ...base, kind: 'idle', description: '未识别到职位' };
}

function cardFor(s: WorkspaceStatus, outcome: QuickAnalysisOutcome | null): CardState {
  const done = s.analysis === 'done' && s.score !== null;
  const card: CardState = {
    subtitle: s.jobTitle ? [s.jobTitle, s.company].filter(Boolean).join(' · ') : '未识别到职位',
    score: done ? s.score : null,
    verdict: done && s.recommendation ? RECOMMENDATION_LABEL[s.recommendation] : null,
    verdictTone: s.recommendation === 'recommended' ? 'ok' : s.recommendation === 'consider' ? 'warn' : 'danger',
    message: '',
    messageTone: 'muted',
  };
  if (s.analysis === 'running') return { ...card, message: '正在分析，完成后自动复制打招呼语…' };
  if (outcome?.kind === 'blocked') return { ...card, message: outcome.reason, messageTone: 'warn' };
  if (outcome?.kind === 'failed') return { ...card, message: outcome.message, messageTone: 'danger' };
  if (done && s.analysisStale) return { ...card, message: '档案或 JD 已变化，分析已过期', messageTone: 'warn' };
  if (outcome?.kind === 'done') {
    return outcome.issueCount
      ? { ...card, message: `${COPIED}；${outcome.issueCount} 项本地检查未通过，发送前请看详情`, messageTone: 'warn' }
      : { ...card, message: COPIED, messageTone: 'ok' };
  }
  return { ...card, message: done ? '点“详情”查看完整分析' : '点按悬浮按钮开始分析' };
}

function Panel() {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [analyzeRequest, setAnalyzeRequest] = useState(0);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [outcome, setOutcome] = useState<QuickAnalysisOutcome | null>(null);
  const tracker = useRef(new BossAppJobTracker());
  const lastTree = useRef<string | null>(null);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const offTree = onNative('tree', (json) => {
      lastTree.current = json;
      const state = tracker.current.update(JSON.parse(json) as AppTreeSnapshot);
      const key = jobStateKey(state);
      if (key === lastKey.current) return;
      lastKey.current = key;
      setJobState(state);
      setOutcome(null);
    });
    const offTap = onNative('bubbleTapped', () => {
      setOutcome(null);
      setAnalyzeRequest((n) => n + 1);
    });
    native().requestTree();
    return () => {
      offTree();
      offTap();
    };
  }, []);

  useEffect(() => {
    if (!status) return;
    native().setBubble(JSON.stringify(bubbleFor(status)));
    native().setCard(JSON.stringify(cardFor(status, outcome)));
  }, [status, outcome]);

  const onSettled = useCallback((o: QuickAnalysisOutcome) => {
    setOutcome(o);
    if (o.kind === 'done') {
      native().copyText(o.greeting);
      native().showNotice(COPIED);
    }
  }, []);

  return (
    <Workspace
      jobState={jobState}
      refresh={() => native().requestTree()}
      requestSnapshot={async () => {
        if (!lastTree.current) throw new Error('尚未读取到 BOSS 页面');
        return JSON.stringify(JSON.parse(lastTree.current), null, 1);
      }}
      analyzeRequest={analyzeRequest}
      onAnalyzeRequestSettled={onSettled}
      onStatusChange={setStatus}
      onClose={() => native().closePanel()}
    />
  );
}

installNative({ host: 'overlay' });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Panel />
  </StrictMode>,
);
