import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { computeFingerprint, extractJob } from '../adapters/boss/extract';
import { BossJobAdapter } from '../adapters/boss/adapter';
import { buildDomSnapshot } from '../adapters/boss/snapshot';
import { isJobPageUrl, parseJobId } from '../adapters/boss/selectors';
import { isJob } from '../shared/messages';
import type { JobState } from '../shared/types';
import { DETAIL_URL, LIST_URL, detailPageHtml, listPageHtml } from './fixtures/boss-dom';

function docOf(html: string): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

describe('extractJob', () => {
  it('extracts the active job from the real list-page detail panel', () => {
    const r = extractJob(docOf(listPageHtml({})), LIST_URL);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(isJob(r.job)).toBe(true);
    expect(r.job.title).toBe('Ai应用工程师（大模型/视觉方向）');
    expect(r.job.company).toBe('东莞某某贸易有限公司'); // 去掉 “ · HR”
    expect(r.job.salary).toBe('12-20K·14薪');
    expect(r.job.location).toBe('东莞'); // 城市，而非街道地址
    expect(r.job.sourceId).toBe('18963a44fd12044c0nx_09-6GFVQ');
    expect(r.job.fingerprint).toBe('boss:id:18963a44fd12044c0nx_09-6GFVQ');
    // 隐藏干扰字被剔除、可见拆分字保留、康熙部首被还原、换行结构保留
    expect(r.job.description).toBe(
      '岗位职责\n1、负责主流AI大模型的场景化应用调试、指令优化；\n2、根据业务需求，微调模型输出效果。\n\n任职要求\n1、熟悉 Python；\n2、有大模型应用经验优先。',
    );
    // 不混入其他职位、聊天、HR 信息、求职工具
    for (const noise of ['boss', '直聘', '服务员', 'HR', '在线', '工作地址', '尊享', '举报', '立即沟通']) {
      expect(r.job.description).not.toContain(noise);
    }
  });

  it('takes fields from the detail panel, not the newly-activated card', () => {
    // 点击新卡片后面板尚未刷新：sourceId 必须与面板内容一致
    const r = extractJob(docOf(listPageHtml({ activeCardJobId: 'newCard999' })), LIST_URL);
    expect(r.kind === 'ok' && r.job.sourceId).toBe('18963a44fd12044c0nx_09-6GFVQ');
  });

  it('keeps the fingerprint stable when only the HR online status changes', () => {
    const a = extractJob(docOf(listPageHtml({ bossOnline: '在线' })), LIST_URL);
    const b = extractJob(docOf(listPageHtml({ bossOnline: '3日内活跃' })), LIST_URL);
    expect(a.kind === 'ok' && b.kind === 'ok' && a.job.fingerprint === b.job.fingerprint).toBe(true);
  });

  it('extracts the standalone detail page with sourceId from URL', () => {
    const r = extractJob(docOf(detailPageHtml()), DETAIL_URL);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.job.title).toBe('后端开发工程师');
    expect(r.job.company).toBe('某智能公司'); // 不是空的 logo 链接，也不是 “某智能HR”
    expect(r.job.salary).toBe('20-30K');
    expect(r.job.location).toBe('上海');
    // JD 正文，不含页面下方的“公司介绍”（同为 .job-sec-text）
    expect(r.job.description).toBe('岗位职责\n负责服务端接口开发。\n\n任职要求\n熟悉 Java。');
    expect(r.job.sourceId).toBe('abc123XYZ~');
  });

  it('drops salary rendered with private-use font glyphs', () => {
    const r = extractJob(docOf(listPageHtml({ salary: '\ue031\ue032-\ue033\ue031K' })), LIST_URL);
    expect(r.kind === 'ok' && r.job.salary).toBe(undefined);
  });

  it('reports unsupported pages and missing jobs', () => {
    expect(extractJob(docOf(listPageHtml({})), 'https://example.com/').kind).toBe('unsupported');
    expect(extractJob(docOf(listPageHtml({})), 'https://www.zhipin.com/web/geek/chat').kind).toBe('unsupported');
    expect(extractJob(docOf('<div>empty</div>'), LIST_URL).kind).toBe('none');
  });

  it('reports incomplete when required fields are missing', () => {
    const r = extractJob(docOf(listPageHtml({ description: '' })), LIST_URL);
    expect(r).toMatchObject({ kind: 'incomplete', missing: ['description'] });
  });
});

