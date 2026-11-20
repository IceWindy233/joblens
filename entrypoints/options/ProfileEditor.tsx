import { useRef, useState } from 'react';
import type { AppSettings, UserProfile } from '../../shared/types';
import { toAppError } from '../../shared/errors';
import { parseResumeFile } from '../../profile/parse-resume';
import { redactContacts } from '../../profile/redact';
import { organizeProfile } from '../../profile/organize';
import {
  DEFAULT_GREETING_RULES,
  createProfile,
  parseListInput,
  updateProfile,
  upsertProfile,
  validateProfile,
} from '../../profile/manager';
import { loadProfiles, saveProfiles, updateSettings } from '../../storage';
import { GreetingExamples } from './GreetingExamples';

interface Props {
  existing: UserProfile | null;
  settings: AppSettings;
  apiKey: string | null;
  onDone: () => void;
}

type Msg = { kind: 'ok' | 'err' | 'warn' | 'info'; text: string } | null;

export function ProfileEditor({ existing, settings, apiKey, onDone }: Props) {
  const [fileName, setFileName] = useState(existing?.resumeFileName ?? '');
  const [resumeText, setResumeText] = useState(existing?.resumeText ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [extraNotes, setExtraNotes] = useState(existing?.extraNotes ?? '');
  const [targetRoles, setTargetRoles] = useState(existing?.targetRoles.join('、') ?? '');
  const [locations, setLocations] = useState(existing?.preferredLocations.join('、') ?? '');
  const [salary, setSalary] = useState(existing?.salaryPreference ?? '');
  const [rules, setRules] = useState(existing?.greetingRules ?? DEFAULT_GREETING_RULES);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
    setMsg({ kind: 'info', text: '正在整理档案…' });
    try {
      const draft = await organizeProfile(resumeText, settings.llm, apiKey, controller.signal);
      if (!name.trim() && draft.name) setName(draft.name);
      setSummary(draft.summary);
      if (draft.targetRoles.length) setTargetRoles(draft.targetRoles.join('、'));
      if (draft.preferredLocations.length) setLocations(draft.preferredLocations.join('、'));
      setMsg({ kind: 'ok', text: '已生成档案草稿，请逐项核对：只保留真实、准确的内容后再保存' });
    } catch (err) {
      setMsg({ kind: 'err', text: toAppError(err).message });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const onSave = async () => {
    const errors = validateProfile({ name, summary });
    if (errors.length) return setMsg({ kind: 'err', text: errors.join('；') });
    const fields = {
      name,
      resumeFileName: fileName,
      resumeText,
      summary,
      extraNotes,
      targetRoles: parseListInput(targetRoles),
      preferredLocations: parseListInput(locations),
      salaryPreference: salary,
      greetingRules: rules,
    };
    try {
      // 以存储中的最新数据为准，避免覆盖其他页面的修改
      const list = await loadProfiles();
      const current = existing ? list.find((p) => p.id === existing.id) : undefined;
      const profile = current ? updateProfile(current, fields) : createProfile(fields);
      await saveProfiles(upsertProfile(list, profile));
      if (!settings.activeProfileId) await updateSettings({ activeProfileId: profile.id });
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
        <textarea rows={10} value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
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
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：前端开发方向 / 产品经理方向" />
      </label>
      <label className="field">
        <span>档案摘要 *（分析时作为唯一事实来源，请确保真实准确；可手写）</span>
        <textarea rows={10} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
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
      <div className="field">
        <div className="row between">
          <span>打招呼语规则（可设置岗位差异、专属用语和固定结尾）</span>
          <button
            type="button"
            className="link small"
            disabled={rules.trim() === DEFAULT_GREETING_RULES}
            onClick={() => {
              if (rules.trim() && !window.confirm('用默认规则替换当前内容？')) return;
              setRules(DEFAULT_GREETING_RULES);
            }}
          >
            恢复默认规则
          </button>
        </div>
        <textarea aria-label="打招呼语规则" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
      </div>

      {existing && <GreetingExamples key={existing.id} profileId={existing.id} />}

      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void onSave()}>保存档案</button>
        <button onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
