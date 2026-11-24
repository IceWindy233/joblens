import { describe, expect, it } from 'vitest';
import { analyzeJob } from '../analysis/analyze';
import { evaluateGenerationCase } from '../analysis/evaluate';
import { checkGreetingDetailed } from '../analysis/greeting';
import { validateAnalysisPayload, type AnalysisPayload } from '../analysis/schema';
import { resolveGreetingConfig } from '../profile/manager';
import type { LLMConfig, UserProfile } from '../shared/types';
import { REGRESSION_JDS, REGRESSION_PROFILES, type JDCategory } from './fixtures/jd-regression-set';

const config: LLMConfig = { baseURL: 'https://api.example.com/v1', model: 'gpt-4o-mini' };

function selectProfileForCategory(category: JDCategory): UserProfile {
  switch (category) {
    case 'ai_fullstack':
      return REGRESSION_PROFILES.fullstackEfficiency;
    case 'security_ai':
      return REGRESSION_PROFILES.securityAi;
    default:
      return REGRESSION_PROFILES.compositeAi;
  }
}

function buildRealisticReplies(category: JDCategory, title: string): [string, string] {
  if (category === 'ai_agent') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: 'Agent 架构与工具调用编排', evidence: '在正式工作中主导设计基于 LangGraph 与 MCP 的多工具 Agent 编排状态机，支持工具重试与异常降级', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '部分细分业务场景经验', evidence: '简历未体现', category: 'bonus', status: 'not_shown', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，看到贵司在推进 Agent 工具编排与工作流稳定性建设，我在正式工作中主导过基于 LangGraph 与 MCP 的多工具编排状态机设计，覆盖任务规划与异常降级，希望能进一步沟通！';
    return [JSON.stringify(payload), greeting];
  }

  if (category === 'rag_kb') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: 'RAG 混合检索与知识库调优', evidence: '负责企业知识库 RAG 混合检索、Rerank 链路搭建及长文档解析与召回调优', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '知识图谱复杂推理场景', evidence: '简历未体现', category: 'general', status: 'not_shown', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，我在正式工作中负责过企业知识库 RAG 混合检索、Rerank 链路与长文档解析调优，能够直接贴合贵司知识问答与召回准确率优化需求，期待沟通！';
    return [JSON.stringify(payload), greeting];
  }

  if (category === 'ai_fullstack') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: 'React / Next.js 全栈与流式交互开发', evidence: '4 年 React / Next.js 与 Node.js 全栈工作台开发经验，支持 SSE 流式交互与可视化配置', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '部分特定框架经验', evidence: '简历未体现', category: 'bonus', status: 'not_shown', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，我有 4 年 TypeScript、React / Next.js 与 Node.js 全栈开发经验，负责过支持 SSE 流式交互的工作台与后端网关建设，期待交流全栈交付细节！';
    return [JSON.stringify(payload), greeting];
  }

  if (category === 'enterprise_fde') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: '跨部门需求梳理与企业 PoC 交付', evidence: '与产品及客户 IT 团队跨部门协作推进 ToB 客户现场 PoC 需求拆解与私有化交付落地', category: 'focus', status: 'matched', dimension: 'capability' },
        { requirement: '特定垂直行业 ERP 经验', evidence: '简历未体现', category: 'general', status: 'not_shown', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，我在过往工作中深度参与过 ToB 客户现场需求拆解、跨部门协作及大模型方案 PoC 私有化交付落地，能够快速响应企业一线集成与上线需求，期待沟通！';
    return [JSON.stringify(payload), greeting];
  }

  if (category === 'ai_efficiency') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: '自动化评测与 CI/CD 研发效能基建', evidence: '主导搭建 AI 回归评测流水线与 CI/CD 自动化测试门禁，推动工程化交付稳定性提升', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '大规模多区域模型网关运维', evidence: '简历未体现', category: 'bonus', status: 'not_shown', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，我主导建设过 AI 回归评测流水线与 CI/CD 自动化测试门禁体系，比较契合贵司在研发效能、评测与工程化基建方面的关注点，希望能进一步交流！';
    return [JSON.stringify(payload), greeting];
  }

  if (category === 'security_ai') {
    const payload: AnalysisPayload = {
      requirements: [
        { requirement: '大模型安全与 DevSecOps 实践', evidence: '搭建内部大模型应用提示词注入防护护栏与红蓝对抗测试，并主导 DevSecOps 数据脱敏审计', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '底层模型训练与算子安全', evidence: '已确认不具备（仅覆盖应用与模型安全护栏层）', category: 'bonus', status: 'confirmed_lacking', dimension: 'capability' },
      ],
      greetingSelections: [1],
    };
    const greeting =
      '您好，我在安全工程部负责过内部大模型提示词注入防护护栏与红蓝对抗评测，并主导落地过 DevSecOps 安全审计与敏感信息脱敏规范，期待与您沟通！';
    return [JSON.stringify(payload), greeting];
  }

  // partial_or_mismatch
  const isPartialJava = title.includes('Java');
  const payload: AnalysisPayload = {
    requirements: [
      {
        requirement: isPartialJava ? '5 年以上 Java 后端经验' : `${title}所需专业资质`,
        evidence: '简历未体现',
        category: 'hard',
        status: 'not_shown',
        dimension: 'qualification',
      },
    ],
    greetingSelections: isPartialJava ? [2] : [],
  };
  if (isPartialJava) {
    payload.requirements.push({
      requirement: '高并发交易服务开发',
      evidence: '具备后端工程化、自动化回归与系统集成经验，档案未体现高并发交易场景',
      category: 'focus',
      status: 'partial',
      dimension: 'capability',
    });
  }
  const greeting = isPartialJava
    ? '您好，我具备后端服务工程化与自动化测试落地经验，了解到贵司该岗位侧重 Java 高并发交易与后端稳定性，希望能进一步了解团队具体需求。'
    : `您好，我对贵司${title}岗位感兴趣，希望有机会进一步了解岗位要求。`;
  return [JSON.stringify(payload), greeting];
}

