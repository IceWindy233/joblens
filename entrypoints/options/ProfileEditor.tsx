import { useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  ExperienceType,
  GreetingPreferences,
  ParticipationLevel,
  ProfileFact,
  UserProfile,
} from '../../shared/types';
import { toAppError } from '../../shared/errors';
import { parseResumeFile } from '../../profile/parse-resume';
import { redactContacts } from '../../profile/redact';
import { organizeProfile } from '../../profile/organize';
import {
  DEFAULT_GREETING_PREFERENCES,
  DEFAULT_GREETING_RULES,
  createProfile,
  diffGreetingPreferences,
  parseListInput,
  resolveGreetingConfig,
  updateProfile,
  upsertProfile,
  validateProfile,
} from '../../profile/manager';
import { loadProfiles, saveProfiles, updateSettings } from '../../storage';
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconEdit,
  IconFile,
  IconPlus,
  IconShield,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '../../components/Icons';
import { GreetingExamples } from './GreetingExamples';
import { GreetingRulesConfig } from './GreetingRulesConfig';

interface Props {
  existing: UserProfile | null;
  settings: AppSettings;
  apiKey: string | null;
  onDone: () => void;
}

type Msg = { kind: 'ok' | 'err' | 'warn' | 'info'; text: string } | null;
type EditorTab = 'basics' | 'facts' | 'rules' | 'examples';

const EXPERIENCE_TYPES: readonly ExperienceType[] = [
  '正式工作',
  '实习',
  '兼职',
  '个人项目',
  '学术/课程',
  '其他',
];

const PARTICIPATION_LEVELS: readonly ParticipationLevel[] = [
  '了解',
  '参与',
  '负责',
  '独立完成',
  '主导',
];

