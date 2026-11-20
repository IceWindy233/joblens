import { describe, expect, it } from 'vitest';
import {
  analyzeJob,
  analyzeJobMatch,
  buildAnalysisCacheKey,
  buildGreetingCacheKey,
  computeJobContentHash,
  generateGreetingOnly,
} from '../analysis/analyze';
import { checkGreetingDetailed } from '../analysis/greeting';
import { selectGreetingExamples } from '../analysis/greeting-examples';
import { GREETING_SYSTEM_PROMPT, buildAnalysisMessages, buildGreetingMessages } from '../analysis/prompts';
import { validateAnalysisPayload } from '../analysis/schema';
import {
  DEFAULT_GREETING_PREFERENCES,
  GREETING_PRESETS,
  createProfile,
  diffGreetingPreferences,
  exportGreetingRulesConfig,
  importGreetingRulesConfig,
  migrateGreetingExample,
  migrateProfile,
  migrateSettings,
  resolveGreetingConfig,
  updateProfile,
} from '../profile/manager';
import { validateProfileDraft } from '../profile/organize';
import type { AppSettings, GreetingExample, Job, LLMConfig, UserProfile } from '../shared/types';
import { REGRESSION_JDS, REGRESSION_PROFILES } from './fixtures/jd-regression-set';

const llmConfig: LLMConfig = { baseURL: 'https://api.example.com/v1', model: 'gpt-4o-mini' };

const baseJob: Job = REGRESSION_JDS[0]!.job;

function mockReplies(...replies: string[]) {
  const requests: { messages: { role: string; content: string }[]; model: string }[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init?.body as string);
    requests.push(body);
    const content = replies.shift();
    if (content === undefined) throw new Error('Unexpected LLM call');
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };
  return { requests, fetchImpl };
}

