import type { Job } from '../../shared/types';
import {
  cyrb53,
  hasPrivateUseChars,
  normalizeInline,
  normalizeLookalikes,
  normalizeMultiline,
  squashWhitespace,
} from '../../shared/text';
import { LAYOUTS, isJobPageUrl, parseJobId, type Layout } from './selectors';
import { hiddenReason } from './visibility';

export type ExtractOutcome =
  | { kind: 'unsupported' }
  | { kind: 'none' }
  | { kind: 'incomplete'; layout: string; missing: string[] }
  | { kind: 'ok'; job: Job };

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI',
  'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
]);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'BUTTON']);

/**
 * 不依赖 innerText（jsdom 不支持且会触发布局）的文本抽取：
 * <br> 与块级元素产生换行，保留 JD 的段落层次；跳过计算样式不可见的元素（反爬干扰字）。
 */
export function elementText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    const tag = e.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (e !== el && hiddenReason(e)) return;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) out += '\n';
    for (const child of Array.from(e.childNodes)) walk(child);
    if (block) out += '\n';
  };
  walk(el);
  return out;
}

function query(root: Element, doc: Document, selector: string): Element | null {
  if (selector.startsWith('@doc ')) return doc.querySelector(selector.slice(5));
  return root.querySelector(selector);
}

function pickText(root: Element, doc: Document, selectors: string[], multiline = false): string {
  for (const s of selectors) {
    const el = query(root, doc, s);
    if (!el) continue;
    // 把康熙部首等形近替换字（如 ⽤ U+2F64）还原为常规汉字（如 用）
    const raw = normalizeLookalikes(elementText(el));
    const text = multiline ? normalizeMultiline(raw) : normalizeInline(raw);
    if (text) return text;
  }
  return '';
}

function pickHref(root: Element, doc: Document, selectors: string[]): string | undefined {
  for (const s of selectors) {
    const el = query(root, doc, s);
    const href = el?.getAttribute('href');
    if (href) return href;
  }
  return undefined;
}

function findRoot(doc: Document, layout: Layout): Element | null {
  for (const s of layout.root) {
    const el = doc.querySelector(s);
    if (el) return el;
  }
  return null;
}

/** 公司名在部分布局中是 “公司 · HR职位” 形式，只取第一段。 */
function cleanCompany(text: string): string {
  return normalizeInline(text.split(/[·•]/)[0]);
}

export function computeFingerprint(input: {
  sourceId?: string;
  title: string;
  company: string;
  description: string;
}): string {
  if (input.sourceId) return `boss:id:${input.sourceId}`;
  const basis = [input.title, input.company, input.description].map(squashWhitespace).join('|');
  return `boss:h:${cyrb53(basis)}`;
}

/** 纯函数：从当前 Document 抽取当前职位。 */
export function extractJob(doc: Document, url: string, now: Date = new Date()): ExtractOutcome {
  if (!isJobPageUrl(url)) return { kind: 'unsupported' };

  for (const layout of LAYOUTS) {
    const root = findRoot(doc, layout);
    if (!root) continue;
    const f = layout.fields;

    const title = pickText(root, doc, f.title);
    const company = cleanCompany(pickText(root, doc, f.company));
    const description = pickText(root, doc, f.description, true);

    const missing: string[] = [];
    if (!title) missing.push('title');
    if (!company) missing.push('company');
    if (!description) missing.push('description');
    if (missing.length) return { kind: 'incomplete', layout: layout.name, missing };

    const rawSalary = pickText(root, doc, f.salary);
    const salary = rawSalary && !hasPrivateUseChars(rawSalary) ? rawSalary : undefined;
    const location = pickText(root, doc, f.location) || undefined;
    const sourceId =
      layout.name === 'detail-page' ? parseJobId(url) : parseJobId(pickHref(root, doc, f.jobLink));

    const job: Job = {
      source: 'boss',
      ...(sourceId ? { sourceId } : {}),
      url,
      title,
      company,
      ...(salary ? { salary } : {}),
      ...(location ? { location } : {}),
      description,
      fingerprint: computeFingerprint({ sourceId, title, company, description }),
      capturedAt: now.toISOString(),
    };
    return { kind: 'ok', job };
  }
  return { kind: 'none' };
}
