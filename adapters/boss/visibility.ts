/**
 * 判断元素是否对用户不可见（BOSS JD 正文中插入了随机 class 的隐藏“干扰字”，
 * 如 <span class="NbiWQRac">boss</span>，需按计算样式剔除；可见的拆分字如“位”“调”保留）。
 *
 * 只基于浏览器计算样式；返回不可见的原因，可见时返回 null。
 */
export function hiddenReason(el: Element): string | null {
  const view = el.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return null;
  if (el.hasAttribute('hidden')) return 'hidden 属性';
  const s = view.getComputedStyle(el);
  if (s.display === 'none') return 'display:none';
  if (s.visibility === 'hidden' || s.visibility === 'collapse') return `visibility:${s.visibility}`;
  if (s.opacity !== '' && Number(s.opacity) === 0) return 'opacity:0';
  const fontSize = parseFloat(s.fontSize);
  if (s.fontSize && !Number.isNaN(fontSize) && fontSize < 1) return `font-size:${s.fontSize}`;
  if (s.position === 'absolute' || s.position === 'fixed') {
    const left = parseFloat(s.left);
    const top = parseFloat(s.top);
    if ((!Number.isNaN(left) && left <= -500) || (!Number.isNaN(top) && top <= -500)) {
      return `off-screen(${s.left},${s.top})`;
    }
  }
  const clip = s.clip ?? '';
  if (/rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)/.test(clip)) return 'clip:rect(0)';
  const clipPath = s.getPropertyValue('clip-path');
  if (/inset\(\s*(50%|100%)/.test(clipPath)) return `clip-path:${clipPath}`;
  if ((s.width === '0px' || s.height === '0px') && s.overflow === 'hidden') return 'size:0+overflow:hidden';
  const color = s.color.replace(/\s+/g, '');
  if (color === 'transparent' || /rgba\(\d+,\d+,\d+,0\)/.test(color)) return 'color:transparent';
  return null;
}
