import { LAYOUTS } from './selectors';
import { extractJob } from './extract';
import { hiddenReason } from './visibility';

/**
 * 开发诊断：生成当前页面的“结构骨架”，用于在真实页面核验选择器。
 * 与 Adapter 读取的是同一份已渲染 DOM，不绕过任何页面防护。
 *
 * 每行：缩进 + tag#id.class[ka][href] + 该元素直属文字（截断）。
 * 只保留 id / class / ka / href(路径部分) 属性；跳过 script/style/svg 等。
 */

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'LINK', 'META', 'IMG', 'CANVAS']);

export interface SnapshotOptions {
  annotate?: (el: Element) => string;
  maxDepth?: number;
  maxNodes?: number;
  maxText?: number;
}

function describe(el: Element, maxText: number): string {
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
  if (cls.length) s += `.${cls.join('.')}`;
  const ka = el.getAttribute('ka');
  if (ka) s += `[ka=${ka}]`;
  const href = el.getAttribute('href');
  if (href && !href.startsWith('javascript')) {
    try {
      s += `[href=${new URL(href, 'https://www.zhipin.com').pathname}]`;
    } catch {
      /* ignore */
    }
  }
  let text = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.nodeValue ?? '';
  text = text.replace(/\s+/g, ' ').trim();
  if (text) {
    // 私有区字符（字体反爬）标注出来，便于判断
    const shown = text.replace(/[\uE000-\uF8FF]/g, '□');
    s += ` "${shown.length > maxText ? `${shown.slice(0, maxText)}…` : shown}"`;
  }
  return s;
}

export function domSkeleton(root: Element, opts: SnapshotOptions = {}): string {
  const maxDepth = opts.maxDepth ?? 40;
  const maxNodes = opts.maxNodes ?? 4000;
  const maxText = opts.maxText ?? 60;
  const lines: string[] = [];
  let count = 0;
  const walk = (el: Element, depth: number) => {
    if (count >= maxNodes || depth > maxDepth || SKIP.has(el.tagName.toUpperCase())) return;
    count++;
    const note = opts.annotate?.(el);
    lines.push(`${'  '.repeat(depth)}${describe(el, maxText)}${note ? ` ${note}` : ''}`);
    for (const c of Array.from(el.children)) walk(c, depth + 1);
  };
  walk(root, 0);
  if (count >= maxNodes) lines.push(`… 已截断（超过 ${maxNodes} 个节点）`);
  return lines.join('\n');
}

export function buildDomSnapshot(doc: Document, url: string): string {
  const outcome = extractJob(doc, url);
  const matched = LAYOUTS.flatMap((l) =>
    l.root.filter((s) => doc.querySelector(s)).map((s) => `${l.name}: ${s}`),
  );
  const roots = LAYOUTS.flatMap((l) => l.root.map((s) => doc.querySelector(s))).filter(
    (e): e is Element => !!e,
  );
  // 只在职位详情容器内标注不可见元素，用于核验反爬干扰字过滤
  const annotate = (el: Element) => {
    if (!roots.some((r) => r.contains(el))) return '';
    const reason = hiddenReason(el);
    return reason ? `{不可见: ${reason}}` : '';
  };

  const extracted =
    outcome.kind === 'ok'
      ? [
          '## 抽取结果（JobLens 实际会使用的字段）',
          `title: ${outcome.job.title}`,
          `company: ${outcome.job.company}`,
          `salary: ${outcome.job.salary ?? '（空）'}`,
          `location: ${outcome.job.location ?? '（空）'}`,
          `sourceId: ${outcome.job.sourceId ?? '（空）'}`,
          `fingerprint: ${outcome.job.fingerprint}`,
          'description:',
          outcome.job.description,
          '',
        ].join('\n')
      : '';

  const header = [
    '# JobLens DOM 诊断快照',
    `URL: ${new URL(url).origin}${new URL(url).pathname}`,
    `时间: ${new Date().toISOString()}`,
    `抽取结果: ${outcome.kind}${outcome.kind === 'incomplete' ? `（${outcome.layout} 缺少 ${outcome.missing.join(', ')}）` : ''}`,
    `命中的容器选择器: ${matched.length ? matched.join(' | ') : '无'}`,
    '',
    '注意：快照包含页面上可见的文字（职位描述、公司名等），分享前可自行删除敏感内容。',
    '',
  ].join('\n');
  return `${header}\n${extracted}\n## 页面结构骨架\n${domSkeleton(doc.body, { annotate })}`;
}
