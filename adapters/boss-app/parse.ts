import { normalizeInline, normalizeMultiline } from '../../shared/text';

// BOSS 直聘 Android APP 的无障碍节点树解析。节点格式与 android/.../capture/NodeTreeDumper.kt 的输出一致。
// 字段与 viewId 依据 BOSS 14.200（HyperOS 4 / Android 17）真机探针数据。

/** 无障碍节点（b = 屏幕坐标 "left,top,right,bottom"） */
export interface AppNode {
  cls?: string;
  id?: string;
  text?: string;
  desc?: string;
  b: string;
  /** isVisibleToUser = false：滚出屏幕或被遮挡 */
  offscreen?: boolean;
  children?: AppNode[];
}

/** 原生层每次推送的当前 BOSS 窗口快照 */
export interface AppTreeSnapshot {
  /** 最近一次 TYPE_WINDOW_STATE_CHANGED 的类名，通常是 Activity */
  windowClass: string | null;
  root: AppNode;
}

/** 单帧在详情页上看到的字段；滚动时头部或正文可能不在树中。 */
export interface DetailFrame {
  /** 职位头部的标题（tv_job_name） */
  title?: string;
  /** 页面下滑后折叠标题栏中的标题 */
  toolbarTitle?: string;
  salary?: string;
  location?: string;
  experience?: string;
  degree?: string;
  bossName?: string;
  company?: string;
  description?: string;
  descriptionTruncated?: boolean;
}

export type FrameParse = { kind: 'detail'; frame: DetailFrame } | { kind: 'other' };

const ID_PREFIX = 'com.hpbr.bosszhipin:id/';
const DETAIL_WINDOW = /JobPagerActivity$/;
/** 折叠的 JD 末尾：“…  查看更多” */
const COLLAPSED_SUFFIX = /\s*(?:\.{3}|…)\s*查看更多\s*$/;
/** 标题末尾的图标占位符（如“急聘”角标），例：“安全攻防工程师 &@” */
const ICON_PLACEHOLDER_SUFFIX = /(?:\s+[&@%#*]{1,4})+\s*$/;

interface Hit {
  id: string;
  text: string;
  ancestors: readonly string[];
}

function parseBounds(b: string): [number, number, number, number] {
  const [l = 0, t = 0, r = 0, bottom = 0] = b.split(',').map(Number);
  return [l, t, r, bottom];
}

/**
 * 收集带 viewId 且有文字的节点。整棵子树在水平方向位于屏幕外的跳过：
 * 详情页 ViewPager 会把相邻职位放在屏幕左右两侧，不能把它们的字段混进当前职位。
 */
function collect(root: AppNode): Hit[] {
  const [, , screenRight] = parseBounds(root.b);
  const hits: Hit[] = [];
  const walk = (node: AppNode, ancestors: string[]) => {
    const [l, , r] = parseBounds(node.b);
    if (r <= 0 || l >= screenRight) return;
    const id = node.id?.startsWith(ID_PREFIX) ? node.id.slice(ID_PREFIX.length) : undefined;
    const text = node.text ?? node.desc;
    if (id && text && text.trim()) hits.push({ id, text, ancestors });
    if (!node.children) return;
    const next = id ? [...ancestors, id] : ancestors;
    for (const child of node.children) walk(child, next);
  };
  walk(root, []);
  return hits;
}

export function cleanTitle(text: string): string {
  return normalizeInline(text.replace(ICON_PLACEHOLDER_SUFFIX, ''));
}

export function parseFrame(snapshot: AppTreeSnapshot): FrameParse {
  const hits = collect(snapshot.root);
  const first = (id: string, where?: (h: Hit) => boolean) =>
    hits.find((h) => h.id === id && (!where || where(h)))?.text;

  const title = first('tv_job_name');
  const toolbarTitle = first('tv_title', (h) => h.ancestors.includes('ll_title'));
  const rawDescription = first('tv_description');
  const isDetail =
    title !== undefined ||
    rawDescription !== undefined ||
    (snapshot.windowClass !== null && DETAIL_WINDOW.test(snapshot.windowClass));
  if (!isDetail) return { kind: 'other' };

  const frame: DetailFrame = {};
  if (title) frame.title = cleanTitle(title);
  if (toolbarTitle) frame.toolbarTitle = cleanTitle(toolbarTitle);
  const inline = (id: string) => {
    const v = first(id);
    return v ? normalizeInline(v) : undefined;
  };
  const salary = inline('tv_job_salary');
  if (salary) frame.salary = salary;
  const location = inline('tv_required_location');
  if (location) frame.location = location;
  const experience = inline('tv_required_work_exp');
  if (experience) frame.experience = experience;
  const degree = inline('tv_required_degree');
  if (degree) frame.degree = degree;
  const bossName = inline('tv_boss_name');
  if (bossName) frame.bossName = bossName;
  // “某公司 • 招聘经理” → 公司简称
  const company = inline('tv_boss_title')?.split('•')[0]?.trim();
  if (company) frame.company = company;
  if (rawDescription) {
    const truncated = COLLAPSED_SUFFIX.test(rawDescription);
    const description = normalizeMultiline(rawDescription.replace(COLLAPSED_SUFFIX, ''));
    if (description) {
      frame.description = description;
      frame.descriptionTruncated = truncated;
    }
  }
  return { kind: 'detail', frame };
}
