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
  parseListInput,
  resolveGreetingConfig,
  updateProfile,
  upsertProfile,
  validateProfile,
} from '../../profile/manager';
import { loadProfiles, saveProfiles, updateSettings } from '../../storage';
import { GreetingExamples } from './GreetingExamples';
import { GreetingRulesConfig } from './GreetingRulesConfig';

interface Props {
  existing: UserProfile | null;
  settings: AppSettings;
  apiKey: string | null;
  onDone: () => void;
}

type Msg = { kind: 'ok' | 'err' | 'warn' | 'info'; text: string } | null;

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
    id: `fact-${Date.now().toString(36)}`,
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
  const [fileName, setFileName] = useState(existing?.resumeFileName ?? '');
  const [resumeText, setResumeText] = useState(existing?.resumeText ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [facts, setFacts] = useState<ProfileFact[]>(existing?.facts ?? []);
  const [factsDraftPendingConfirm, setFactsDraftPendingConfirm] = useState(false);
  const [extraNotes, setExtraNotes] = useState(existing?.extraNotes ?? '');
  const [targetRoles, setTargetRoles] = useState(existing?.targetRoles.join('、') ?? '');
  const [locations, setLocations] = useState(existing?.preferredLocations.join('、') ?? '');
  const [salary, setSalary] = useState(existing?.salaryPreference ?? '');
  const [rules, setRules] = useState(existing?.greetingRules ?? DEFAULT_GREETING_RULES);
  const [greetingPrefs, setGreetingPrefs] = useState<GreetingPreferences>(() => ({
    ...DEFAULT_GREETING_PREFERENCES,
    ...(settings.globalGreetingPreferences ?? {}),
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
          greetingRules: rules,
          greetingPreferences: prefsCustomized ? greetingPrefs : existing?.greetingPreferences,
        },
      }),
    [settings, rules, greetingPrefs, prefsCustomized, existing?.greetingPreferences],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg({ kind: 'info', text: '正在本地提取文字…' });
    try {
      const parsed = await parseResumeFile(file);
      setFileName(file.name);
      setResumeText(parsed.text);
      setMsg(
        parsed.isLarge
          ? { kind: 'warn', text: '提取的文字较长，请检查内容是否正确（例如是否混入了无关页面）' }
          : { kind: 'ok', text: '已提取文字，请检查下方内容，可直接编辑删除无关或敏感信息' },
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
      setMsg({ kind: 'err', text: '请先在上方配置模型并填写 API Key，或直接手动填写档案摘要' });
      return;
    }
    const ok = window.confirm(
      `将把上方“简历文字”（${resumeText.length} 字）发送给你配置的模型服务商（${new URL(settings.llm.baseURL).host}）进行整理。\n该服务商可能按其政策保留数据。建议先遮蔽联系方式。是否继续？`,
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
      }
      if (draft.targetRoles.length) setTargetRoles(draft.targetRoles.join('、'));
      if (draft.preferredLocations.length) setLocations(draft.preferredLocations.join('、'));
      setMsg({
        kind: 'warn',
        text: '已生成档案摘要与结构化事实草稿。模型整理的经历类型、参与程度与限制条件须由你逐项核对确认后再保存。',
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
  };

  const onSave = async () => {
    const errors = validateProfile({ name, summary });
    if (errors.length) return setMsg({ kind: 'err', text: errors.join('；') });
    const fields = {
      name,
      resumeFileName: fileName,
      resumeText,
      summary,
      facts,
      extraNotes,
      targetRoles: parseListInput(targetRoles),
      preferredLocations: parseListInput(locations),
      salaryPreference: salary,
      greetingRules: rules,
      ...(prefsCustomized ? { greetingPreferences: greetingPrefs } : {}),
    };
    try {
      // 以存储中的最新数据为准，避免覆盖其他页面的修改
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
    <div className="card stack">
      <div className="row between">
        <h2>{existing ? `编辑档案：${existing.name}` : '新建档案'}</h2>
        <button className="link" onClick={onDone}>关闭</button>
      </div>

      <label className="field">
        <span>上传简历（文字版 PDF / DOCX，≤ 10 MB，本地解析，不做 OCR）</span>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {fileName && <span className="muted">当前文件：{fileName}</span>}
      </label>

      <label className="field">
        <span>简历文字（可编辑；“整理档案”只发送这里的内容）</span>
        <textarea rows={8} value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
      </label>
      <div className="row">
        <button disabled={!resumeText.trim() || busy} onClick={onRedact}>遮蔽手机号/邮箱</button>
        <button className="primary" disabled={!resumeText.trim() || busy} onClick={() => void onOrganize()}>
          整理档案（调用模型）
        </button>
        {busy && abortRef.current && <button onClick={() => abortRef.current?.abort()}>取消</button>}
      </div>

      {msg && <div className={`notice ${msg.kind === 'info' ? '' : msg.kind}`}>{msg.text}</div>}

      <label className="field">
        <span>档案名称 *</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：AI Agent 工程 / 全栈开发" />
      </label>
      <label className="field">
        <span>档案摘要 *（分析时作为客观事实依据，请确保真实准确；勿写成自荐宣传文案）</span>
        <textarea rows={8} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>

      <div className="card soft stack">
        <div className="row between">
          <div>
            <strong>结构化事实清单（共 {facts.length} 条）</strong>
            <div className="muted">
              明确区分经历类型、参与程度、能力证据与限制条件（如开发中、仅测试），防止分析时混淆个人项目与生产经验。
            </div>
          </div>
          <button
            type="button"
            className="small"
            onClick={() => setFacts((prev) => [...prev, emptyFact()])}
          >
            + 新增事实
          </button>
        </div>

        {factsDraftPendingConfirm && (
          <div className="notice warn">
            以下事实由模型从简历整理而来，请重点核对“经历类型”“参与程度”和“限制条件”是否准确，确认后再保存档案。
          </div>
        )}

        {facts.length === 0 && (
          <div className="muted">暂无结构化事实。可通过“整理档案”自动提取，或手动点击“+ 新增事实”补充。</div>
        )}

        {facts.map((item, idx) => (
          <div key={item.id ?? idx} className="card stack">
            <div className="row between">
              <span className="small"><strong>事实 #{idx + 1}</strong></span>
              <button type="button" className="danger small" onClick={() => removeFactAt(idx)}>
                删除
              </button>
            </div>
            <label className="field">
              <span>事实内容（具体做过什么）</span>
              <textarea
                rows={2}
                value={item.fact}
                onChange={(e) => updateFactAt(idx, { fact: e.target.value })}
                placeholder="例：基于 LangGraph 搭建工具调用工作流，支持多轮工具重试与结果校验"
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
                <span>来源（对应简历哪段经历或项目）</span>
                <input
                  type="text"
                  value={item.source}
                  onChange={(e) => updateFactAt(idx, { source: e.target.value })}
                  placeholder="例：XX 公司后端实习 / 个人开源项目"
                />
              </label>
              <label className="field">
                <span>技术及能力（用顿号或逗号分隔）</span>
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
        ))}
      </div>

      <label className="field">
        <span>补充事实与能力边界（例：“某技术仅自学过，没有项目经验”“只考虑全职岗位”）</span>
        <textarea rows={3} value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} />
      </label>
      <label className="field">
        <span>目标岗位（用顿号或逗号分隔）</span>
        <input type="text" value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} />
      </label>
      <label className="field">
        <span>偏好地点</span>
        <input type="text" value={locations} onChange={(e) => setLocations(e.target.value)} />
      </label>
      <label className="field">
        <span>期望薪资</span>
        <input type="text" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="例：15-20K" />
      </label>

      <GreetingRulesConfig
        title="档案专属打招呼语规则"
        description="覆盖全局默认规则，可按当前求职方向定制选材重点、长度、段落格式与固定结尾。"
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
        textareaAriaLabel="打招呼语规则"
        placeholder="填写当前档案专属要求，例如针对特定岗位重点突出什么经验、技术细节深度、是否分段或固定结尾。"
      />

      {existing && <GreetingExamples key={existing.id} profileId={existing.id} />}

      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void onSave()}>保存档案</button>
        <button onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