function emptyFact(): ProfileFact {
  return {
    id: `fact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    fact: '',
    source: '',
    experienceType: '个人项目',
    participationLevel: '独立完成',
    skills: [],
    outcomes: '',
    constraints: '',
  };
}

export function ProfileEditor({ existing, settings, apiKey, onDone }: Props) {
  const [tab, setTab] = useState<EditorTab>('basics');
  const [fileName, setFileName] = useState(existing?.resumeFileName ?? '');
  const [resumeText, setResumeText] = useState(existing?.resumeText ?? '');
  const [showResumeText, setShowResumeText] = useState(!existing?.summary);
  const [name, setName] = useState(existing?.name ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [facts, setFacts] = useState<ProfileFact[]>(existing?.facts ?? []);
  const [expandedFactIdx, setExpandedFactIdx] = useState<number | null>(null);
  const [factsDraftPendingConfirm, setFactsDraftPendingConfirm] = useState(false);
  const [extraNotes, setExtraNotes] = useState(existing?.extraNotes ?? '');
  const [selectionRules, setSelectionRules] = useState(existing?.selectionRules ?? '');
  const [rules, setRules] = useState(existing?.greetingRules ?? DEFAULT_GREETING_RULES);
  const globalBaselinePrefs = useMemo(
    () => ({
      ...DEFAULT_GREETING_PREFERENCES,
      ...(settings.globalGreetingPreferences ?? {}),
    }),
    [settings.globalGreetingPreferences],
  );
  const [greetingPrefs, setGreetingPrefs] = useState<GreetingPreferences>(() => ({
    ...globalBaselinePrefs,
    ...(existing?.greetingPreferences ?? {}),
  }));
  const [prefsCustomized, setPrefsCustomized] = useState(Boolean(existing?.greetingPreferences));
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const effectivePreview = useMemo(
    () =>
      resolveGreetingConfig({
        settings,
        profile: {
          selectionRules,
          greetingRules: rules,
          greetingPreferences: prefsCustomized
            ? diffGreetingPreferences(greetingPrefs, globalBaselinePrefs)
            : existing?.greetingPreferences,
        },
      }),
    [settings, selectionRules, rules, greetingPrefs, prefsCustomized, globalBaselinePrefs, existing?.greetingPreferences],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg({ kind: 'info', text: '正在本地提取文字…' });
    try {
      const parsed = await parseResumeFile(file);
      setFileName(file.name);
      setResumeText(parsed.text);
      setShowResumeText(true);
      setMsg(
        parsed.isLarge
          ? { kind: 'warn', text: '提取的文字较长，请检查内容是否正确' }
          : { kind: 'ok', text: '已提取简历文字，建议先“遮蔽联系方式”再“AI 整理”' },
      );
    } catch (err) {
      setMsg({ kind: 'err', text: toAppError(err).message });
    } finally {
      setBusy(false);
    }
  };

  const onRedact = () => {
    const r = redactContacts(resumeText);
    setResumeText(r.text);
    setMsg({ kind: 'ok', text: r.count ? `已遮蔽 ${r.count} 处手机号/邮箱/证件号` : '未发现手机号/邮箱/证件号' });
  };

  const onOrganize = async () => {
    if (!settings.llm || !apiKey) {
      setMsg({ kind: 'err', text: '请先在“模型连接”页配置模型并填写 API Key，或直接手动填写档案摘要' });
      return;
    }
    const ok = window.confirm(
      `将把“简历文字”（${resumeText.length} 字）发送给你配置的模型服务商（${new URL(settings.llm.baseURL).host}）进行整理。\n该服务商可能按其政策保留数据，建议先遮蔽联系方式。是否继续？`,
    );
    if (!ok) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMsg({ kind: 'info', text: '正在整理档案与结构化事实…' });
    try {
      const draft = await organizeProfile(resumeText, settings.llm, apiKey, controller.signal);
      if (!name.trim() && draft.name) setName(draft.name);
      setSummary(draft.summary);
      if (draft.facts) {
        setFacts(draft.facts);
        setFactsDraftPendingConfirm(true);
        setExpandedFactIdx(null);
      }
      setMsg({
        kind: 'warn',
        text: '已生成档案摘要与结构化事实草稿，请核对经历类型与能力边界后再点击“保存档案”。',
      });
    } catch (err) {
      setMsg({ kind: 'err', text: toAppError(err).message });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const updateFactAt = (index: number, patch: Partial<ProfileFact>) => {
    setFacts((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeFactAt = (index: number) => {
    setFacts((prev) => prev.filter((_, i) => i !== index));
    if (expandedFactIdx === index) setExpandedFactIdx(null);
    else if (expandedFactIdx !== null && expandedFactIdx > index) setExpandedFactIdx(expandedFactIdx - 1);
  };

  const onSave = async () => {
    if (factsDraftPendingConfirm) {
      setTab('facts');
      return setMsg({
        kind: 'warn',
        text: '请先在“结构化事实”标签页核对 AI 提取的经历类型、参与程度与限制条件，并点击“我已核对全部事实”后再保存。',
      });
    }
    const errors = validateProfile({ name, summary });
    if (errors.length) {
      setTab('basics');
      return setMsg({ kind: 'err', text: errors.join('；') });
    }
    const profilePrefsDiff = prefsCustomized
      ? diffGreetingPreferences(greetingPrefs, globalBaselinePrefs)
      : existing?.greetingPreferences;
    const fields = {
      name,
      resumeFileName: fileName,
      resumeText,
      summary,
      facts,
      extraNotes,
      selectionRules,
      greetingRules: rules,
      greetingPreferences:
        profilePrefsDiff && Object.keys(profilePrefsDiff).length ? profilePrefsDiff : undefined,
    };
    try {
      const list = await loadProfiles();
      const current = existing ? list.find((p) => p.id === existing.id) : undefined;
      const profile = current ? updateProfile(current, fields) : createProfile(fields);
      await saveProfiles(upsertProfile(list, profile));
      if (!settings.activeProfileId) await updateSettings({ activeProfileId: profile.id });
      setFactsDraftPendingConfirm(false);
      onDone();
    } catch (err) {
      setMsg({ kind: 'err', text: toAppError(err).message });
    }
  };

  return (
    <div className="stack-lg">
      {/* 吸顶操作栏：随时保存或返回 */}
      <div className="sticky-editor-bar">
        <div className="row-sm grow" style={{ minWidth: 0 }}>
          <button type="button" className="ghost small" onClick={onDone}>
            <IconArrowLeft size={14} />
            返回
          </button>
          <h2 className="truncate">{existing ? existing.name : '新建档案'}</h2>
          {existing && <span className="badge">v{existing.version}</span>}
        </div>
        <div className="row-sm">
          <button type="button" className="small" onClick={onDone}>
            取消
          </button>
          <button type="button" className="primary small" disabled={busy} onClick={() => void onSave()}>
            <IconCheck size={14} />
            保存档案
          </button>
        </div>
      </div>

      {/* 子标签分段导航 */}
      <div className="segmented full">
        <button
          type="button"
          className={`seg-tab ${tab === 'basics' ? 'active' : ''}`}
          onClick={() => setTab('basics')}
        >
          基础与简历
        </button>
        <button
          type="button"
          className={`seg-tab ${tab === 'facts' ? 'active' : ''}`}
          onClick={() => setTab('facts')}
        >
          结构化事实 ({facts.length})
          {factsDraftPendingConfirm && <span className="badge warn">待核对</span>}
        </button>
        <button
          type="button"
          className={`seg-tab ${tab === 'rules' ? 'active' : ''}`}
          onClick={() => setTab('rules')}
        >
          专属规则
        </button>
        {existing && (
          <button
            type="button"
            className={`seg-tab ${tab === 'examples' ? 'active' : ''}`}
            onClick={() => setTab('examples')}
          >
            历史样例
          </button>
        )}
      </div>

      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      {/* Tab 1: 基础与简历 */}
      {tab === 'basics' && (
        <div className="stack-lg">
          <div className="panel-card stack">
            <div className="dropzone">
              <input
                type="file"
                aria-label="上传简历文件"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={busy}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <div className="row">
                <IconUpload size={18} className="muted" />
                <div className="stack-sm" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {fileName ? `已导入：${fileName}` : '点击或拖入简历文件（文字版 PDF / DOCX，≤ 10 MB）'}
                  </span>
                  <span className="muted">本地解析文字，不做 OCR；也可跳过上传直接手动填写下方档案</span>
                </div>
              </div>
              <span className="badge">选择文件</span>
            </div>

            {resumeText.trim() && (
              <div className="row between wrap">
                <div className="row-sm">
                  <button type="button" className="small" disabled={busy} onClick={onRedact}>
                    <IconShield size={13} />
                    遮蔽联系方式
                  </button>
                  <button type="button" className="primary small" disabled={busy} onClick={() => void onOrganize()}>
                    <IconSparkles size={13} />
                    AI 整理档案与事实
                  </button>
                  {busy && abortRef.current && (
                    <button type="button" className="small" onClick={() => abortRef.current?.abort()}>
                      取消
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="link small"
                  onClick={() => setShowResumeText((v) => !v)}
                >
                  <IconFile size={13} />
                  {showResumeText ? '收起简历原文' : `查看/编辑简历原文（${resumeText.length} 字）`}
                </button>
              </div>
            )}

            {showResumeText && (
              <label className="field">
                <span>简历原文（可删改无关或敏感内容；仅点击“AI 整理”时发送，分析职位时不发送原文）</span>
                <textarea
                  rows={7}
                  value={resumeText}
                  placeholder="上传 PDF/DOCX 自动提取，或直接在此粘贴简历文字…"
                  onChange={(e) => setResumeText(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="panel-card stack">
            <label className="field">
              <span>档案名称 *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：AI Agent 工程 / 全栈开发"
              />
            </label>

            <label className="field">
              <span>档案摘要 *（分析时的客观事实依据，避免自荐宣传措辞）</span>
              <textarea
                rows={8}
                value={summary}
                placeholder="建议包含教育背景、工作/实习经历、项目经历、核心技术与证书…"
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>

            <label className="field">
              <span>补充事实与能力边界（例：“Go 仅自学无项目经验”“仅考虑全职岗位”）</span>
              <textarea
                rows={2}
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {/* Tab 2: 结构化事实清单 */}
      {tab === 'facts' && (
        <div className="stack">
          <div className="row between wrap">
            <span className="muted">
              将经历拆分为带参与程度和边界限制的客观事实，避免个人项目与企业生产经验混淆。
            </span>
            <button
              type="button"
              className="primary small"
              onClick={() => {
                const nextIdx = facts.length;
                setFacts((prev) => [...prev, emptyFact()]);
                setExpandedFactIdx(nextIdx);
              }}
            >
              <IconPlus size={13} />
              新增事实
            </button>
          </div>

          {factsDraftPendingConfirm && (
            <div className="notice warn row wrap">
              <span className="small grow">
                以下事实由 AI 从简历提取，请重点确认经历类型、参与程度与限制条件是否准确。
              </span>
              <button
                type="button"
                className="primary small"
                onClick={() => {
                  setFactsDraftPendingConfirm(false);
                  setMsg({ kind: 'ok', text: '已确认结构化事实，现在可以点击右上角“保存档案”。' });
                }}
              >
                <IconCheck size={13} />
                我已核对全部事实
              </button>
            </div>
          )}

          {facts.length === 0 && (
            <div className="panel-card subtle muted">
              暂无结构化事实。可在“基础与简历”中点击“AI 整理档案与事实”自动提取，或点击右上角“新增事实”。
            </div>
          )}

          {facts.map((item, idx) => {
            const isExpanded = expandedFactIdx === idx;
            return (
              <div key={item.id ?? idx} className="panel-card stack">
                <div className="row between wrap">
                  <div className="row-sm wrap grow" style={{ minWidth: 0 }}>
                    <span className="badge primary">{item.experienceType}</span>
                    <span className="badge">{item.participationLevel}</span>
                    {item.source && <span className="muted">{item.source}</span>}
                    {item.constraints && <span className="badge warn">{item.constraints}</span>}
                  </div>
                  <div className="row-sm">
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setExpandedFactIdx(isExpanded ? null : idx)}
                    >
                      <IconEdit size={13} />
                      {isExpanded ? '收起' : '编辑'}
                    </button>
                    <button
                      type="button"
                      className="ghost danger icon-btn small"
                      title="删除此条事实"
                      aria-label="删除此条事实"
                      onClick={() => removeFactAt(idx)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                {!isExpanded && (
                  <div className="stack-sm">
                    <div style={{ fontSize: 13 }}>{item.fact || '（未填写事实内容，点击右侧“编辑”完善）'}</div>
                    {(item.skills.length > 0 || item.outcomes) && (
                      <div className="row wrap">
                        {item.skills.map((s) => (
                          <span key={s} className="badge info">{s}</span>
                        ))}
                        {item.outcomes && <span className="muted">成果：{item.outcomes}</span>}
                      </div>
                    )}
                  </div>
                )}

                {isExpanded && (
                  <div className="stack" style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                    <label className="field">
                      <span>事实内容（具体做过什么）</span>
                      <textarea
                        rows={2}
                        value={item.fact}
                        onChange={(e) => updateFactAt(idx, { fact: e.target.value })}
                        placeholder="例：基于 LangGraph 搭建多工具调用编排工作流，支持异常恢复"
                      />
                    </label>
                    <div className="grid-2">
                      <label className="field">
                        <span>经历类型</span>
                        <select
                          value={EXPERIENCE_TYPES.includes(item.experienceType as ExperienceType) ? item.experienceType : '其他'}
                          onChange={(e) => updateFactAt(idx, { experienceType: e.target.value })}
                        >
                          {EXPERIENCE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>参与程度</span>
                        <select
                          value={PARTICIPATION_LEVELS.includes(item.participationLevel as ParticipationLevel) ? item.participationLevel : '参与'}
                          onChange={(e) => updateFactAt(idx, { participationLevel: e.target.value })}
                        >
                          {PARTICIPATION_LEVELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid-2">
                      <label className="field">
                        <span>来源（对应简历哪段经历）</span>
                        <input
                          type="text"
                          value={item.source}
                          onChange={(e) => updateFactAt(idx, { source: e.target.value })}
                          placeholder="例：XX 公司后端实习 / 个人开源项目"
                        />
                      </label>
                      <label className="field">
                        <span>技术及能力（逗号/顿号分隔）</span>
                        <input
                          type="text"
                          value={item.skills.join('、')}
                          onChange={(e) => updateFactAt(idx, { skills: parseListInput(e.target.value) })}
                          placeholder="例：Python、Agent 编排、MCP"
                        />
                      </label>
                    </div>
                    <div className="grid-2">
                      <label className="field">
                        <span>可验证成果 / 指标（可选）</span>
                        <input
                          type="text"
                          value={item.outcomes ?? ''}
                          onChange={(e) => updateFactAt(idx, { outcomes: e.target.value })}
                          placeholder="无量化指标可留空"
                        />
                      </label>
                      <label className="field">
                        <span>限制条件 / 边界（可选）</span>
                        <input
                          type="text"
                          value={item.constraints ?? ''}
                          onChange={(e) => updateFactAt(idx, { constraints: e.target.value })}
                          placeholder="例：开发中、仅本地测试、未上线"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: 专属规则 */}
      {tab === 'rules' && (
        <GreetingRulesConfig
          title="档案专属打招呼语规则"
          description="覆盖全局默认规则，可按当前求职方向分别定制选材重点与写作表达。"
          selectionRules={selectionRules}
          onSelectionRulesChange={setSelectionRules}
          rules={rules}
          preferences={greetingPrefs}
          onRulesChange={setRules}
          onPreferencesChange={(p) => {
            setGreetingPrefs(p);
            setPrefsCustomized(true);
          }}
          defaultRulesText={DEFAULT_GREETING_RULES}
          defaultPreferences={DEFAULT_GREETING_PREFERENCES}
          effectivePreview={effectivePreview}
          conflicts={effectivePreview.conflicts}
          textareaAriaLabel="打招呼语规则"
          placeholder="填写当前档案专属写作要求，例如语气、篇幅、段落格式或固定结尾。"
        />
      )}

      {/* Tab 4: 历史样例 */}
      {tab === 'examples' && existing && (
        <GreetingExamples key={existing.id} profileId={existing.id} />
      )}
    </div>
  );
}
