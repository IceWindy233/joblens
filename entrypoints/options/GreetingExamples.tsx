import { useEffect, useState } from 'react';
import type { GreetingExample } from '../../shared/types';
import { parseListInput } from '../../profile/manager';
import { getPlatform } from '../../platform';
import {
  loadGreetingExamples,
  onStorageChanged,
  removeGreetingExamples,
  updateGreetingExample,
} from '../../storage';
import { IconChevronDown, IconStar, IconTrash } from '../../components/Icons';

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
      <p className="muted">
        仅适用于当前档案。样例只提供表达风格参考，不提供新事实；配置冲突时以当前写作规则为准。
      </p>
      {loadError && <div className="notice err">无法读取样例</div>}
      {actionError && <div className="notice err">{actionError}</div>}
      {!loadError && examples === null && <div className="muted">正在读取样例…</div>}
      {examples?.length === 0 && (
        <div className="panel-card subtle muted">
          暂无历史样例。在{getPlatform().terms.workspace}编辑或确认打招呼语后，点击“存为样例”即可收录到这里。
        </div>
      )}
      {examples?.map((example) => (
        <div key={example.jobFingerprint} className={`panel-card stack ${example.preferred ? 'active' : ''}`}>
          <div className="row between wrap">
            <div className="row-sm wrap">
              <strong style={{ fontSize: 13.5 }}>
                {example.jobTitle}{example.company && ` · ${example.company}`}
              </strong>
              {example.preferred && <span className="badge primary">优先参考</span>}
              {example.roleTags?.map((tag) => (
                <span key={tag} className="badge info">{tag}</span>
              ))}
            </div>
            <div className="row-sm">
              <button
                type="button"
                className={`small ${example.preferred ? 'primary' : ''}`}
                disabled={busy}
                onClick={() => void togglePreferred(example)}
                title={example.preferred ? '取消优先参考' : '设为优先参考'}
              >
                <IconStar size={13} filled={Boolean(example.preferred)} />
                {example.preferred ? '已优先' : '优先'}
              </button>
              <button
                type="button"
                className="ghost danger icon-btn small"
                disabled={busy}
                title="删除样例"
                aria-label="删除样例"
                onClick={() => void remove(example.jobFingerprint)}
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>

          <div className="pre">{example.greeting}</div>

          <label className="field">
            <span>适用岗位标签（逗号或顿号分隔，失焦自动保存）</span>
            <input
              type="text"
              defaultValue={(example.roleTags ?? []).join('、')}
              placeholder="例：AI Agent、企业交付、前端开发"
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

          <details className="drawer">
            <summary>
              <span>JD 摘录与候选匹配事实</span>
              <IconChevronDown size={13} className="chevron" />
            </summary>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              <div className="pre jd-preview">{example.jobExcerpt}</div>
              {example.points.length > 0 && (
                <ul className="dot-list">
                  {example.points.map((point) => (
                    <li key={point}><span className="small">{point}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}
