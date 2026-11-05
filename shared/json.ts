/**
 * 容错解析模型输出的 JSON：
 * 1. 去除首尾代码围栏；2. 失败则截取第一个 `{` 到最后一个 `}`；3. 仍失败返回 undefined。
 */
export function parseModelJSON(raw: string): unknown {
  const stripped = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
