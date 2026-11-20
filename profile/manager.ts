import type { UserProfile } from '../shared/types';
import { AppError } from '../shared/errors';

// Profile CRUD 纯函数（存储 IO 在 storage/）。

export const DEFAULT_GREETING_RULES = `不主动谈薪资、到岗时间等条件。
固定结尾：“对贵司该岗位很感兴趣，希望有机会进一步沟通！”`;

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
