import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanTitle, type AppNode, type AppTreeSnapshot } from '../adapters/boss-app/parse';
import { BossAppJobTracker } from '../adapters/boss-app/tracker';
import type { JobState } from '../shared/types';

// 真机探针样本（BOSS 14.200 / HyperOS 4 / Android 17），公司、招聘者与地址已替换为示例
const load = (name: string): AppTreeSnapshot =>
  JSON.parse(readFileSync(`tests/fixtures/boss-app/${name}.json`, 'utf8')) as AppTreeSnapshot;

const ID = 'com.hpbr.bosszhipin:id/';

function editNodes(snapshot: AppTreeSnapshot, edit: (node: AppNode) => void): AppTreeSnapshot {
  const copy = structuredClone(snapshot);
  const walk = (n: AppNode) => {
    edit(n);
    n.children?.forEach(walk);
  };
  walk(copy.root);
  return copy;
}

function readyJob(state: JobState) {
  if (state.status !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(state)}`);
  return state.job;
}

const FULL_JD = '岗位职责：\n1.负责安全设备运维。\n2.负责渗透测试。\n任职要求：\n1.熟悉常见 Web 漏洞。';

describe('BossAppJobTracker', () => {
  it('reports no active job on the recommendation list', () => {
    expect(new BossAppJobTracker().update(load('list'))).toEqual({ status: 'error', code: 'NO_ACTIVE_JOB' });
  });

  it('reads header fields and marks a collapsed JD as truncated', () => {
    const job = readyJob(new BossAppJobTracker().update(load('detail-top')));
    expect(job).toMatchObject({
      title: '信息安全工程师（应用安全方向）',
      company: '示例医药',
      salary: '15-25K·14薪',
      location: '广州·示例区·示例街道',
      descriptionTruncated: true,
    });
    expect(job.description.startsWith('职位要求：经验不限 · 本科\n\n岗位职责：')).toBe(true);
    expect(job.description).not.toContain('查看更多');
    expect(job.fingerprint.startsWith('bossapp:')).toBe(true);
  });

  it('keeps one job identity while the user scrolls through the detail page', () => {
    const tracker = new BossAppJobTracker();
    const top = readyJob(tracker.update(load('detail-top')));
    const mid = readyJob(tracker.update(load('detail-mid')));
    const bottom = readyJob(tracker.update(load('detail-bottom')));
    expect(mid.fingerprint).toBe(top.fingerprint);
    expect(bottom).toEqual(top);
  });

  it('waits for the header when a detail page is first seen scrolled to the bottom', () => {
    expect(new BossAppJobTracker().update(load('detail-bottom'))).toEqual({ status: 'loading' });
  });

  it('replaces the collapsed JD once the user expands it, without changing identity', () => {
    const tracker = new BossAppJobTracker();
    const collapsed = readyJob(tracker.update(load('detail-top')));
    const expanded = editNodes(load('detail-top'), (n) => {
      if (n.id === `${ID}tv_description`) n.text = FULL_JD;
    });
    const job = readyJob(tracker.update(expanded));
    expect(job.fingerprint).toBe(collapsed.fingerprint);
    expect(job.descriptionTruncated).toBeUndefined();
    expect(job.description.endsWith('1.熟悉常见 Web 漏洞。')).toBe(true);

    // 展开后再看到折叠版本（例如列表复用视图）不回退
    expect(readyJob(tracker.update(load('detail-top'))).description).toBe(job.description);
  });

  it('treats a different header as a new job', () => {
    const tracker = new BossAppJobTracker();
    const first = readyJob(tracker.update(load('detail-top')));
    const other = editNodes(load('detail-top'), (n) => {
      if (n.id === `${ID}tv_job_name`) n.text = '安全攻防工程师 &@';
      if (n.id === `${ID}tv_job_salary`) n.text = '20-40K·15薪';
    });
    const second = readyJob(tracker.update(other));
    expect(second.title).toBe('安全攻防工程师');
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('ignores the neighbouring posting that the pager keeps beside the screen', () => {
    const withNeighbour = editNodes(load('detail-top'), (n) => {
      if (n.id === `${ID}view_pager`) {
        n.children = [
          ...(n.children ?? []),
          {
            id: `${ID}rv_list`,
            b: '1156,0,2312,2242',
            offscreen: true,
            children: [{ id: `${ID}tv_job_name`, text: '相邻职位', b: '1216,255,1921,479' }],
          },
        ];
      }
    });
    expect(readyJob(new BossAppJobTracker().update(withNeighbour)).title).toBe('信息安全工程师（应用安全方向）');
  });
});

describe('cleanTitle', () => {
  it('drops icon placeholder characters appended to titles', () => {
    expect(cleanTitle('网络安全攻防.南方电网.反馈快！ &@  &@')).toBe('网络安全攻防.南方电网.反馈快！');
    expect(cleanTitle('网络安全攻防.南方电网.反馈快！ @%')).toBe('网络安全攻防.南方电网.反馈快！');
  });
});
