import { useState } from 'react';
import { useAppData } from '../../components/useAppData';
import { removeProfile } from '../../profile/manager';
import { clearAllData, loadProfiles, saveProfiles, updateSettings } from '../../storage';
import { ModelSettings } from './ModelSettings';
import { ProfileEditor } from './ProfileEditor';

type Editing = { mode: 'new' } | { mode: 'edit'; id: string } | null;

export default function App() {
  const data = useAppData();
  const [editing, setEditing] = useState<Editing>(null);

  if (!data.loaded) return <div className="section muted">加载中…</div>;

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定删除档案“${name}”？此操作不可恢复，不会影响其他档案。`)) return;
    const list = await loadProfiles();
    const r = removeProfile(list, id, data.settings.activeProfileId);
    await saveProfiles(r.profiles);
    await updateSettings({ activeProfileId: r.activeProfileId });
    if (editing?.mode === 'edit' && editing.id === id) setEditing(null);
  };

  const onClearAll = async () => {
    if (!window.confirm('确定清除全部本地档案、模型设置与 API Key？')) return;
    await clearAllData();
    setEditing(null);
  };

  const editingProfile =
    editing?.mode === 'edit' ? (data.profiles.find((p) => p.id === editing.id) ?? null) : null;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 0 48px' }}>
      <div className="section">
        <h1>JobLens · 职镜 设置</h1>
        <p className="muted">
          所有档案与设置保存在本机浏览器中；只有你点击“整理档案”或“分析”时，相关文字才会发送给你配置的模型服务商。
        </p>
      </div>

      <div className="section">
        <ModelSettings
          settings={data.settings}
          apiKey={data.apiKey}
          apiKeyPersisted={data.apiKeyPersisted}
          hasPermission={data.hasPermission}
        />
      </div>

      <div className="section stack">
        <div className="row between">
          <h2>简历档案</h2>
          <button className="primary" onClick={() => setEditing({ mode: 'new' })}>新建档案</button>
        </div>
        {data.profiles.length === 0 && <div className="muted">尚无档案，请上传简历创建。</div>}
        {data.profiles.map((p) => {
          const active = p.id === data.settings.activeProfileId;
          return (
            <div key={p.id} className={`card row between ${active ? 'active' : ''}`}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {p.name} {active && <span className="badge ok">当前</span>}
                </div>
                <div className="muted">
                  {p.resumeFileName || '手动创建'} · v{p.version} · 更新于 {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="row">
                {!active && (
                  <button onClick={() => void updateSettings({ activeProfileId: p.id })}>设为当前</button>
                )}
                <button onClick={() => setEditing({ mode: 'edit', id: p.id })}>编辑</button>
                <button className="danger" onClick={() => void onDelete(p.id, p.name)}>删除</button>
              </div>
            </div>
          );
        })}
        {editing && (
          <ProfileEditor
            key={editing.mode === 'edit' ? editing.id : 'new'}
            existing={editingProfile}
            settings={data.settings}
            apiKey={data.apiKey}
            onDone={() => setEditing(null)}
          />
        )}
      </div>

      <div className="section stack">
        <h2>数据与隐私</h2>
        <p className="muted">
          远程 API 服务商会接收到职位内容与个人档案摘要，是否保留及如何处理取决于该服务商的政策。分析时不会发送原始简历全文。
          插件不读取或保存招聘平台的 Cookie、密码，不会自动发送消息或投递。
        </p>
        <div>
          <button className="danger" onClick={() => void onClearAll()}>清除全部本地数据</button>
        </div>
      </div>
    </div>
  );
}
