/** 规范化多行文本：行内空白折叠、去首尾、合并连续空行，保留段落结构。 */
export function normalizeMultiline(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v\u3000]+/g, ' ').trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** 单行文本规范化。 */
export function normalizeInline(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** 用于指纹：去除全部空白。 */
export function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * 还原形近替换字：康熙部首（U+2F00–2FDF）、CJK 部首补充（U+2E80–2EFF）、
 * CJK 兼容表意文字（U+F900–FAFF）逐字做 NFKC，例如 “⽤”(U+2F64) → “用”。
 * 不对全文 NFKC，以免把中文全角标点（，；（））改成半角。
 */
export function normalizeLookalikes(text: string): string {
  return text.replace(/[\u2E80-\u2EFF\u2F00-\u2FDF\uF900-\uFAFF]/g, (c) => c.normalize('NFKC'));
}

/** 是否包含 Unicode 私有区字符（BOSS 薪资字体反爬特征）。 */
export function hasPrivateUseChars(text: string): boolean {
  return /[\uE000-\uF8FF]/.test(text);
}

/** cyrb53：53 位非加密哈希，同步、稳定。 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}
