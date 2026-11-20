import { useEffect, useState } from 'react';
import type { GreetingPreferences } from '../../shared/types';
import { useAppData } from '../../components/useAppData';
import {
  DEFAULT_GLOBAL_GREETING_RULES,
  DEFAULT_GREETING_PREFERENCES,
  removeProfile,
} from '../../profile/manager';
import { clearAllData, loadProfiles, removeGreetingExamples, saveProfiles, updateSettings } from '../../storage';
import { GreetingRulesConfig } from './GreetingRulesConfig';
import { ModelSettings } from './ModelSettings';
import { ProfileEditor } from './ProfileEditor';

type Editing = { mode: 'new' } | { mode: 'edit'; id: string } | null;

export default function App() {
  const data = useAppData();
  const [editing, setEditing] = useState<Editing>(null);
  const [globalRules, setGlobalRules] = useState('');
  const [globalPrefs, setGlobalPrefs] = useState<GreetingPreferences>(DEFAULT_GREETING_PREFERENCES);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!data.loaded) return;
    setGlobalRules(data.settings.globalGreetingRules ?? DEFAULT_GLOBAL_GREETING_RULES);
    setGlobalPrefs({
      ...DEFAULT_GREETING_PREFERENCES,
      ...(data.settings.globalGreetingPreferences ?? {}),
    });
  }, [data.loaded, data.settings.globalGreetingRules, data.settings.globalGreetingPreferences]);

  if (!data.loaded) return <div className="section muted">加载中…</div>;

  const onSaveGlobalRules = async () => {
    await updateSettings({
      globalGreetingRules: globalRules.trim(),
      globalGreetingPreferences: globalPrefs,
    });
    setGlobalStatus('全局默认规则已保存（仅更新打招呼语风格，不会触发重新分析旧 JD）');
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定删除档案“${name}”及其打招呼语样例？此操作不可恢复，不会影响其他档案。`)) return;
    const list = await loadProfiles();
    const r = removeProfile(list, id, data.settings.activeProfileId);
    await saveProfiles(r.profiles);
    await removeGreetingExamples(id);
    await updateSettings({ activeProfileId: r.activeProfileId });
    if (editing?.mode === 'edit' && editing.id === id) setEditing(null);
  };

  const onClearAll = async () => {
    if (!window.confirm('确定清除全部本地档案、打招呼语样例、模型设置与 API Key？')) return;
    await clearAllData();
    setEditing(null);
  };

  const editingProfile =
    editing?.mode === 'edit' ? (data.profiles.find((p) => p.id === editing.id) ?? null) : null;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '16px 0 48px' }}>
      <div className="section">
        <h1>JobLens · 职镜 设置</h1>
        <p className="muted">
          所有档案与设置保存在本机浏览器中；只有你点击“整理档案”、“分析”或“仅重新生成打招呼语”时，相关文字才会发送给你配置的模型服务商。
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
        <h2>全局默认打招呼语规则</h2>
        <p className="muted">
          适用于所有档案。规则优先级：<strong>内置事实与安全约束 &gt; 单次生成补充要求 &gt; 档案专属规则 &gt; 全局默认规则</strong>；同一层级冲突以后配置覆盖先配置。
        </p>
        <GreetingRulesConfig
          title="全局规则与校验偏好"
          description="未在档案中单独覆盖时生效；不会影响岗位匹配评分、优势与差距判断。"
          rules={globalRules}
          preferences={globalPrefs}
          onRulesChange={(r) => {
            setGlobalRules(r);
            setGlobalStatus(null);
          }}
          onPreferencesChange={(p) => {
            setGlobalPrefs(p);
            setGlobalStatus(null);
          }}
          defaultRulesText={DEFAULT_GLOBAL_GREETING_RULES}
          defaultPreferences={DEFAULT_GREETING_PREFERENCES}
          textareaAriaLabel="全局默认打招呼语规则"
          placeholder="可选：填写适用于所有求职方向的默认要求，例如语言风格、技术细节密度或固定结尾。"
        />
        <div className="row">
          <button className="primary" onClick={() => void onSaveGlobalRules()}>
            保存全局规则
          </button>
          {globalStatus && <span className="muted">{globalStatus}</span>}
        </div>
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
                  {p.resumeFileName || '手动创建'} · v{p.version} · 结构化事实 {p.facts?.length ?? 0} 条 · 更新于 {new Date(p.updatedAt).toLocaleString()}
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
        <h2>规则层级、缓存与隐私说明</h2>
        <div className="muted stack">
          <div>
            <strong>不可覆盖约束：</strong>真实性（不虚构经历、年限、项目或成果）、证据边界（个人项目不写成企业生产经验，区分“简历未体现”与“已确认不具备”）、结构化输出、多档案数据隔离及不自动发送消息。
          </div>
          <div>
            <strong>可自由定制项：</strong>选材数量与重点、表达语气、技术术语密度、篇幅长度、单段/分段、是否允许列表、是否主动解释能力差距、固定结尾及样例参考开关。
          </div>
          <div>
            <strong>两阶段缓存与事实核验：</strong>匹配分析与打招呼语分别缓存。切换模型、更改写作规则或样例后会自动刷新对应阶段缓存；本地检查仅覆盖部分数字与格式问题，不能替代人工全面事实核验。
          </div>
          <div>
            <strong>隐私边界：</strong>远程 API 服务商仅收到当前职位内容、个人档案摘要/结构化事实和选中的打招呼语样例，分析时不会发送原始简历全文。插件不读取招聘平台 Cookie 或密码。
          </div>
        </div>
        <div>
          <button className="danger" onClick={() => void onClearAll()}>清除全部本地数据</button>
        </div>
      </div>
    </div>
  );
}
