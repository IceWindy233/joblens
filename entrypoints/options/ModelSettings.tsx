import { useEffect, useState } from 'react';
import type { AppSettings, LLMConfig } from '../../shared/types';
import { toAppError } from '../../shared/errors';
import { normalizeBaseURL, testConnection, validateBaseURL } from '../../llm/client';
import {
  requestOriginPermission,
  saveApiKey,
  setApiKeyPersistence,
  updateSettings,
} from '../../storage';

interface Props {
  settings: AppSettings;
  apiKey: string | null;
  apiKeyPersisted: boolean;
  hasPermission: boolean;
}

type Status = { kind: 'ok' | 'err' | 'info'; text: string } | null;

export function ModelSettings({ settings, apiKey, apiKeyPersisted, hasPermission }: Props) {
  const [baseURL, setBaseURL] = useState(settings.llm?.baseURL ?? 'https://api.openai.com/v1');
  const [model, setModel] = useState(settings.llm?.model ?? '');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(apiKeyPersisted);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.llm) {
      setBaseURL(settings.llm.baseURL);
      setModel(settings.llm.model);
    }
  }, [settings.llm]);

  useEffect(() => setRemember(apiKeyPersisted), [apiKeyPersisted]);

  const draft = (): LLMConfig | string => {
    const err = validateBaseURL(baseURL);
    if (err) return err;
    if (!model.trim()) return '请填写模型名称';
    return { baseURL: normalizeBaseURL(baseURL), model: model.trim() };
  };

  /** 权限申请必须在点击回调中最先调用，以保留用户手势。 */
  const withPermission = async (config: LLMConfig): Promise<boolean> => {
    const granted = await requestOriginPermission(config.baseURL);
    if (!granted) setStatus({ kind: 'err', text: '未授予 API 主机访问权限，无法调用该模型服务' });
    return granted;
  };

  const onSave = async () => {
    const d = draft();
    if (typeof d === 'string') return setStatus({ kind: 'err', text: d });
    if (!(await withPermission(d))) return;
    await updateSettings({ llm: d });
    if (key.trim()) {
      await saveApiKey(key.trim(), remember);
      setKey('');
    } else if (apiKey && remember !== apiKeyPersisted) {
      await setApiKeyPersistence(remember);
    }
    setStatus({ kind: 'ok', text: '已保存' });
  };

  const onTest = async () => {
    const d = draft();
    if (typeof d === 'string') return setStatus({ kind: 'err', text: d });
    if (!(await withPermission(d))) return;
    const k = key.trim() || apiKey;
    if (!k) return setStatus({ kind: 'err', text: '请填写 API Key' });
    setBusy(true);
    setStatus({ kind: 'info', text: '正在测试连接…' });
    try {
      await testConnection(d, k);
      setStatus({ kind: 'ok', text: '连接成功' });
    } catch (err) {
      setStatus({ kind: 'err', text: toAppError(err).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h2>模型设置</h2>
      <label className="field">
        <span>API Base URL（OpenAI-compatible，需 https）</span>
        <input type="url" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
      </label>
      <label className="field">
        <span>模型名称</span>
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini / deepseek-chat …" />
      </label>
      <label className="field">
        <span>
          API Key{' '}
          {apiKey
            ? apiKeyPersisted
              ? '（已保存在本机，留空则不修改）'
              : '（本次浏览器会话已设置，留空则不修改）'
            : '（未设置）'}
        </span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
      </label>
      <label className="row small">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        在本机记住 API Key（浏览器重启后无需重新输入）
      </label>
      <div className="muted">
        {remember
          ? '记住后 Key 以明文保存在本机浏览器的扩展存储中（未加密）：网页和内容脚本读不到，但能访问你电脑和浏览器用户目录的人或恶意软件可以读到。建议使用单独创建、设置了额度上限的 Key。勾选状态在点击“保存”后生效。'
          : '默认只保存在浏览器会话中，浏览器重启或扩展重载后需重新输入；不会传给网页或内容脚本。'}
        {settings.llm && !hasPermission && ' 当前未授予该 API 主机访问权限，请点击保存重新授权。'}
      </div>
      <div className="row">
        <button className="primary" onClick={() => void onSave()}>保存</button>
        <button disabled={busy} onClick={() => void onTest()}>测试连接</button>
        {apiKey && (
          <button className="link" onClick={() => void saveApiKey(null)}>清除 Key</button>
        )}
      </div>
      {status && <div className={`notice ${status.kind === 'info' ? '' : status.kind}`}>{status.text}</div>}
    </div>
  );
}
