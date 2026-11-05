// 发送给 LLM 前遮蔽手机号/邮箱（可选，由用户点击触发）。

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 中国大陆手机号（可带 +86 / 空格 / 连字符）
const CN_MOBILE = /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d{4}){2}(?!\d)/g;
// 身份证号
const CN_ID = /(?<![0-9A-Za-z])\d{17}[\dXx](?![0-9A-Za-z])/g;

export const REDACTED = '[已隐藏]';

export function redactContacts(text: string): { text: string; count: number } {
  let count = 0;
  const rep = () => {
    count++;
    return REDACTED;
  };
  const out = text.replace(EMAIL, rep).replace(CN_ID, rep).replace(CN_MOBILE, rep);
  return { text: out, count };
}
