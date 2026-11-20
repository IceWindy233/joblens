import { useEffect, useState } from 'react';
import type { GreetingExample } from '../../shared/types';
import { loadGreetingExamples, onStorageChanged, removeGreetingExamples } from '../../storage';

export function GreetingExamples({ profileId }: { profileId: string }) {
  const [examples, setExamples] = useState<GreetingExample[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setDeleting(true);
    setDeleteError(false);
    try {
      await removeGreetingExamples(profileId, jobFingerprint);
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="stack">
      <h3>打招呼语样例</h3>
      <p className="muted">只适用于当前档案。删除后不再用于新的分析。</p>
      {loadError && <div className="notice err">无法读取样例</div>}
      {deleteError && <div className="notice err">删除样例失败，请重试</div>}
      {!loadError && examples === null && <div className="muted">正在读取样例…</div>}
      {examples?.length === 0 && <div className="muted">暂无样例。在侧边栏编辑或确认打招呼语后，可保存为样例。</div>}
      {examples?.map((example) => (
        <div key={example.jobFingerprint} className="card stack">
          <div className="row between">
            <strong>{example.jobTitle}{example.company && ` · ${example.company}`}</strong>
            <button type="button" className="danger" disabled={deleting} onClick={() => void remove(example.jobFingerprint)}>
              删除样例
            </button>
          </div>
          <div className="pre">{example.greeting}</div>
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
