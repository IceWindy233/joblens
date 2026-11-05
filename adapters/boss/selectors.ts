/**
 * BOSS 直聘 DOM 定位规则。
 *
 * 选择器已用真实页面诊断快照核验（侧边栏“开发诊断 → 下载页面结构”）。页面改版时按快照更新，
 * 同时更新 tests/fixtures/boss-dom.ts 中的样本。页面适配只在本目录内修改。
 *
 * 每个 layout 描述一种页面形态：先用 root 找到“当前职位详情容器”，
 * 再在容器内按候选顺序查找字段；以 `@doc ` 开头的选择器在整个 document 中查找。
 */

export interface FieldSelectors {
  title: string[];
  company: string[];
  description: string[];
  salary: string[];
  location: string[];
  /** 指向 /job_detail/<id>.html 的链接，用于 sourceId */
  jobLink: string[];
}

export interface Layout {
  name: string;
  root: string[];
  fields: FieldSelectors;
}

export const LAYOUTS: Layout[] = [
  {
    // 职位独立详情页：https://www.zhipin.com/job_detail/<id>.html
    // ✅ 2026-11-05 已用真实页面诊断快照核验（tests/fixtures/real/joblens-dom-1793861832831.txt）。
    // 注意：页面下方“公司介绍”也是 .job-sec-text（带 .fold-text），必须排除；
    // 侧栏公司区第一个 <a> 是无文字的 logo 链接，公司名在 ka=job-detail-company_custompage。
    name: 'detail-page',
    root: ['#main .job-banner', '.job-banner'],
    fields: {
      title: ['.info-primary .name h1', '.name h1'],
      company: [
        '@doc .sider-company .company-info a[ka="job-detail-company_custompage"]',
        '@doc .sider-company .company-info a[ka*="company"]:not([ka*="logo"])',
      ],
      description: [
        '@doc .job-detail .job-detail-section .job-sec-text:not(.fold-text)',
      ],
      salary: ['.info-primary .name .salary'],
      location: ['.info-primary .text-city'],
      jobLink: [],
    },
  },
  {
    // 职位列表页右侧详情面板：/web/geek/jobs
    // ✅ 2026-11-05 已用真实页面诊断快照核验（tests/fixtures/real/），含干扰字过滤的端到端确认。
    // 结构：div.job-detail-container > div.job-detail-box > (div.job-detail-header, div.job-detail-body)
    // 字段优先取详情面板内部，避免点击新卡片后面板尚未刷新时与左侧 active 卡片不一致。
    name: 'list-detail-panel',
    root: ['.job-detail-box', '.job-detail-container'],
    fields: {
      title: ['.job-detail-info .job-name', '.job-name'],
      company: [
        // 形如“东莞某某有限公司 · HR”，cleanCompany 只取第一段
        '.job-boss-info .boss-info-attr',
        '.boss-info-attr',
        '@doc .job-card-wrap.active .boss-name',
      ],
      // p.desc 中混有随机 class 的隐藏干扰字，由 elementText 按计算样式剔除
      description: ['.job-detail-body p.desc', '.job-detail-body .desc'],
      // 薪资为字体反爬（私有区字符），通常会被置空
      salary: ['.job-detail-info .job-salary'],
      location: [
        '.job-detail-header .tag-list li:first-child',
        '@doc .job-card-wrap.active .company-location',
        '.job-address-desc',
      ],
      jobLink: [
        'a.more-job-btn[href*="/job_detail/"]',
        'a[href*="/job_detail/"]',
        '@doc .job-card-wrap.active a.job-name[href*="/job_detail/"]',
      ],
    },
  },
];

/** 判断 URL 是否属于可能出现职位详情的 BOSS 页面。 */
export function isJobPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/(^|\.)zhipin\.com$/.test(u.hostname)) return false;
    return /^\/(job_detail\/|web\/geek\/jobs?\b|web\/geek\/job-recommend)/.test(u.pathname);
  } catch {
    return false;
  }
}

export function isBossUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)zhipin\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** 从职位链接或 URL 中解析岗位 ID。 */
export function parseJobId(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  const m = /\/job_detail\/([A-Za-z0-9_~-]+?)(?:\.html)?(?:[?#]|$)/.exec(href);
  return m?.[1];
}
