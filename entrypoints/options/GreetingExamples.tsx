import { useEffect, useState } from 'react';
import type { GreetingExample } from '../../shared/types';
import { parseListInput } from '../../profile/manager';
import {
  loadGreetingExamples,
  onStorageChanged,
  removeGreetingExamples,
  updateGreetingExample,
} from '../../storage';

export function GreetingExamples({ profileId }: { profileId: string }) {
  const [examples, setExamples] = useState<GreetingExample[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let generation = 0;
    const reload = async () => {
      const current = ++generation;
      try {
        const list = await loadGreetingExamples(profileId);
        if (current === generation) {
          setExamples(list);
          setLoadError(false);
        }
      } catch {
        if (current === generation) setLoadError(true);
      }
    };
    const unsubscribe = onStorageChanged(() => void reload());
    void reload();
    return () => {
      generation++;
      unsubscribe();
    };
  }, [profileId]);

  const remove = async (jobFingerprint: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await removeGreetingExamples(profileId, jobFingerprint);
    } catch {
      setActionError('删除样例失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const togglePreferred = async (example: GreetingExample) => {
    setBusy(true);
    setActionError(null);
    try {
      await updateGreetingExample(profileId, example.jobFingerprint, {
        preferred: !example.preferred,
      });
    } catch {
      setActionError('更新优先参考状态失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const updateTags = async (example: GreetingExample, rawTags: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await updateGreetingExample(profileId, example.jobFingerprint, {
        roleTags: parseListInput(rawTags),
      });
    } catch {
      setActionError('更新适用岗位标签失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <h3>打招呼语样例</h3>
      <p className="muted">
        只适用于当前档案。样例仅提供表达风格参考，不提供新的事实依据；若样例风格与当前规则冲突，始终以当前规则为准。可在分析页或规则设置中关闭样例参考。
      </p>
      {loadError && <div className="notice err">无法读取样例</div>}
      {actionError && <div className="notice err">{actionError}</div>}
      {!loadError && examples === null && <div className="muted">正在读取样例…</div>}
      {examples?.length === 0 && <div className="muted">暂无样例。在侧边栏编辑或确认打招呼语后，可保存为样例。</div>}
      {examples?.map((example) => (
        <div key={example.jobFingerprint} className={`card stack ${example.preferred ? 'active' : ''}`}>
          <div className="row between wrap">
            <div className="row wrap">
              <strong>{example.jobTitle}{example.company && ` · ${example.company}`}</strong>
              {example.preferred && <span className="badge ok">优先参考</span>}
              {example.roleTags?.map((tag) => (
                <span key={tag} className="badge info">{tag}</span>
              ))}
            </div>
            <div className="row">
              <button
                type="button"
                className="small"
                disabled={busy}
                onClick={() => void togglePreferred(example)}
              >
                {example.preferred ? '取消优先' : '设为优先参考'}
              </button>
              <button type="button" className="danger small" disabled={busy} onClick={() => void remove(example.jobFingerprint)}>
                删除样例
              </button>
            </div>
          </div>
          <div className="pre">{example.greeting}</div>
          <label className="field">
            <span>适用岗位类型标签（顿号或逗号分隔，失焦保存；辅助语义选样）</span>
            <input
              type="text"
              defaultValue={(example.roleTags ?? []).join('、')}
              placeholder="例：AI Agent、企业落地、前端开发"
              disabled={busy}
              onBlur={(e) => {
                const nextTags = parseListInput(e.target.value);
                const prevTags = example.roleTags ?? [];
                if (nextTags.join('\0') !== prevTags.join('\0')) {
                  void updateTags(example, e.target.value);
                }
              }}
            />
          </label>
          <details>
            <summary className="muted">JD 摘录与候选匹配事实</summary>
            <div className="pre">{example.jobExcerpt}</div>
            {example.points.length > 0 && <ul className="points">{example.points.map((point) => <li key={point}>{point}</li>)}</ul>}
          </details>
        </div>
      ))}
    </section>
  );
}
