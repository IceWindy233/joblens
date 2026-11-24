import { useEffect, useMemo, useRef, useState } from 'react';
import type { GreetingPreferences } from '../../shared/types';
import { useAppData } from '../../components/useAppData';
import { getPlatform } from '../../platform';
import {
  DEFAULT_GLOBAL_GREETING_RULES,
  DEFAULT_GREETING_PREFERENCES,
  diffGreetingPreferences,
  removeProfile,
  resolveGreetingConfig,
} from '../../profile/manager';
import { clearAllData, loadProfiles, removeGreetingExamples, saveProfiles, updateSettings } from '../../storage';
import {
  IconBriefcase,
  IconCheck,
  IconCpu,
  IconEdit,
  IconPlus,
  IconShield,
  IconSparkles,
  IconTrash,
  IconWand,
} from '../../components/Icons';
import { GreetingRulesConfig } from './GreetingRulesConfig';
import { ModelSettings } from './ModelSettings';
import { ProfileEditor } from './ProfileEditor';
import { SetupChecksPage, pendingSetupCount, useSetupChecks } from './SetupChecks';

type NavTab = 'profiles' | 'style' | 'model' | 'setup' | 'privacy';
type Editing = { mode: 'new' } | { mode: 'edit'; id: string } | null;

export default function App() {
  const data = useAppData();
  const [nav, setNav] = useState<NavTab>('profiles');
  const initializedNav = useRef(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [globalSelectionRules, setGlobalSelectionRules] = useState('');
  const [globalRules, setGlobalRules] = useState('');
  const [globalPrefs, setGlobalPrefs] = useState<GreetingPreferences>(DEFAULT_GREETING_PREFERENCES);
  const [globalPrefsCustomized, setGlobalPrefsCustomized] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);

  const modelReady = Boolean(data.settings.llm && data.hasPermission && data.apiKey);
  const profileReady = data.profiles.some((p) => p.id === data.settings.activeProfileId);
  const setup = getPlatform().setup;
  const setupChecks = useSetupChecks(setup);
  const setupReady = pendingSetupCount(setupChecks) === 0 && modelReady && profileReady;

  useEffect(() => {
    if (!data.loaded) return;
    if (!initializedNav.current) {
      initializedNav.current = true;
      if (setup?.consumeFirstRun()) setNav('setup');
      else if (!modelReady) setNav('model');
    }
    setGlobalSelectionRules(data.settings.globalSelectionRules ?? '');
    setGlobalRules(data.settings.globalGreetingRules ?? DEFAULT_GLOBAL_GREETING_RULES);
    setGlobalPrefs({
      ...DEFAULT_GREETING_PREFERENCES,
      ...(data.settings.globalGreetingPreferences ?? {}),
    });
    setGlobalPrefsCustomized(Boolean(data.settings.globalGreetingPreferences));
  }, [
    data.loaded,
    modelReady,
    data.settings.globalSelectionRules,
    data.settings.globalGreetingRules,
    data.settings.globalGreetingPreferences,
  ]);

  const globalEffectivePreview = useMemo(
    () =>
      resolveGreetingConfig({
        settings: {
          globalSelectionRules,
          globalGreetingRules: globalRules,
          globalGreetingPreferences: globalPrefsCustomized
            ? diffGreetingPreferences(globalPrefs)
            : undefined,
        },
      }),
    [globalSelectionRules, globalRules, globalPrefs, globalPrefsCustomized],
  );

  // 窄屏导航横向滚动：切换（包括首次启动自动切换）后把当前分区滚到可见位置
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('.opt-nav-item.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [nav, data.loaded]);

  if (!data.loaded) {
    return (
      <div className="opt-shell">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  const onSaveGlobalRules = async () => {
    const patchPrefs = globalPrefsCustomized ? diffGreetingPreferences(globalPrefs) : {};
    await updateSettings({
      globalSelectionRules: globalSelectionRules.trim(),
      globalGreetingRules: globalRules.trim(),
      globalGreetingPreferences: Object.keys(patchPrefs).length ? patchPrefs : undefined,
    });
    setGlobalStatus('全局默认规则已保存');
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

  const switchNav = (next: NavTab) => {
    setNav(next);
    if (next !== 'profiles') setEditing(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="opt-shell">
      {/* 左侧边导航 */}
      <aside className="opt-sidebar">
        <div className="brand-box">
          <div className="brand-logo">
            <IconSparkles size={17} />
          </div>
          <div className="stack-sm" style={{ gap: 0 }}>
            <strong style={{ fontSize: 15 }}>JobLens · 职镜</strong>
            <span className="muted">本地求职助手设置</span>
          </div>
        </div>

        <nav ref={navRef} className="opt-nav" aria-label="设置分区">
          <button
            type="button"
            className={`opt-nav-item ${nav === 'profiles' ? 'active' : ''}`}
            onClick={() => switchNav('profiles')}
          >
            <span className="row-sm">
              <IconBriefcase size={15} />
              简历档案
            </span>
            <span className="badge">{data.profiles.length}</span>
          </button>

          <button
            type="button"
            className={`opt-nav-item ${nav === 'style' ? 'active' : ''}`}
            onClick={() => switchNav('style')}
          >
            <span className="row-sm">
              <IconWand size={15} />
              写作风格
            </span>
          </button>

          <button
            type="button"
            className={`opt-nav-item ${nav === 'model' ? 'active' : ''}`}
            onClick={() => switchNav('model')}
          >
            <span className="row-sm">
              <IconCpu size={15} />
              模型连接
            </span>
            <span
              className={`status-dot ${modelReady ? 'ok' : 'warn'}`}
              title={modelReady ? '已就绪' : '待配置'}
            />
          </button>

          {setup && (
            <button
              type="button"
              className={`opt-nav-item ${nav === 'setup' ? 'active' : ''}`}
              onClick={() => switchNav('setup')}
            >
              <span className="row-sm">
                <IconCheck size={15} />
                权限与运行
              </span>
              <span
                className={`status-dot ${setupReady ? 'ok' : 'warn'}`}
                title={setupReady ? '已就绪' : '有待处理项'}
              />
            </button>
          )}

          <button
            type="button"
            className={`opt-nav-item ${nav === 'privacy' ? 'active' : ''}`}
            onClick={() => switchNav('privacy')}
          >
            <span className="row-sm">
              <IconShield size={15} />
              数据与隐私
            </span>
          </button>
        </nav>

        <div className="panel-card subtle stack-sm">
          <span className="muted" style={{ lineHeight: 1.5 }}>
            所有数据均保存在{getPlatform().terms.dataHome}。只有你主动点击按钮时，才会向你配置的模型发送文字。
          </span>
        </div>
      </aside>

      {/* 右侧内容工作区 */}
      <main className="opt-main">
        {/* 初次使用引导条 */}
        {(!modelReady || data.profiles.length === 0) && (
          <div className="notice info row wrap">
            <span className="small">
              快速开始：
              <strong>1. 连接模型</strong> {modelReady ? '✓' : '（进行中）'} →{' '}
              <strong>2. 新建简历档案</strong> {data.profiles.length > 0 ? '✓' : '（待完成）'} → {getPlatform().terms.getStarted}
            </span>
            {modelReady && data.profiles.length === 0 && nav !== 'profiles' && (
              <button type="button" className="primary small" onClick={() => switchNav('profiles')}>
                去建档案
              </button>
            )}
          </div>
        )}

        {/* 1. 简历档案 */}
        {nav === 'profiles' && (
          editing ? (
            <ProfileEditor
              key={editing.mode === 'edit' ? editing.id : 'new'}
              existing={editingProfile}
              settings={data.settings}
              apiKey={data.apiKey}
              onDone={() => setEditing(null)}
            />
          ) : (
            <div className="stack-lg">
              <div className="opt-page-header">
                <div className="stack-sm">
                  <h1>简历档案</h1>
                  <span className="muted">为不同求职方向分别维护档案、事实边界与专属沟通风格，分析时完全隔离。</span>
                </div>
                <button type="button" className="primary" onClick={() => setEditing({ mode: 'new' })}>
                  <IconPlus size={15} />
                  新建档案
                </button>
              </div>

              {data.profiles.length === 0 ? (
                <div className="panel-card stack" style={{ padding: '28px 20px', alignItems: 'flex-start' }}>
                  <h3>还没有简历档案</h3>
                  <span className="muted">
                    支持上传文字版 PDF / DOCX 简历自动提取整理，也可直接手写核心经历与能力边界。
                  </span>
                  <button type="button" className="primary" onClick={() => setEditing({ mode: 'new' })}>
                    <IconPlus size={15} />
                    创建第一份档案
                  </button>
                </div>
              ) : (
                <div className="stack">
                  {data.profiles.map((p) => {
                    const active = p.id === data.settings.activeProfileId;
                    return (
                      <div key={p.id} className={`panel-card row between wrap ${active ? 'active' : ''}`}>
                        <div className="stack-sm grow" style={{ minWidth: 0 }}>
                          <div className="row-sm wrap">
                            <strong style={{ fontSize: 14.5 }}>{p.name}</strong>
                            {active && <span className="badge ok">当前使用</span>}
                            <span className="badge">v{p.version}</span>
                            {p.facts && p.facts.length > 0 && (
                              <span className="badge primary">事实 {p.facts.length} 条</span>
                            )}
                          </div>
                          <div className="muted truncate">
                            {p.resumeFileName || '手动创建'} · 更新于 {new Date(p.updatedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="row-sm">
                          {!active && (
                            <button
                              type="button"
                              className="small"
                              onClick={() => void updateSettings({ activeProfileId: p.id })}
                            >
                              设为当前
                            </button>
                          )}
                          <button
                            type="button"
                            className="small"
                            onClick={() => setEditing({ mode: 'edit', id: p.id })}
                          >
                            <IconEdit size={13} />
                            编辑
                          </button>
                          <button
                            type="button"
                            className="ghost danger icon-btn small"
                            title={`删除档案 ${p.name}`}
                            aria-label={`删除档案 ${p.name}`}
                            onClick={() => void onDelete(p.id, p.name)}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* 2. 全局写作风格 */}
        {nav === 'style' && (
          <div className="stack-lg">
            <div className="opt-page-header">
              <div className="stack-sm">
                <h1>全局写作风格</h1>
                <span className="muted">适用于所有档案的默认打招呼语规则；在具体档案中可随时覆盖。</span>
              </div>
            </div>

            <div className="panel-card subtle row between wrap">
              <span className="small" style={{ fontWeight: 500 }}>规则生效优先级</span>
              <div className="priority-strip">
                <span className="badge ok">内置事实约束</span>
                <span className="priority-arrow">&gt;</span>
                <span className="badge info">单次补充要求</span>
                <span className="priority-arrow">&gt;</span>
                <span className="badge primary">档案专属规则</span>
                <span className="priority-arrow">&gt;</span>
                <span className="badge">全局默认规则</span>
              </div>
            </div>

            <GreetingRulesConfig
              title="全局默认规则与校验偏好"
              description="只影响打招呼语的选材倾向与表达方式，不会影响岗位匹配评分、优势或差距分析。"
              selectionRules={globalSelectionRules}
              onSelectionRulesChange={(s) => {
                setGlobalSelectionRules(s);
                setGlobalStatus(null);
              }}
              rules={globalRules}
              preferences={globalPrefs}
              onRulesChange={(r) => {
                setGlobalRules(r);
                setGlobalStatus(null);
              }}
              onPreferencesChange={(p) => {
                setGlobalPrefs(p);
                setGlobalPrefsCustomized(true);
                setGlobalStatus(null);
              }}
              defaultRulesText={DEFAULT_GLOBAL_GREETING_RULES}
              defaultPreferences={DEFAULT_GREETING_PREFERENCES}
              effectivePreview={globalEffectivePreview}
              conflicts={globalEffectivePreview.conflicts}
              textareaAriaLabel="全局默认打招呼语规则"
              placeholder="可选：填写适用于所有求职方向的默认要求，例如语言风格、技术细节密度或固定结尾。"
            />

            <div className="row">
              <button type="button" className="primary" onClick={() => void onSaveGlobalRules()}>
                <IconCheck size={14} />
                保存全局规则
              </button>
              {globalStatus && <span className="muted">{globalStatus}</span>}
            </div>
          </div>
        )}

        {/* 3. 模型连接 */}
        {nav === 'model' && (
          <div className="stack-lg">
            <div className="opt-page-header">
              <div className="stack-sm">
                <h1>模型连接</h1>
                <span className="muted">配置你自己的 OpenAI 兼容接口地址与 API Key。</span>
              </div>
            </div>
            <ModelSettings
              settings={data.settings}
              apiKey={data.apiKey}
              apiKeyPersisted={data.apiKeyPersisted}
              hasPermission={data.hasPermission}
            />
          </div>
        )}

        {/* 权限与运行（仅 Android） */}
        {nav === 'setup' && setup && (
          <SetupChecksPage
            setup={setup}
            checks={setupChecks}
            configReady={{ model: modelReady, profile: profileReady }}
            onOpenModel={() => switchNav('model')}
            onOpenProfiles={() => switchNav('profiles')}
          />
        )}

        {/* 4. 数据与隐私 */}
        {nav === 'privacy' && (
          <div className="stack-lg">
            <div className="opt-page-header">
              <div className="stack-sm">
                <h1>数据与隐私</h1>
                <span className="muted">清楚了解哪些规则不可覆盖、本地数据存放在哪里以及何时离开{getPlatform().terms.dataHome}。</span>
              </div>
            </div>

            <div className="panel-card stack">
              <h3>内置安全与事实边界</h3>
              <div className="stack-sm small" style={{ color: 'var(--fg-secondary)' }}>
                <div>
                  <strong>不可覆盖约束：</strong>真实性（不虚构经历、年限、项目或成果）、证据边界（个人项目不写成企业生产经验，区分“简历未体现”与“已确认不具备”）、多档案数据隔离及不自动发送消息。
                </div>
                <div>
                  <strong>可自由定制项：</strong>选材数量与重点、语气风格、技术细节密度、篇幅字数、单段/分段、是否允许列表、是否主动解释能力差距、固定结尾与样例开关。
                </div>
                <div>
                  <strong>两阶段缓存与人工核对：</strong>匹配分析与打招呼语分别缓存；本地检查仅覆盖部分数字与格式问题，不能替代人工全面事实核验。
                </div>
                <div>
                  <strong>隐私边界：</strong>分析岗位时仅发送当前职位、档案摘要/结构化事实与选中样例，绝不发送原始简历全文；JobLens 不读取招聘平台的 Cookie、账号或密码。
                </div>
              </div>
            </div>

            <div className="panel-card row between wrap">
              <div className="stack-sm">
                <strong style={{ color: 'var(--danger)' }}>清除全部本地数据</strong>
                <span className="muted">删除所有简历档案、历史样例、全局规则、模型设置与 API Key，不可恢复。</span>
              </div>
              <button type="button" className="danger" onClick={() => void onClearAll()}>
                <IconTrash size={14} />
                清除全部数据
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