describe('core system prompt decoupling & rule configurability', () => {
  it('removes subjective length/single-paragraph/no-gap mandates from built-in GREETING_SYSTEM_PROMPT', () => {
    expect(GREETING_SYSTEM_PROMPT).not.toContain('80–140 字');
    expect(GREETING_SYSTEM_PROMPT).not.toContain('禁止分点');
    expect(GREETING_SYSTEM_PROMPT).not.toContain('选择最相关的 2–4 个匹配点');
    expect(GREETING_SYSTEM_PROMPT).not.toContain('不主动解释没有的技能');
  });

  it('works cleanly when user configures zero writing rules or preferences', async () => {
    const emptyRulesProfile: UserProfile = {
      ...REGRESSION_PROFILES.securityAi,
      greetingRules: '',
      greetingPreferences: undefined,
    };
    const effective = resolveGreetingConfig({ profile: emptyRulesProfile });
    expect(effective.combinedRulesText).toBe('');
    expect(effective.preferences).toEqual(DEFAULT_GREETING_PREFERENCES);

    const payload = {
      matchScore: 84,
      recommendation: 'recommended',
      summary: '安全与 AI 安全高度匹配',
      strengths: [{ requirement: '提示词注入防护', evidence: '搭建内部大模型提示词注入防护护栏', category: 'core', status: 'matched' }],
      gaps: [{ requirement: '驻场出差', evidence: '简历未体现', category: 'general', status: 'not_shown' }],
      greetingPoints: ['搭建内部大模型应用提示词注入防护护栏与输出审计规范'],
    };
    const greeting = '您好，我在安全工程部负责过大模型提示词注入防护护栏与输出审计建设，希望能沟通该岗位。';
    const { requests, fetchImpl } = mockReplies(JSON.stringify(payload), greeting);

    const result = await analyzeJob(
      { job: REGRESSION_JDS[13]!.job, profile: emptyRulesProfile, examples: [], config: llmConfig, apiKey: 'sk-test' },
      { fetchImpl },
    );

    expect(requests).toHaveLength(2);
    expect(result.greeting).toBe(greeting);
    expect(result.greetingIssues).toEqual([]);
  });

  it('enforces tier precedence: temporary > profile > global, and later lines override earlier lines within a tier', () => {
    const settings: AppSettings = {
      activeProfileId: 'p1',
      llm: llmConfig,
      globalGreetingRules: '控制在一句话内，不超过 60 字。\n禁止分点。',
      globalGreetingPreferences: { singleParagraph: true, allowLists: false, maxChars: 60 },
    };

    const profile: UserProfile = {
      ...REGRESSION_PROFILES.compositeAi,
      greetingRules: '允许分段展示。\n先写结论\n允许使用分点列表，控制在 250 字以内。',
      greetingPreferences: { maxPoints: 5 },
    };

    // 档案规则覆盖全局规则
    const profileLevel = resolveGreetingConfig({ settings, profile });
    expect(profileLevel.preferences.singleParagraph).toBe(false);
    expect(profileLevel.preferences.allowLists).toBe(true);
    expect(profileLevel.preferences.maxChars).toBe(250);
    expect(profileLevel.preferences.maxPoints).toBe(5);
    expect(profileLevel.combinedRulesText).toMatch(/\[全局默认规则\][\s\S]*\[当前档案专属规则/);

    // 同层级后配置覆盖先配置
    const sameTierOverride = resolveGreetingConfig({
      profile: {
        ...profile,
        greetingRules: '不超过 300 字，允许分段。\n改为主打简短：一段话，不超过 80 字，禁止分点。',
        greetingPreferences: undefined,
      },
    });
    expect(sameTierOverride.preferences.singleParagraph).toBe(true);
    expect(sameTierOverride.preferences.allowLists).toBe(false);
    expect(sameTierOverride.preferences.maxChars).toBe(80);

    // 单次补充要求覆盖档案规则与全局规则
    const tempLevel = resolveGreetingConfig({
      settings,
      profile,
      temporaryRule: '本次改为一段话，禁止分点，不超过 90 字，且主动提及能力差距。',
    });
    expect(tempLevel.preferences.singleParagraph).toBe(true);
    expect(tempLevel.preferences.allowLists).toBe(false);
    expect(tempLevel.preferences.maxChars).toBe(90);
    expect(tempLevel.preferences.allowGapExplanation).toBe(true);
  });

  it('respects configurable validation: allows multi-paragraph, lists, long technical intros, ultra-short texts, and gap explanations', () => {
    // 1. 详细技术介绍 + 允许分段（220 字不触发超长）
    const techConfig = resolveGreetingConfig({
      profile: {
        ...REGRESSION_PROFILES.compositeAi,
        greetingRules: GREETING_PRESETS.technical.rules,
        greetingPreferences: GREETING_PRESETS.technical.preferences,
      },
    });
    const longMultiPara =
      '您好，我在正式工作中主导设计过基于 LangGraph 与 MCP 的多工具 Agent 编排状态机，支持多轮工具调用失败降级与异常恢复，目前已在内部 3 条业务线稳定运行。\n\n同时我也负责过企业知识库 RAG 混合检索与 Rerank 链路优化，以及 AI 回归评测流水线建设，期待有机会深入交流技术细节！';
    expect(
      checkGreetingDetailed(longMultiPara, 'LangGraph MCP 3', {
        preferences: techConfig.preferences,
      }),
    ).toEqual([]);

    // 2. 允许分点列表，不应报“使用了分点或标题”或“存在换行”
    const listConfig = resolveGreetingConfig({
      profile: {
        ...REGRESSION_PROFILES.compositeAi,
        greetingRules: '请用 1/2/3 分点列表展示匹配度，字数不超过 260 字。',
        greetingPreferences: undefined,
      },
    });
    const bulletGreeting =
      '您好，针对 AI Agent 开发工程师岗位，我的匹配点如下：\n1. 主导基于 LangGraph 与 MCP 的工具编排状态机设计；\n2. 负责过企业 RAG 检索链路与回归评测建设。';
    expect(
      checkGreetingDetailed(bulletGreeting, 'LangGraph MCP AI Agent 开发工程师', {
        preferences: listConfig.preferences,
      }),
    ).toEqual([]);

    // 3. 极简一两句话模式（50 字以内）
    const shortConfig = resolveGreetingConfig({
      profile: {
        ...REGRESSION_PROFILES.compositeAi,
        greetingRules: '非常简短，控制在 50 字以内。',
        greetingPreferences: undefined,
      },
    });
    expect(
      checkGreetingDetailed('您好，我主导过 LangGraph 与 MCP Agent 编排项目，期待沟通！', 'LangGraph MCP', {
        preferences: shortConfig.preferences,
      }),
    ).toEqual([]);
    const tooLongForShort =
      '您好，我主导过基于 LangGraph 与 MCP 的多工具 Agent 编排系统设计，还负责过企业知识库 RAG 检索增强与评测流水线搭建，希望可以深入沟通！';
    expect(
      checkGreetingDetailed(tooLongForShort, 'LangGraph MCP', {
        preferences: shortConfig.preferences,
      })[0]?.kind,
    ).toBe('style');

    // 4. 不限字数模式
    const unlimitedConfig = resolveGreetingConfig({
      profile: {
        ...REGRESSION_PROFILES.compositeAi,
        greetingRules: '详细展开项目细节，不限字数，允许分段。',
        greetingPreferences: undefined,
      },
    });
    expect(unlimitedConfig.preferences.maxChars).toBeNull();
    expect(
      checkGreetingDetailed(longMultiPara + '\n' + longMultiPara, 'LangGraph MCP 3', {
        preferences: unlimitedConfig.preferences,
      }),
    ).toEqual([]);
  });

  it('allows configurable greetingPoints limit in schema validation', () => {
    const payloadWith6 = {
      matchScore: 85,
      recommendation: 'recommended',
      summary: '匹配度较高',
      strengths: [{ requirement: 'Agent', evidence: 'LangGraph' }],
      gaps: [{ requirement: '无', evidence: '无明显短板' }],
      greetingPoints: ['点1', '点2', '点3', '点4', '点5', '点6'],
    };
    // 默认上限仍为 4
    expect(validateAnalysisPayload(payloadWith6).ok).toBe(false);
    // 配置上限为 6 时可通过
    const allowed = validateAnalysisPayload(payloadWith6, { maxGreetingPoints: 6 });
    expect(allowed.ok && allowed.value.greetingPoints).toHaveLength(6);
  });

  it('handles gap explanation directive in Stage A & Stage B prompts', () => {
    const profile = {
      ...REGRESSION_PROFILES.juniorCareerChanger,
      greetingRules: '主动提及能力不足并说明正在学习改进的计划。',
      greetingPreferences: undefined,
    };
    const effective = resolveGreetingConfig({ profile });
    expect(effective.preferences.allowGapExplanation).toBe(true);

    const stageA = buildAnalysisMessages(baseJob, profile, { effectiveConfig: effective });
    expect(stageA[1]!.content).toContain('允许在素材中包含基于事实的能力差距说明');

    const stageB = buildGreetingMessages(
      baseJob,
      ['独立开发本地 PDF 文档 RAG 问答原型（开发中，仅本地测试）'],
      effective.combinedRulesText,
      [],
      effective.preferences,
    );
    expect(stageB[1]!.content).toContain('允许结合真实事实坦诚说明能力差距');
  });

  it('supports JSON export and import of rules and preferences', () => {
    const json = exportGreetingRulesConfig('保留固定结尾：祝工作顺利！', {
      preset: 'custom',
      maxPoints: 6,
      allowLists: true,
      singleParagraph: false,
      maxChars: 240,
    });
    const parsed = importGreetingRulesConfig(json);
    expect(parsed).toEqual({
      rules: '保留固定结尾：祝工作顺利！',
      preferences: {
        preset: 'custom',
        maxPoints: 6,
        allowLists: true,
        singleParagraph: false,
        maxChars: 240,
      },
    });
    expect(importGreetingRulesConfig('not json')).toBeNull();
  });
});

describe('structured facts, migration, example selection, and two-stage caching', () => {
  it('organizes and validates structured facts while remaining backward compatible', () => {
    const draft = validateProfileDraft({
      name: 'Agent 方向',
      summary: '客观事实摘要',
      targetRoles: ['AI Agent 开发'],
      preferredLocations: ['上海'],
      facts: [
        {
          fact: '搭建 LangGraph 工具编排',
          source: '正式工作',
          experienceType: '正式工作',
          participationLevel: '主导',
          skills: ['LangGraph', 'MCP'],
          outcomes: '上线 3 条业务线',
          constraints: '',
        },
      ],
    });
    expect(draft?.facts).toHaveLength(1);
    expect(draft?.facts?.[0]?.participationLevel).toBe('主导');

    const profile = createProfile({
      name: 'Agent 方向',
      resumeFileName: 'r.pdf',
      resumeText: 'RAW-SECRET',
      summary: draft!.summary,
      facts: draft!.facts,
      extraNotes: '',
      targetRoles: draft!.targetRoles,
      preferredLocations: draft!.preferredLocations,
      greetingRules: '我的规则',
    });
    const msgs = buildAnalysisMessages(baseJob, profile);
    expect(msgs[1]!.content).toContain('结构化事实清单');
    expect(msgs[1]!.content).toContain('类型:正式工作 | 参与度:主导');
    expect(msgs[1]!.content).not.toContain('RAW-SECRET');
  });

  it('migrates legacy profiles, settings, and examples losslessly without overwriting user rules', () => {
    const legacyProfile = {
      id: 'legacy-1',
      name: '老档案',
      resumeFileName: 'old.pdf',
      resumeText: '旧简历',
      summary: 'React 2年',
      extraNotes: '',
      targetRoles: ['前端'],
      preferredLocations: [],
      greetingRules: '用户手写的老规则：绝不覆盖我！',
      version: 4,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    } as UserProfile;

    const migrated = migrateProfile(legacyProfile);
    expect(migrated.greetingRules).toBe('用户手写的老规则：绝不覆盖我！');
    expect(migrated.version).toBe(4);
    expect(migrated.summary).toBe('React 2年');

    // 修改非事实字段不丢失老规则，且深度比较 facts 不会无故自增 version
    const withFacts = updateProfile(migrated, {
      facts: [
        {
          fact: 'React 组件开发',
          source: '工作',
          experienceType: '正式工作',
          participationLevel: '负责',
          skills: ['React'],
        },
      ],
    });
    expect(withFacts.version).toBe(5);
    const noOpUpdate = updateProfile(withFacts, {
      facts: [
        {
          fact: 'React 组件开发',
          source: '工作',
          experienceType: '正式工作',
          participationLevel: '负责',
          skills: ['React'],
        },
      ],
    });
    expect(noOpUpdate).toBe(withFacts);

    const legacySettings = migrateSettings({ activeProfileId: 'legacy-1', llm: llmConfig });
    expect(legacySettings.activeProfileId).toBe('legacy-1');
    expect(legacySettings.llm).toEqual(llmConfig);

    const legacyExample = migrateGreetingExample({
      profileId: 'legacy-1',
      jobFingerprint: 'fp-1',
      jobTitle: '前端开发',
      company: '某公司',
      jobExcerpt: 'React',
      points: ['React'],
      greeting: '您好',
      createdAt: '2026-01-01',
    });
    expect(legacyExample.preferred).toBe(false);
    expect(legacyExample.roleTags).toEqual([]);
  });

  it('selects examples with preferred priority, roleTags, semantic domain filtering, and opt-out switch', () => {
    const profileId = REGRESSION_PROFILES.compositeAi.id;
    const agentJob = REGRESSION_JDS[0]!.job;

    const examples: GreetingExample[] = [
      {
        profileId,
        jobFingerprint: 'ex-sec',
        jobTitle: 'AI 工程师（安全方向）',
        company: '盾卫',
        jobExcerpt: '负责提示注入防护、渗透测试、DevSecOps 与红蓝对抗。',
        points: ['安全'],
        greeting: '安全样例',
        createdAt: '2026-11-10T00:00:00Z',
      },
      {
        profileId,
        jobFingerprint: 'ex-agent-normal',
        jobTitle: 'AI Agent 开发工程师',
        company: '某厂',
        jobExcerpt: '负责 LangGraph、MCP 工具编排与状态机规划。',
        points: ['Agent'],
        greeting: '普通Agent样例',
        createdAt: '2026-11-12T00:00:00Z',
      },
      {
        profileId,
        jobFingerprint: 'ex-agent-preferred',
        jobTitle: '大模型应用研发',
        company: '某厂B',
        jobExcerpt: '工具调用与工作流编排研发。',
        points: ['工作流'],
        greeting: '优先Agent样例',
        preferred: true,
        roleTags: ['AI Agent', 'MCP'],
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        profileId: 'other-profile',
        jobFingerprint: agentJob.fingerprint,
        jobTitle: agentJob.title,
        company: '串用档案',
        jobExcerpt: agentJob.description,
        points: ['他人事实'],
        greeting: '其他档案样例',
        preferred: true,
        createdAt: '2026-11-15T00:00:00Z',
      },
    ];

    // 关闭样例参考时返回空
    expect(selectGreetingExamples(agentJob, profileId, examples, { enabled: false })).toEqual([]);

    // 开启时：优先参考且命中标签的样例排第一；不选其他档案；领域完全无关的“AI安全”不会误选为第一
    const selected = selectGreetingExamples(agentJob, profileId, examples);
    expect(selected[0]?.jobFingerprint).toBe('ex-agent-preferred');
    expect(selected.some((e) => e.profileId === 'other-profile')).toBe(false);
    expect(selected.some((e) => e.jobFingerprint === 'ex-sec')).toBe(false);
  });

  it('separates Stage A and Stage B cache keys and supports greeting-only regeneration', async () => {
    const profileA = { ...REGRESSION_PROFILES.compositeAi, greetingRules: '简短一点' };
    const profileB = { ...REGRESSION_PROFILES.compositeAi, greetingRules: '详细一点，使用固定结尾：祝好' };

    const effA = resolveGreetingConfig({ profile: profileA });
    const effB = resolveGreetingConfig({ profile: profileB });

    // 修改纯写作风格（length/tone）不应让阶段 A 匹配缓存失效
    const cacheA1 = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      profile: profileA,
      config: llmConfig,
      preferences: effA.preferences,
    });
    const cacheA2 = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      profile: profileB,
      config: llmConfig,
      preferences: effB.preferences,
    });
    expect(cacheA1).toBe(cacheA2);

    // 切换模型会让阶段 A 和阶段 B 缓存键同时失效
    const cacheOtherModel = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      profile: profileA,
      config: { ...llmConfig, model: 'deepseek-chat' },
      preferences: effA.preferences,
    });
    expect(cacheOtherModel).not.toBe(cacheA1);

    // 修改写作规则会使阶段 B 缓存键失效
    const gKey1 = buildGreetingCacheKey({
      jobFingerprint: baseJob.fingerprint,
      profileId: profileA.id,
      config: llmConfig,
      points: ['LangGraph MCP'],
      effectiveRules: effA.combinedRulesText,
      preferences: effA.preferences,
      examples: [],
    });
    const gKey2 = buildGreetingCacheKey({
      jobFingerprint: baseJob.fingerprint,
      profileId: profileB.id,
      config: llmConfig,
      points: ['LangGraph MCP'],
      effectiveRules: effB.combinedRulesText,
      preferences: effB.preferences,
      examples: [],
    });
    expect(gKey1).not.toBe(gKey2);

    // 仅调用阶段 B 重新生成时，不会额外发出阶段 A 请求
    const payload = {
      matchScore: 88,
      recommendation: 'recommended',
      summary: '匹配度高',
      strengths: [{ requirement: 'Agent 编排', evidence: 'LangGraph 与 MCP 编排经验' }],
      gaps: [{ requirement: '无', evidence: '无' }],
      greetingPoints: ['主导设计基于 LangGraph 与 MCP 的多工具 Agent 编排状态机'],
    };
    const { requests, fetchImpl } = mockReplies(
      JSON.stringify(payload),
      '您好，我在工作中主导过基于 LangGraph 与 MCP 的多工具 Agent 编排状态机设计，期待沟通！',
    );
    const match = await analyzeJobMatch(
      { job: baseJob, profile: profileA, config: llmConfig, apiKey: 'sk-1' },
      { fetchImpl },
    );
    const regen = await generateGreetingOnly(
      {
        job: baseJob,
        points: match.greetingPoints,
        profile: profileB,
        examples: [],
        config: llmConfig,
        apiKey: 'sk-1',
        temporaryRule: '固定结尾：期待交流！',
      },
      { fetchImpl },
    );
    expect(requests).toHaveLength(2); // 1 次阶段 A + 1 次独立阶段 B
    expect(regen.effectiveRules).toContain('固定结尾：期待交流！');
    expect(regen.greetingCacheKey).not.toBe(gKey1);
  });

  it('prevents default structured prefs from overriding free-text rules and surfaces explicit conflicts', () => {
    const settingsWithDefaults: AppSettings = {
      activeProfileId: null,
      llm: llmConfig,
      globalGreetingRules: '允许分段表达。\n不限字数。',
      globalGreetingPreferences: { singleParagraph: true, maxChars: 160 },
    };

    // 默认冲突策略 'text'：即使全局保存了默认结构化值，文字规则依然生效，同时暴露 conflicts 列表
    const textWins = resolveGreetingConfig({ settings: settingsWithDefaults });
    expect(textWins.preferences.singleParagraph).toBe(false);
    expect(textWins.preferences.maxChars).toBeNull();
    expect(textWins.conflicts).toHaveLength(2);
    expect(textWins.conflicts[0]).toMatchObject({
      layer: 'global',
      field: 'singleParagraph',
      textValue: '允许分段',
      structuredValue: '单段（禁止换行）',
      resolvedValue: '允许分段',
    });

    // 用户显式选择 'structured' 策略时，按结构化参数为准
    const structWins = resolveGreetingConfig({
      settings: {
        ...settingsWithDefaults,
        globalGreetingPreferences: {
          singleParagraph: true,
          maxChars: 160,
          conflictResolution: 'structured',
        },
      },
    });
    expect(structWins.preferences.singleParagraph).toBe(true);
    expect(structWins.preferences.maxChars).toBe(160);

    // diffGreetingPreferences 不会持久化未改动的默认值
    expect(diffGreetingPreferences({ ...DEFAULT_GREETING_PREFERENCES })).toEqual({});
  });

  it('invalidates Stage A cache on selectionRules or same-id JD content changes, but preserves Stage A on pure writing edits', () => {
    const baseProfile: UserProfile = {
      ...REGRESSION_PROFILES.compositeAi,
      selectionRules: '优先突出后端开发经验',
      greetingRules: '固定结尾：“期待交流！”',
    };
    const changedSelection: UserProfile = {
      ...baseProfile,
      selectionRules: '优先突出 Agent 工具编排和评测实践',
    };
    const changedMixedSelection: UserProfile = {
      ...baseProfile,
      selectionRules: undefined,
      greetingRules: '优先突出 Agent 工具编排和评测实践\n固定结尾：“期待交流！”',
    };
    const changedPureWriting: UserProfile = {
      ...baseProfile,
      greetingRules: '固定结尾：“祝工作顺利！”\n不超过 120 字',
    };

    const effBase = resolveGreetingConfig({ profile: baseProfile });
    const effSel = resolveGreetingConfig({ profile: changedSelection });
    const effMixed = resolveGreetingConfig({ profile: changedMixedSelection });
    const effWrite = resolveGreetingConfig({ profile: changedPureWriting });

    const jobHash = computeJobContentHash(baseJob);
    const keyBase = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      jobContentHash: jobHash,
      profile: baseProfile,
      config: llmConfig,
      preferences: effBase.preferences,
      selectionRules: effBase.effectiveSelectionRules,
    });
    const keyPureWrite = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      jobContentHash: jobHash,
      profile: changedPureWriting,
      config: llmConfig,
      preferences: effWrite.preferences,
      selectionRules: effWrite.effectiveSelectionRules,
    });
    const keyChangedSel = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      jobContentHash: jobHash,
      profile: changedSelection,
      config: llmConfig,
      preferences: effSel.preferences,
      selectionRules: effSel.effectiveSelectionRules,
    });
    const keyChangedMixed = buildAnalysisCacheKey({
      jobFingerprint: baseJob.fingerprint,
      jobContentHash: jobHash,
      profile: changedMixedSelection,
      config: llmConfig,
      preferences: effMixed.preferences,
      selectionRules: effMixed.effectiveSelectionRules,
    });

    // 仅改固定结尾与字数：阶段 A 缓存保持命中
    expect(keyPureWrite).toBe(keyBase);
    // 改动选材规则（无论在 selectionRules 还是 greetingRules 中）：阶段 A 缓存立即失效
    expect(keyChangedSel).not.toBe(keyBase);
    expect(keyChangedMixed).not.toBe(keyBase);

    // 同一招聘 ID 但 JD 正文更新时，阶段 A 与阶段 B 缓存均立即失效
    const updatedJob: Job = {
      ...baseJob,
      description: `${baseJob.description}\n新增硬性要求：熟悉 Rust 系统开发。`,
    };
    const updatedHash = computeJobContentHash(updatedJob);
    const keyUpdatedJob = buildAnalysisCacheKey({
      jobFingerprint: updatedJob.fingerprint,
      jobContentHash: updatedHash,
      profile: baseProfile,
      config: llmConfig,
      preferences: effBase.preferences,
      selectionRules: effBase.effectiveSelectionRules,
    });
    expect(updatedJob.fingerprint).toBe(baseJob.fingerprint);
    expect(keyUpdatedJob).not.toBe(keyBase);
  });

  it('prevents JD title numbers like "5年经验" from backing unverified candidate claims while allowing tech tokens like Web3/5G', () => {
    // 职位标题含 “5 年经验” 与 “20-30K”，但候选人匹配事实里没有 5
    const issues = checkGreetingDetailed(
      '您好，我具备 5 年前端开发经验，期待沟通！',
      '负责 React 组件库搭建',
      { jobTitle: '资深前端开发（5年经验 / 20-30K）' },
    );
    expect(issues.some((i) => i.kind === 'fact' && i.message.includes('5'))).toBe(true);

    // 职位标题中的技术标识词（Web3 / 5G）可正常在打招呼语中提及，但不能用来冒充 “3 年经验”
    expect(
      checkGreetingDetailed(
        '您好，我对贵司 Web3 研发岗位很感兴趣，曾负责 React 钱包界面开发。',
        '负责 React 钱包界面开发',
        { jobTitle: 'Web3 前端工程师' },
      ),
    ).toEqual([]);

    const falseClaim = checkGreetingDetailed(
      '您好，我有 3 年 Web3 开发经验。',
      '负责 React 钱包界面开发',
      { jobTitle: 'Web3 前端工程师' },
    );
    expect(falseClaim.some((i) => i.kind === 'fact' && i.message.includes('3'))).toBe(true);
  });
});
