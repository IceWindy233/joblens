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
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  ToggleSwitch,
} from '../../components/Icons';

interface Props {
  settings: AppSettings;
  apiKey: string | null;
  apiKeyPersisted: boolean;
  hasPermission: boolean;
}

type Status = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const PROVIDERS = [
  { label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'Ollama 本地', baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
] as const;

export function ModelSettings({ settings, apiKey, apiKeyPersisted, hasPermission }: Props) {
  const [baseURL, setBaseURL] = useState(settings.llm?.baseURL ?? 'https://api.openai.com/v1');
  const [model, setModel] = useState(settings.llm?.model ?? '');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
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
    setStatus({ kind: 'ok', text: '模型配置已保存' });
  };

  const onTest = async () => {
    const d = draft();
    if (typeof d === 'string') return setStatus({ kind: 'err', text: d });
    if (!(await withPermission(d))) return;
    const k = key.trim() || apiKey;
    if (!k) return setStatus({ kind: 'err', text: '请先填写 API Key' });
    setBusy(true);
    setStatus({ kind: 'info', text: '正在测试连接…' });
    try {
      await testConnection(d, k);
      setStatus({ kind: 'ok', text: '连接成功，模型服务可正常响应' });
    } catch (err) {
      setStatus({ kind: 'err', text: toAppError(err).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-card stack-lg">
      <div className="row between wrap">
        <div className="stack-sm">
          <div className="row-sm">
            <IconKey size={15} />
            <h2>OpenAI 兼容接口</h2>
          </div>
          <span className="muted">选择常用服务商快速填充，或填写任意兼容 `/chat/completions` 的接口地址。</span>
        </div>
        {settings.llm && hasPermission && apiKey ? (
          <span className="badge ok">已就绪</span>
        ) : (
          <span className="badge warn">待配置</span>
        )}
      </div>

      <div className="row wrap">
        <span className="muted">常用接口：</span>
        {PROVIDERS.map((p) => {
          const active = normalizeBaseURL(baseURL) === p.baseURL;
          return (
            <button
              key={p.label}
              type="button"
              className={`chip ${active ? 'active' : ''}`}
              onClick={() => {
                setBaseURL(p.baseURL);
                if (!model.trim() || PROVIDERS.some((x) => x.model === model.trim())) {
                  setModel(p.model);
                }
                setStatus(null);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid-2">
        <label className="field">
          <span>API Base URL（需 https，本机 localhost 除外）</span>
          <input
            type="url"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="field">
          <span>模型名称</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini / deepseek-chat"
          />
        </label>
      </div>

      <label className="field">
        <span>
          API Key{' '}
          <span className="muted">
            {apiKey
              ? apiKeyPersisted
                ? '（已保存在本机，留空则不修改）'
                : '（本次会话已设置，留空则不修改）'
              : '（未设置）'}
          </span>
        </span>
        <div className="password-wrap">
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            placeholder={apiKey ? '••••••••••••（留空保持不变）' : 'sk-...'}
          />
          <button
            type="button"
            className="password-toggle"
            title={showKey ? '隐藏 Key' : '显示 Key'}
            aria-label={showKey ? '隐藏 Key' : '显示 Key'}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
        </div>
      </label>

      <div className="stack-sm">
        <ToggleSwitch
          checked={remember}
          onChange={setRemember}
          label="在本机记住 API Key（浏览器重启后免重新输入）"
        />
        <span className="muted">
          {remember
            ? '开启后将以明文保存在本机扩展存储中（网页脚本读不到，本机目录可读取），建议为 JobLens 单独创建带额度上限的 Key。点击“保存配置”生效。'
            : '默认仅保存在本次浏览器会话中，重启后需重新填写。'}
          {settings.llm && !hasPermission && ' 当前尚未获得该域名访问权限，请点击“保存配置”授权。'}
        </span>
      </div>

      <div className="row between wrap">
        <div className="row">
          <button type="button" className="primary" onClick={() => void onSave()}>
            <IconCheck size={14} />
            保存配置
          </button>
          <button type="button" disabled={busy} onClick={() => void onTest()}>
            {busy ? '测试中…' : '测试连接'}
          </button>
        </div>
        {apiKey && (
          <button type="button" className="ghost danger small" onClick={() => void saveApiKey(null)}>
            清除 Key
          </button>
        )}
      </div>

      {status && <div className={`notice ${status.kind}`}>{status.text}</div>}
    </div>
  );
}
