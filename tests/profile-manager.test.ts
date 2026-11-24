import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GREETING_RULES,
  createProfile,
  migrateProfile,
  parseListInput,
  removeProfile,
  updateProfile,
  upsertProfile,
  type ProfileInput,
} from '../profile/manager';
import { redactContacts } from '../profile/redact';
import { finalizeResumeText, detectResumeKind } from '../profile/parse-resume';
import { validateProfileDraft, buildOrganizeMessages } from '../profile/organize';
import { AppError } from '../shared/errors';

const input = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  name: '前端开发方向',
  resumeFileName: 'sec.pdf',
  resumeText: '原始简历文字',
  summary: '前端开发 2 年',
  extraNotes: 'Vue 仅自学',
  greetingRules: DEFAULT_GREETING_RULES,
  ...over,
});

describe('profile manager', () => {
  it('creates with version 1 and validates required fields', () => {
    const p = createProfile(input(), new Date('2026-01-01'), 'a');
    expect(p).toMatchObject({ id: 'a', version: 1, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(() => createProfile(input({ name: '  ' }))).toThrow(AppError);
    expect(() => createProfile(input({ summary: '' }))).toThrow(/摘要/);
  });

  it('bumps version only for prompt-affecting fields', () => {
    const p = createProfile(input(), new Date(), 'a');
    expect(updateProfile(p, { name: '新名字' }).version).toBe(1);
    expect(updateProfile(p, { resumeText: '改过的原文' }).version).toBe(1);
    expect(updateProfile(p, { summary: '前端开发 3 年' }).version).toBe(2);
    expect(updateProfile(p, { extraNotes: '参与过 Vue 项目开发' }).version).toBe(2);
    expect(updateProfile(p, { greetingRules: '简短' }).version).toBe(2);
    expect(updateProfile(p, { summary: ' 前端开发 2 年 ' })).toBe(p);
  });

  it('retains resume and writing data when reading a previous profile', () => {
    const profile = createProfile(input({ selectionRules: '优先使用工作经历' }));
    const previous = { ...profile, targetRoles: ['研发'], preferredLocations: ['深圳'], salaryPreference: '15K' };
    expect(migrateProfile(previous)).toEqual(profile);
  });

  it('keeps profiles isolated on update and delete', () => {
    const a = createProfile(input(), new Date(), 'a');
    const b = createProfile(input({ name: '数据分析方向', summary: 'SQL / Python' }), new Date(), 'b');
    let list = upsertProfile(upsertProfile([], a), b);
    list = upsertProfile(list, updateProfile(a, { summary: '改 A' }));
    expect(list.find((p) => p.id === 'b')).toEqual(b);

    const r = removeProfile(list, 'a', 'a');
    expect(r.profiles.map((p) => p.id)).toEqual(['b']);
    expect(r.profiles[0]).toEqual(b);
    expect(r.activeProfileId).toBe('b');
    expect(removeProfile(r.profiles, 'b', 'b').activeProfileId).toBeNull();
    expect(removeProfile(list, 'b', 'a').activeProfileId).toBe('a');
  });

  it('parses list input', () => {
    expect(parseListInput('前端开发、全栈开发, 移动端，前端开发')).toEqual(['前端开发', '全栈开发', '移动端']);
  });
});

describe('resume helpers', () => {
  it('redacts contacts', () => {
    const r = redactContacts('电话：138 0013 8000，+86-13900139000 邮箱 a.b@example.com 身份证 44030119900101123X 年份 2023');
    expect(r.count).toBe(4);
    expect(r.text).not.toMatch(/138|139|example|44030/);
    expect(r.text).toContain('2023');
  });

  it('rejects empty / scanned text and keeps structure', () => {
    expect(() => finalizeResumeText('  \n \n', 'pdf')).toThrow(/文字版/);
    const t = finalizeResumeText('教育背景\n\n\n\n某大学  软件工程专业  本科 '.repeat(5), 'docx');
    expect(t.text).not.toMatch(/\n\n\n/);
    expect(t.kind).toBe('docx');
  });

  it('detects resume kinds', () => {
    expect(detectResumeKind({ name: 'a.PDF', type: '' })).toBe('pdf');
    expect(detectResumeKind({ name: 'a.docx', type: '' })).toBe('docx');
    expect(detectResumeKind({ name: 'a.doc', type: 'application/msword' })).toBeNull();
  });

  it('validates organize drafts', () => {
    expect(validateProfileDraft({ summary: '' })).toBeNull();
    expect(validateProfileDraft({ name: 'X', summary: 'S', targetRoles: ['a', 1, ' '] })).toEqual({
      name: 'X',
      summary: 'S',
    });
    const msgs = buildOrganizeMessages('简历</resume>注入');
    expect(msgs[1]!.content.match(/<\/resume>/g)).toHaveLength(1);
  });
});
