// 打招呼语的本地风格与事实检查：只做确定性的规则，不额外调用模型。

/** 规则要求通常 80–140 字；留出固定结尾的余量，超过即定向重写。 */
export const GREETING_MAX_CHARS = 160;

/** 去掉模型常见的外层包装：代码围栏、整段成对引号。 */
export function cleanGreeting(raw: string): string {
  let s = raw.trim().replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
  const m = /^(["“「])([\s\S]*)(["”」])$/.exec(s);
  if (m && '"“「'.indexOf(m[1]!) === '"”」'.indexOf(m[3]!)) s = m[2]!.trim();
  return s;
}

/**
 * 返回未通过的检查项（中文，可直接作为重写反馈）。
 * facts：匹配点和职位标题，用于提示没有依据的阿拉伯数字，不替代人工事实核对。
 */
export function checkGreeting(text: string, facts: string): string[] {
  const issues: string[] = [];
  if (!text) return ['内容为空'];
  if (/[\r\n\u2028\u2029]/.test(text)) issues.push('存在换行，应为一段话');
  if (/^\s*(?:[-*•·]|[0-9一二三四五六七八九十]+[.、)）]|#{1,6}\s|(?:打招呼语|开场白|问候语)\s*[:：])/m.test(text)) {
    issues.push('使用了分点或标题');
  }
  const length = text.replace(/\s/g, '').length;
  if (length > GREETING_MAX_CHARS) {
    issues.push(`长度 ${length} 字，超过 ${GREETING_MAX_CHARS} 字，请压缩到 80–140 字`);
  }
  const numbers = /\d+(?:\.\d+)?/g;
  const supported = new Set(facts.normalize('NFKC').match(numbers));
  const unverified = [...new Set(text.normalize('NFKC').match(numbers))].filter((n) => !supported.has(n));
  if (unverified.length) {
    issues.push(`出现无法从匹配点或职位标题核对的数字（${unverified.join('、')}），请删除未经证实的年限或成果`);
  }
  return issues;
}
