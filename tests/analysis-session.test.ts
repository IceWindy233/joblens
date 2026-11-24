import { describe, expect, it } from 'vitest';
import { AnalysisSession } from '../analysis/session';
import type { AppSettings, Job, LLMConfig, UserProfile } from '../shared/types';

const job: Job = {
  source: 'boss',
  url: 'https://www.zhipin.com/job_detail/x.html',
  title: '前端开发工程师',
  company: '某企业',
  description: '负责 React 组件开发与组件文档编写。',
  fingerprint: 'boss:id:x',
  capturedAt: '2026-01-01T00:00:00.000Z',
};

const profile: UserProfile = {
  id: 'pa',
  name: '前端',
  resumeFileName: 'a.pdf',
  resumeText: '',
  summary: 'React 组件库开发经历',
  extraNotes: '',
  greetingRules: '',
  version: 1,
  createdAt: '',
  updatedAt: '',
};

const config: LLMConfig = { baseURL: 'https://api.example.com/v1', model: 'm1' };
const settings: AppSettings = { activeProfileId: 'pa', llm: config };

const matchPayload = JSON.stringify({
  matchScore: 78,
  scoreReason: '有组件开发和文档经验。',
  requirements: [
    { requirement: 'React 组件开发', evidence: '参与开发了 React 组件库', category: 'focus', status: 'matched', dimension: 'capability' },
    { requirement: '组件文档编写', evidence: '为组件库编写了使用文档', category: 'core', status: 'matched', dimension: 'capability' },
  ],
  greetingSelections: [1, 2],
});

/** 匹配分析请求（JSON 模式）返回固定结果；撰写请求依次返回给定草稿，用尽后重复最后一条。 */
function fakeModel(...greetings: string[]) {
  const calls = { match: 0, greeting: 0 };
  const greetingBodies: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init?.body as string) as { response_format?: unknown };
    let content: string;
    if (body.response_format) {
      calls.match += 1;
      content = matchPayload;
    } else {
      calls.greeting += 1;
      greetingBodies.push(init?.body as string);
      content = greetings.length > 1 ? greetings.shift()! : greetings[0]!;
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };
  return { calls, greetingBodies, fetchImpl };
}

const first = '您好，我参与过 React 组件库开发和文档编写，希望进一步沟通！';
const second = '您好，我做过 React 组件库，也写过组件使用文档，希望进一步沟通！';

function newSession(fetchImpl: typeof fetch) {
  return new AnalysisSession({ fetchImpl, loadExamples: async () => [] });
}

describe('AnalysisSession', () => {
  it('reuses both stage caches when analysis is restarted without force', async () => {
    const { calls, fetchImpl } = fakeModel(first);
    const session = newSession(fetchImpl);
    const target = { job, profile, settings };

    await session.start(target, config, 'sk-1');
    const afterFirst = { ...calls };
    await session.start(target, config, 'sk-1');

    expect(calls).toEqual(afterFirst);
    const snap = session.snapshot(job, profile, settings);
    expect(snap.view.kind).toBe('done');
    expect(snap.greeting).toBe(first);
  });

  it('keeps a user-edited greeting and parks the regenerated one as pending', async () => {
    const { fetchImpl } = fakeModel(first, second);
    const session = newSession(fetchImpl);
    const target = { job, profile, settings };

    await session.start(target, config, 'sk-1');
    session.setGreeting(target, '我自己改过的版本');
    await session.regenerateGreeting(target, config, 'sk-1');

    const snap = session.snapshot(job, profile, settings);
    expect(snap.greeting).toBe('我自己改过的版本');
    expect(snap.isEdited).toBe(true);
    expect(snap.pendingGreeting?.text).toBe(second);

    session.acceptPendingGreeting(target);
    const accepted = session.snapshot(job, profile, settings);
    expect(accepted.greeting).toBe(second);
    expect(accepted.previousGreeting).toBe('我自己改过的版本');
  });

  it('refuses to rewrite the greeting from stale match material after profile facts change', async () => {
    const { calls, fetchImpl } = fakeModel(first);
    const session = newSession(fetchImpl);

    await session.start({ job, profile, settings }, config, 'sk-1');
    const changed = { ...profile, summary: 'Vue 后台系统开发经历', version: 2 };
    expect(session.snapshot(job, changed, settings).analysisStale).toBe(true);

    const before = { ...calls };
    await session.regenerateGreeting({ job, profile: changed, settings }, config, 'sk-1');

    expect(calls).toEqual(before);
    const snap = session.snapshot(job, changed, settings);
    expect(snap.greeting).toBe(first);
    expect(snap.analysisStale).toBe(true);
  });

  it('applies a refine request to one generation only, without flagging the new greeting as stale', async () => {
    const { greetingBodies, fetchImpl } = fakeModel(first, second, first);
    const session = newSession(fetchImpl);
    const target = { job, profile, settings };
    const rule = '突出组件文档经验，精简到 40 字';

    await session.start(target, config, 'sk-1');
    session.setTemporaryRule(target, rule);
    await session.regenerateGreeting(target, config, 'sk-1');

    const snap = session.snapshot(job, profile, settings);
    expect(greetingBodies.at(-1)).toContain(rule);
    expect(snap.greeting).toBe(second);
    expect(snap.temporaryRule).toBe('');
    expect(snap.greetingStale).toBe(false);

    // 修改档案后重新分析，不再带上一次的补充要求（这里命中不带要求的撰写缓存，回到第一版）
    const sent = greetingBodies.length;
    const changed = { ...profile, summary: 'React 组件库与文档站开发经历', version: 2 };
    await session.start({ job, profile: changed, settings }, config, 'sk-1');
    expect(greetingBodies.slice(sent).some((body) => body.includes(rule))).toBe(false);
    expect(session.snapshot(job, changed, settings).greeting).toBe(first);
  });
});
