import { describe, expect, it } from 'vitest';
import { chatCompletion, normalizeBaseURL, validateBaseURL } from '../llm/client';
import type { ChatOptions } from '../llm/client';

const KEY = 'sk-test-SECRET-123';
const base = (fetchImpl: typeof fetch, over: Partial<ChatOptions> = {}): ChatOptions => ({
  config: { baseURL: 'https://api.example.com/v1/', model: 'm' },
  apiKey: KEY,
  messages: [{ role: 'user', content: 'hi' }],
  fetchImpl,
  ...over,
});

const ok = (content = '{}') => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
const err = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), { status });

describe('base URL', () => {
  it('normalizes and validates', () => {
    expect(normalizeBaseURL(' https://x.com/v1/chat/completions ')).toBe('https://x.com/v1');
    expect(validateBaseURL('https://x.com/v1')).toBeNull();
    expect(validateBaseURL('http://localhost:11434/v1')).toBeNull();
    expect(validateBaseURL('http://x.com/v1')).toMatch(/https/);
    expect(validateBaseURL('not a url')).toMatch(/无效/);
  });
});

describe('chatCompletion', () => {
  it('posts to /chat/completions with bearer auth and json mode', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return ok('hello');
    }) as unknown as typeof fetch;
    expect(await chatCompletion(base(f, { jsonMode: true }))).toBe('hello');
    expect(seen!.url).toBe('https://api.example.com/v1/chat/completions');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(seen!.init.body as string).response_format).toEqual({ type: 'json_object' });
  });

  it('retries once without response_format when unsupported', async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string);
      bodies.push(b);
      return b.response_format ? err(400, 'response_format is not supported') : ok('x');
    }) as unknown as typeof fetch;
    expect(await chatCompletion(base(f, { jsonMode: true }))).toBe('x');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.response_format).toBeUndefined();
  });

  it.each([
    [401, 'LLM_AUTH'],
    [403, 'LLM_AUTH'],
    [429, 'LLM_RATE_LIMIT'],
    [500, 'LLM_HTTP'],
  ])('maps HTTP %i to %s without leaking the key', async (status, code) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return err(status, `bad key ${KEY}`);
    }) as unknown as typeof fetch;
    const e = (await chatCompletion(base(f)).then(
      () => {
        throw new Error('expected rejection');
      },
      (x: unknown) => x,
    )) as Error & { code: string };
    expect(e.code).toBe(code);
    expect(e.message).not.toContain(KEY);
    expect(calls).toBe(1); // 不自动重试
  });

  it('maps network errors, timeouts and aborts', async () => {
    const boom = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(chatCompletion(base(boom))).rejects.toMatchObject({ code: 'LLM_NETWORK' });

    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    await expect(chatCompletion(base(hang, { timeoutMs: 20 }))).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });

    const c = new AbortController();
    const p = chatCompletion(base(hang, { signal: c.signal }));
    c.abort();
    await expect(p).rejects.toMatchObject({ code: 'LLM_ABORTED' });
  });

  it('rejects bad config and missing key before calling', async () => {
    const never = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    await expect(chatCompletion(base(never, { apiKey: '' }))).rejects.toMatchObject({ code: 'LLM_KEY_MISSING' });
    await expect(
      chatCompletion(base(never, { config: { baseURL: 'http://evil.com', model: 'm' } })),
    ).rejects.toMatchObject({ code: 'LLM_BAD_CONFIG' });
  });

  it('rejects malformed provider responses', async () => {
    const f = (async () => new Response('{"choices":[]}')) as unknown as typeof fetch;
    await expect(chatCompletion(base(f))).rejects.toMatchObject({ code: 'LLM_BAD_OUTPUT' });
  });
});
