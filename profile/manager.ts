import type { UserProfile } from '../shared/types';
import { AppError } from '../shared/errors';

// Profile CRUD 纯函数（存储 IO 在 storage/）。

export const DEFAULT_GREETING_RULES = `1. 简洁、自然：一段话、3–4 句左右，语气职业但不生硬；突出最相关的经历，不复述整份简历，不堆砌技术名词或工具名。
2. 按 JD 定制：先找出岗位最看重的 2–3 项能力，再用档案中真实具备的工作经历或项目实践逐一对应，不套用通用模板。
3. 实事求是，不夸大：严格区分“了解过”“参与过”“独立完成过”“主导过”；不把个人/课程项目说成企业生产项目，不把学过的知识说成落地经验，不编造年限、职责或成果数据。
4. 突出价值而非罗列：说明经历和项目带来的作用或与岗位的契合点；简历里已有的技术栈不必全部重复。
5. 不主动暴露短板：JD 要求而档案缺少的能力，不在打招呼语中解释或自我否定；如对方追问再如实回答。
6. 个人项目按需提及：只有与岗位方向明显相关、能形成差异化优势时才写，不相关就不提。
7. 不主动谈薪资、到岗时间等条件，除非本规则另有要求。
8. 结尾统一为：“对贵司该岗位很感兴趣，希望有机会进一步沟通！”（也可用“期待进一步沟通”），不写过于具体的方向性表达。`;

export type ProfileInput = Omit<UserProfile, 'id' | 'version' | 'createdAt' | 'updatedAt'>;
export type ProfilePatch = Partial<ProfileInput>;

/** 进入分析 Prompt 的字段：只有它们变化时 version +1。 */
export const VERSIONED_FIELDS = [
  'summary',
  'extraNotes',
  'targetRoles',
  'preferredLocations',
  'salaryPreference',
  'greetingRules',
] as const satisfies readonly (keyof UserProfile)[];

function cleanList(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
}

function normalize<T extends ProfilePatch>(p: T): T {
  const out = { ...p };
  if (out.name !== undefined) out.name = out.name.trim();
  if (out.summary !== undefined) out.summary = out.summary.trim();
  if (out.extraNotes !== undefined) out.extraNotes = out.extraNotes.trim();
  if (out.greetingRules !== undefined) out.greetingRules = out.greetingRules.trim();
  if (out.targetRoles !== undefined) out.targetRoles = cleanList(out.targetRoles);
  if (out.preferredLocations !== undefined) out.preferredLocations = cleanList(out.preferredLocations);
  if (out.salaryPreference !== undefined) {
    const s = out.salaryPreference.trim();
    out.salaryPreference = s || undefined;
  }
  return out;
}

export function validateProfile(p: Pick<UserProfile, 'name' | 'summary'>): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('档案名称不能为空');
  if (!p.summary.trim()) errors.push('档案摘要不能为空');
  return errors;
}

function assertValid(p: Pick<UserProfile, 'name' | 'summary'>) {
  const errors = validateProfile(p);
  if (errors.length) throw new AppError('PROFILE_INVALID', errors.join('；'));
}

export function newProfileId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfile(input: ProfileInput, now = new Date(), id = newProfileId()): UserProfile {
  const n = normalize(input) as ProfileInput;
  assertValid(n);
  const ts = now.toISOString();
  return { ...n, id, version: 1, createdAt: ts, updatedAt: ts };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return (a ?? '') === (b ?? '');
}

export function updateProfile(old: UserProfile, patch: ProfilePatch, now = new Date()): UserProfile {
  const n = normalize(patch);
  const next: UserProfile = { ...old, ...n };
  if ('salaryPreference' in n && n.salaryPreference === undefined) delete next.salaryPreference;
  assertValid(next);
  const bump = VERSIONED_FIELDS.some((k) => sameValue(old[k], next[k]) === false);
  const anyChange = (Object.keys(n) as (keyof ProfileInput)[]).some((k) => !sameValue(old[k], next[k]));
  if (!anyChange) return old;
  return {
    ...next,
    version: bump ? old.version + 1 : old.version,
    updatedAt: now.toISOString(),
  };
}

export function upsertProfile(list: UserProfile[], profile: UserProfile): UserProfile[] {
  const idx = list.findIndex((p) => p.id === profile.id);
  if (idx < 0) return [...list, profile];
  const copy = list.slice();
  copy[idx] = profile;
  return copy;
}

/** 删除 Profile，并返回新的 activeProfileId（若删除的是当前项则切换到剩余第一个或 null）。 */
export function removeProfile(
  list: UserProfile[],
  id: string,
  activeId: string | null,
): { profiles: UserProfile[]; activeProfileId: string | null } {
  const profiles = list.filter((p) => p.id !== id);
  let activeProfileId = activeId;
  if (activeId === id || (activeId && !profiles.some((p) => p.id === activeId))) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  return { profiles, activeProfileId };
}

/** 解析逗号/顿号/换行分隔的列表输入。 */
export function parseListInput(text: string): string[] {
  return cleanList(text.split(/[,，、;；\n]/));
}