describe('fingerprint', () => {
  const base = { title: '前端开发工程师', company: 'A 公司', description: '负责 页面\n开发' };
  it('is stable across whitespace differences and ignores URL', () => {
    expect(computeFingerprint(base)).toBe(
      computeFingerprint({ ...base, description: '负责页面开发  ' }),
    );
  });
  it('changes when content changes', () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, description: '负责开发' }));
  });
  it('prefers sourceId', () => {
    expect(computeFingerprint({ ...base, sourceId: 'x1' })).toBe('boss:id:x1');
  });
  it('is the same for list panel and detail page of the same job', () => {
    const a = extractJob(docOf(listPageHtml({})), LIST_URL);
    const b = extractJob(docOf(listPageHtml({})), 'https://www.zhipin.com/web/geek/job?page=2');
    expect(a.kind === 'ok' && b.kind === 'ok' && a.job.fingerprint === b.job.fingerprint).toBe(true);
  });
});

describe('DOM snapshot', () => {
  it('produces a skeleton with classes, job links and truncated text', () => {
    const snap = buildDomSnapshot(docOf(listPageHtml({ salary: '\ue031K' })), LIST_URL);
    expect(snap).toContain('抽取结果: ok');
    expect(snap).toContain('list-detail-panel: .job-detail-box');
    expect(snap).toMatch(/div\.job-detail-box/);
    expect(snap).toContain('[href=/job_detail/18963a44fd12044c0nx_09-6GFVQ.html]');
    expect(snap).toContain('"□K"');
    expect(snap).not.toContain('query='); // 不包含 URL 查询参数
  });

  it('annotates hidden decoys inside the detail panel and includes extracted fields', () => {
    const snap = buildDomSnapshot(docOf(listPageHtml({})), LIST_URL);
    expect(snap).toMatch(/span\.NbiWQRac "boss" \{不可见: visibility:hidden\}/);
    expect(snap).toMatch(/span\.CJYxDSctbzt "直聘" \{不可见: display:none\}/);
    expect(snap).toMatch(/span\.zsWHyxM "位"$/m); // 可见拆分字不标注
    expect(snap).toContain('## 抽取结果');
    expect(snap).toContain('company: 东莞某某贸易有限公司');
  });
});

describe('selectors helpers', () => {
  it('parses job ids', () => {
    expect(parseJobId('/job_detail/abc~.html?ka=1')).toBe('abc~');
    expect(parseJobId('https://www.zhipin.com/job_detail/9f8e.html')).toBe('9f8e');
    expect(parseJobId('/gongsi/x.html')).toBeUndefined();
  });
  it('recognizes job pages', () => {
    expect(isJobPageUrl(LIST_URL)).toBe(true);
    expect(isJobPageUrl(DETAIL_URL)).toBe(true);
    expect(isJobPageUrl('https://www.zhipin.com/')).toBe(false);
  });
});

describe('BossJobAdapter change detection', () => {
  afterEach(() => vi.useRealTimers());

  it('reports job switches once, ignores irrelevant DOM churn, and cleans up', async () => {
    vi.useFakeTimers();
    const dom = new JSDOM(`<!doctype html><html><body>${listPageHtml({ jobId: 'job1' })}</body></html>`);
    const doc = dom.window.document;
    let url = LIST_URL;
    const adapter = new BossJobAdapter({ doc, getUrl: () => url, debounceMs: 400 });
    const states: JobState[] = [];
    const off = adapter.onJobStateChange((s) => states.push(s));

    // 无关变化：聊天区新增消息 → 不应上报
    doc.querySelector('.chat-box')!.textContent = '新消息';
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toHaveLength(0);

    // 切换职位
    doc.body.innerHTML = listPageHtml({ jobId: 'job2', title: '渗透测试工程师' });
    await vi.advanceTimersByTimeAsync(100);
    doc.querySelector('.job-salary')!.textContent = '15-25K'; // 防抖期内的多次变化
    await vi.advanceTimersByTimeAsync(500);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: 'ready', job: { title: '渗透测试工程师', sourceId: 'job2' } });

    // URL 变为不支持的页面
    url = 'https://www.zhipin.com/web/geek/chat';
    await vi.advanceTimersByTimeAsync(1500);
    expect(states.at(-1)).toMatchObject({ status: 'error', code: 'UNSUPPORTED_PAGE' });

    off();
    url = LIST_URL;
    doc.body.innerHTML = listPageHtml({ jobId: 'job3' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(states.at(-1)).toMatchObject({ code: 'UNSUPPORTED_PAGE' });
  });

  it('turns loading into JOB_EXTRACTION_FAILED after the timeout', async () => {
    vi.useFakeTimers();
    const dom = new JSDOM(`<!doctype html><html><body>${listPageHtml({ description: '' })}</body></html>`);
    const adapter = new BossJobAdapter({ doc: dom.window.document, getUrl: () => LIST_URL, loadTimeoutMs: 5000 });
    expect(adapter.getJobState()).toEqual({ status: 'loading' });
    const states: JobState[] = [];
    const off = adapter.onJobStateChange((s) => states.push(s));
    await vi.advanceTimersByTimeAsync(5200);
    expect(states.at(-1)).toMatchObject({ status: 'error', code: 'JOB_EXTRACTION_FAILED' });
    off();
  });
});