describe('18-JD regression suite with simulated model replies', () => {
  it('evaluates all 18 regression JDs across 7 categories with zero factual, rule, redundancy, or isolation failures', async () => {
    expect(REGRESSION_JDS).toHaveLength(18);

    const compositeSelectedPointsByCategory = new Map<JDCategory, string[]>();

    for (const item of REGRESSION_JDS) {
      const profile = selectProfileForCategory(item.category);
      const effective = resolveGreetingConfig({ profile });
      const [stageAReply, stageBReply] = buildRealisticReplies(item.category, item.job.title);

      const requests: { messages: { role: string; content: string }[] }[] = [];
      const fetchImpl: typeof fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        requests.push(body);
        const reply = requests.length === 1 ? stageAReply : stageBReply;
        return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }));
      };

      const result = await analyzeJob(
        { job: item.job, profile, examples: [], config, apiKey: 'sk-reg' },
        { fetchImpl },
      );

      expect(requests).toHaveLength(2);
      const stageAPromptText = requests[0]!.messages.map((m) => m.content).join('\n');
      const stageBPromptText = requests[1]!.messages.map((m) => m.content).join('\n');

      // 阶段 B 不包含原始简历也不包含未选中的其他档案字段（如 extraNotes）
      const report = evaluateGenerationCase({
        job: item.job,
        profile,
        effective,
        result,
        stageAPromptText,
        stageBPromptText,
        criteria: {
          expectedFocusKeywords: item.category === 'partial_or_mismatch' ? undefined : item.focusKeywords,
          forbiddenPromptStrings: [profile.resumeText],
          forbiddenStageBStrings: profile.extraNotes ? [profile.extraNotes] : [],
        },
      });

      expect(report.details, `JD ${item.job.title} failed: ${report.details.join(' | ')}`).toEqual([]);
      expect(report.passed).toBe(true);

      if (profile.id === REGRESSION_PROFILES.compositeAi.id && item.category !== 'partial_or_mismatch') {
        compositeSelectedPointsByCategory.set(item.category, result.greetingPoints);
      }
    }

    // 同一复合型候选人面对不同 JD 方向应产出明显不同的素材重点，而不是反复套用同一段话
    const agentPts = compositeSelectedPointsByCategory.get('ai_agent')?.join(' ') ?? '';
    const ragPts = compositeSelectedPointsByCategory.get('rag_kb')?.join(' ') ?? '';
    const fdePts = compositeSelectedPointsByCategory.get('enterprise_fde')?.join(' ') ?? '';
    const effPts = compositeSelectedPointsByCategory.get('ai_efficiency')?.join(' ') ?? '';

    expect(agentPts).toContain('LangGraph');
    expect(ragPts).toContain('RAG');
    expect(fdePts).toContain('PoC');
    expect(effPts).toContain('CI/CD');
    expect(new Set([agentPts, ragPts, fdePts, effPts]).size).toBe(4);
  });

  it('catches unverified Chinese year claims and extraNotes boundary violations in deterministic fact checking', () => {
    const profile = REGRESSION_PROFILES.compositeAi;
    const issues = checkGreetingDetailed(
      '您好，我有五年核心架构经验，并且有扎实的 Go 实战落地经历。',
      '主导 LangGraph Agent 编排\nAI Agent 开发',
      { extraNotes: profile.extraNotes },
    );

    const factMessages = issues.filter((i) => i.kind === 'fact').map((i) => i.message);
    expect(factMessages.some((m) => m.includes('五年'))).toBe(true);
    expect(factMessages.some((m) => m.includes('Go'))).toBe(true);
  });

  it('preserves MatchPoint category and status distinguishing hard gaps, bonus gaps, not_shown, and confirmed_lacking', () => {
    const validated = validateAnalysisPayload({
      requirements: [
        { requirement: 'React 开发', evidence: '独立开发 React 扩展', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '5 年生产经验', evidence: '简历未体现', category: 'hard', status: 'not_shown', dimension: 'qualification' },
        { requirement: 'Go 微服务生产开发', evidence: '档案注明 Go 仅自学', category: 'bonus', status: 'confirmed_lacking', dimension: 'capability' },
      ],
      greetingSelections: [1],
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.requirements[1]).toMatchObject({ category: 'hard', status: 'not_shown' });
      expect(validated.value.requirements[2]).toMatchObject({ category: 'bonus', status: 'confirmed_lacking' });
    }
  });
});
