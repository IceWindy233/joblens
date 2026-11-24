import type { Job, JobState } from '../../shared/types';
import { cyrb53, squashWhitespace } from '../../shared/text';
import { parseFrame, type AppTreeSnapshot, type DetailFrame } from './parse';

/** 详情页字段长时间不齐全时判定为读取失败 */
const LOAD_TIMEOUT_MS = 4000;

interface Accumulated {
  title?: string;
  salary?: string;
  location?: string;
  experience?: string;
  degree?: string;
  bossName?: string;
  company?: string;
  description?: string;
  descriptionTruncated?: boolean;
  firstSeenAt: number;
  /** 首次凑齐必需字段时冻结，避免后续补到的薪资等字段改变职位身份 */
  fingerprint?: string;
}

const HEADER_FIELDS = ['title', 'salary', 'location', 'experience', 'degree', 'bossName', 'company'] as const;

function differs(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a !== b;
}

/**
 * 跨帧合并同一职位详情页的字段：用户滑动时头部与正文先后进出无障碍树，
 * 头部标题/薪资/招聘者变化即视为切换到另一个职位。
 */
export class BossAppJobTracker {
  private current: Accumulated | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  update(snapshot: AppTreeSnapshot): JobState {
    const parsed = parseFrame(snapshot);
    if (parsed.kind === 'other') {
      this.current = null;
      return { status: 'error', code: 'NO_ACTIVE_JOB' };
    }
    const acc = this.merge(parsed.frame);
    return this.toState(acc);
  }

  private merge(f: DetailFrame): Accumulated {
    let acc = this.current;
    const switched =
      acc !== null &&
      (differs(f.title, acc.title) ||
        differs(f.salary, acc.salary) ||
        differs(f.bossName, acc.bossName) ||
        (f.title === undefined && differs(f.toolbarTitle, acc.title)));
    if (acc === null || switched) {
      acc = { firstSeenAt: this.now() };
      this.current = acc;
    }
    if (acc.title === undefined && f.title === undefined && f.toolbarTitle) acc.title = f.toolbarTitle;
    for (const key of HEADER_FIELDS) {
      if (acc[key] === undefined && f[key] !== undefined) acc[key] = f[key];
    }
    if (f.description !== undefined) {
      const fullArrived = !f.descriptionTruncated;
      const replace =
        acc.description === undefined ||
        (acc.descriptionTruncated && fullArrived) ||
        (acc.descriptionTruncated === f.descriptionTruncated &&
          f.description !== acc.description &&
          (fullArrived || f.description.length > acc.description.length));
      if (replace) {
        acc.description = f.description;
        acc.descriptionTruncated = f.descriptionTruncated;
      }
    }
    return acc;
  }

  private toState(acc: Accumulated): JobState {
    if (!acc.title || !acc.company || !acc.description) {
      if (this.now() - acc.firstSeenAt < LOAD_TIMEOUT_MS) return { status: 'loading' };
      const missing = [!acc.title && '职位名称', !acc.company && '公司', !acc.description && '职位描述'].filter(Boolean);
      return { status: 'error', code: 'JOB_EXTRACTION_FAILED', detail: `详情页缺少：${missing.join('、')}` };
    }
    acc.fingerprint ??=
      'bossapp:' +
      cyrb53([acc.title, acc.company, acc.salary ?? '', acc.bossName ?? ''].map(squashWhitespace).join('|'));
    const requirements = [acc.experience, acc.degree].filter(Boolean).join(' · ');
    const job: Job = {
      source: 'boss',
      url: `bossapp://job/${acc.fingerprint}`,
      title: acc.title,
      company: acc.company,
      ...(acc.salary ? { salary: acc.salary } : {}),
      ...(acc.location ? { location: acc.location } : {}),
      description: requirements ? `职位要求：${requirements}\n\n${acc.description}` : acc.description,
      ...(acc.descriptionTruncated ? { descriptionTruncated: true } : {}),
      fingerprint: acc.fingerprint,
      capturedAt: new Date(acc.firstSeenAt).toISOString(),
    };
    return { status: 'ready', job };
  }
}
