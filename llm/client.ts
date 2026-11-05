import type { LLMConfig } from '../shared/types';
import { AppError, redactSecret } from '../shared/errors';
import { isRecord } from '../shared/json';

// OpenAI-compatible Chat Completions 客户端。不含业务 Prompt。

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  config: LLMConfig;
  apiKey: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 90_000;
export const MAX_RESPONSE_BYTES = 1_000_000;

export function normalizeBaseURL(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  s = s.replace(/\/chat\/completions$/, '');
  return s;
}

/** 仅允许 https；localhost / 127.0.0.1 允许 http（本机测试）。返回错误信息或 null。 */
export function validateBaseURL(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(normalizeBaseURL(raw));
  } catch {
    return 'Base URL 格式无效';
  }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
    return null;
  }
  return 'Base URL 必须使用 https://（本机 localhost 除外）';
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new AppError('LLM_BAD_OUTPUT', '模型响应过大');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

function extractServerMessage(body: string): string {
  try {
    const j: unknown = JSON.parse(body);
    if (isRecord(j)) {
      const e = j.error;
      if (isRecord(e) && typeof e.message === 'string') return e.message;
      if (typeof e === 'string') return e;
      if (typeof j.message === 'string') return j.message;
    }
  } catch {
    /* ignore */
  }
  return body.slice(0, 200);
}

function looksLikeResponseFormatUnsupported(status: number, msg: string): boolean {
  return (status === 400 || status === 422) && /response_format|json_object|json mode/i.test(msg);
}

async function postOnce(opts: ChatOptions, jsonMode: boolean): Promise<string> {
  const { config, apiKey, messages } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${normalizeBaseURL(config.baseURL)}/chat/completions`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener('abort', onAbort);

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (jsonMode) body.response_format = { type: 'json_object' };

  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new AppError('LLM_TIMEOUT');
      if (opts.signal?.aborted) throw new AppError('LLM_ABORTED');
      const m = err instanceof Error ? err.message : String(err);
      throw new AppError('LLM_NETWORK', `网络错误：${redactSecret(m, apiKey)}`);
    }

    let text: string;
    try {
      text = await readCapped(res, MAX_RESPONSE_BYTES);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (timedOut) throw new AppError('LLM_TIMEOUT');
      if (opts.signal?.aborted) throw new AppError('LLM_ABORTED');
      throw new AppError('LLM_NETWORK');
    }

    if (!res.ok) {
      const serverMsg = redactSecret(extractServerMessage(text), apiKey);
      if (jsonMode && looksLikeResponseFormatUnsupported(res.status, serverMsg)) {
        throw new ResponseFormatUnsupported();
      }
      if (res.status === 401 || res.status === 403) throw new AppError('LLM_AUTH');
      if (res.status === 429) throw new AppError('LLM_RATE_LIMIT');
      throw new AppError('LLM_HTTP', `模型服务返回错误（HTTP ${res.status}）：${serverMsg}`);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError('LLM_BAD_OUTPUT', '模型服务响应不是 JSON');
    }
    const content = isRecord(json) && Array.isArray(json.choices) ? json.choices[0] : undefined;
    const message = isRecord(content) ? content.message : undefined;
    const out = isRecord(message) ? message.content : undefined;
    if (typeof out !== 'string') {
      throw new AppError('LLM_BAD_OUTPUT', '模型服务响应缺少 choices[0].message.content');
    }
    return out;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

class ResponseFormatUnsupported extends Error {}

function precheck(opts: ChatOptions) {
  if (!opts.config?.baseURL || !opts.config?.model) throw new AppError('LLM_NOT_CONFIGURED');
  const bad = validateBaseURL(opts.config.baseURL);
  if (bad) throw new AppError('LLM_BAD_CONFIG', bad);
  if (!opts.apiKey) throw new AppError('LLM_KEY_MISSING');
}

/**
 * 发送一次 Chat Completions 请求并返回 message.content。
 * jsonMode 时先带 response_format；服务端明确不支持时去掉该参数重试一次。
 */
export async function chatCompletion(opts: ChatOptions): Promise<string> {
  precheck(opts);
  const jsonMode = opts.jsonMode ?? false;
  try {
    return await postOnce(opts, jsonMode);
  } catch (err) {
    if (err instanceof ResponseFormatUnsupported) return postOnce(opts, false);
    throw err;
  }
}

/** 最小化连接测试：不发送简历和 JD。 */
export async function testConnection(
  config: LLMConfig,
  apiKey: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  await chatCompletion({
    config,
    apiKey,
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 8,
    temperature: 0,
    timeoutMs: 30_000,
    fetchImpl,
  });
}
