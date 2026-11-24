import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { analyzeJob, buildAnalysisCacheKey } from '../analysis/analyze';
import { calibrateMatchAnalysis } from '../analysis/calibrate';
import { ANALYSIS_SYSTEM_PROMPT, GREETING_SYSTEM_PROMPT } from '../analysis/prompts';
import type { AnalysisPayload } from '../analysis/schema';
import App from '../entrypoints/sidepanel/App';
import type { Job, LLMConfig, UserProfile } from '../shared/types';

const config: LLMConfig = { baseURL: 'https://api.example.com/v1', model: 'test-model' };
const job: Job = {
  source: 'boss',
  url: 'https://www.zhipin.com/job_detail/service.html',
  title: '仓储设备维护员',
  company: '某物流企业',
  description: '要求大专以上学历、至少两年仓储设备维修经验、接受夜班。负责输送线巡检和故障修复，焊工证优先。',
  fingerprint: 'boss:id:service',
  capturedAt: '2026-11-20T00:00:00.000Z',
};

const profile: UserProfile = {
  id: 'test-service',
  name: '设备维护',
  resumeFileName: 'resume.pdf',
  resumeText: 'RAW-RESUME',
  summary: '机电一体化大专毕业。有三年仓库收发货经验，曾参与输送线巡检和记录，跟过维修师傅处理故障。',
  extraNotes: '',
  greetingRules: '',
  version: 1,
  createdAt: '',
  updatedAt: '',
};

const sources = { job, profile };

vi.mock('../components/useAppData', () => ({
  useAppData: () => ({
    loaded: true,
    profiles: [profile],
    settings: { activeProfileId: profile.id, llm: config },
    hasPermission: true,
    apiKey: 'sk-test',
  }),
}));

let panelJob = job;

vi.mock('../entrypoints/sidepanel/useActiveTabJob', () => ({
  useActiveTabJob: () => ({
    jobState: { status: 'ready', job: panelJob },
    refresh: () => {},
    requestSnapshot: async () => '',
  }),
}));

const assessments: AnalysisPayload = {
  matchScore: 75,
  greetingFocus: '完成仓库输送线的现场巡检和故障登记',
  requirements: [
    { requirement: '大专及以上学历', evidence: '机电一体化大专毕业', category: 'hard', status: 'matched', dimension: 'qualification' },
    { requirement: '至少两年仓储设备维修经验', evidence: '档案说明三年仓库收发货经验，设备维修年限未体现', category: 'hard', status: 'not_shown', dimension: 'qualification' },
    { requirement: '接受夜班', evidence: '档案未说明是否接受夜班', category: 'hard', status: 'not_shown', dimension: 'preference' },
    { requirement: '输送线巡检', evidence: '参与输送线巡检和记录', category: 'focus', status: 'matched', dimension: 'capability' },
    { requirement: '独立修复设备故障', evidence: '跟随维修师傅处理故障，独立维修的证据未体现', category: 'core', status: 'partial', dimension: 'capability' },
    { requirement: '持有焊工证', evidence: '档案未提及证书情况', category: 'bonus', status: 'not_shown', dimension: 'qualification' },
  ],
  greetingSelections: [4, 5, 2],
};

describe('calibrateMatchAnalysis', () => {
  it('retains each screening condition and keeps unrelated experience out of the tenure judgment', () => {
    const result = calibrateMatchAnalysis(assessments, false, sources);
    expect(result.matchScore).toBe(75);
    expect(result.recommendation).toBe('consider');
    expect(result.hardRequirements).toEqual(assessments.requirements.slice(0, 3));
    expect(result.strengths).toEqual([assessments.requirements[3]]);
    expect(result.gaps).toEqual([assessments.requirements[4]]);
    expect(result.summary).toContain('输送线巡检');
    expect(result.decisionFactors).toEqual([
      assessments.requirements[1], assessments.requirements[2], assessments.requirements[4],
    ]);
    expect(result.greetingPoints).toEqual([
      assessments.requirements[3]!.evidence,
      assessments.requirements[4]!.evidence,
    ]);
  });

  it('distinguishes pending, conflicting, and met screening conditions at the same capability score', () => {
    const makeResult = (status: 'not_shown' | 'confirmed_lacking' | 'matched', evidence: string) =>
      calibrateMatchAnalysis({
        matchScore: 69,
        recommendation: 'recommended',
        requirements: [
          assessments.requirements[3]!,
          {
            ...assessments.requirements[2]!, status, evidence,
            ...(status === 'confirmed_lacking' ? { conflict: { jobQuote: '接受夜班', profileQuote: evidence } } : {}),
          },
        ],
        greetingSelections: [1],
      }, false, { job, profile: { ...profile, extraNotes: evidence } });

    const pending = makeResult('not_shown', '未说明夜班意愿');
    const conflicting = makeResult('confirmed_lacking', '明确不接受夜班');
    const matched = makeResult('matched', '明确接受夜班');
    expect([pending, conflicting, matched].map((item) => item.matchScore)).toEqual([69, 69, 69]);
    expect([pending, conflicting, matched].map((item) => item.recommendation)).toEqual([
      'consider', 'not_recommended', 'recommended',
    ]);
    expect(pending.decisionFactors[0]).toMatchObject({ requirement: '接受夜班', status: 'not_shown' });
    expect(conflicting.decisionFactors[0]).toMatchObject({ requirement: '接受夜班', status: 'confirmed_lacking' });
    expect(matched.decisionFactors).toEqual([]);
  });

  it.each([
    ['2025年9月起参与仓储设备维修', 'not_shown'],
    ['累计只有1年全职仓储设备维修经验', 'not_shown'],
    ['累计只有3年仓储设备维修经验', 'not_shown'],
    ['累计只有18个月仓储设备维修经验', 'confirmed_lacking'],
    ['不足两年仓储设备维修经验', 'confirmed_lacking'],
  ] as const)('calibrates a minimum tenure against the complete experience scope: %s', (profileQuote, expectedStatus) => {
    const result = calibrateMatchAnalysis({
      requirements: [
        {
          ...assessments.requirements[1]!,
          status: 'confirmed_lacking',
          evidence: '不足两年',
          conflict: { jobQuote: '至少两年仓储设备维修经验', profileQuote },
        },
        assessments.requirements[3]!,
      ],
      greetingSelections: [2],
    }, false, { job, profile: { ...profile, extraNotes: profileQuote } });

    expect(result.decisionFactors[0]?.status).toBe(expectedStatus);
    expect(result.recommendation).toBe(expectedStatus === 'confirmed_lacking' ? 'not_recommended' : 'consider');
    if (expectedStatus === 'not_shown') {
      expect(result.decisionFactors[0]?.evidence).toContain('实际累计年限需要核实');
    }
  });

  it('moves ordinary capability requirements out of screening and verifies claimed conflict against both sources', () => {
    const result = calibrateMatchAnalysis({
      requirements: [
        { ...assessments.requirements[3]!, category: 'hard' },
        {
          ...assessments.requirements[2]!,
          status: 'confirmed_lacking',
          conflict: { jobQuote: '接受夜班', profileQuote: '不接受夜班' },
        },
      ],
      greetingSelections: [],
    }, false, sources);
    expect(result.hardRequirements).toHaveLength(1);
    expect(result.hardRequirements[0]?.status).toBe('not_shown');
    expect(result.strengths[0]?.category).toBe('core');
    expect(result.recommendation).toBe('consider');
  });

  it('does not score a job with only eligibility or optional requirements', () => {
    const result = calibrateMatchAnalysis({
      requirements: [assessments.requirements[0]!, assessments.requirements[5]!],
      greetingSelections: [],
    }, false, sources);
    expect(result.matchScore).toBeNull();
    expect(result.recommendation).toBe('consider');
  });

  it('shows the capability gaps and other items to confirm in the detailed analysis', () => {
    const requirements: AnalysisPayload['requirements'] = [
      ...assessments.requirements,
      { requirement: 'PLC 参数调试', evidence: '档案未提及 PLC', category: 'core', status: 'not_shown', dimension: 'capability' },
      { requirement: '备件库存登记', evidence: '档案未提及备件登记', category: 'general', status: 'not_shown', dimension: 'capability' },
    ];
    const result = calibrateMatchAnalysis({ requirements, greetingSelections: [] }, false, sources);
    expect(result.gaps.map((item) => item.requirement)).toEqual(['独立修复设备故障', 'PLC 参数调试']);
    expect(result.toConfirm.map((item) => item.requirement)).toEqual(['备件库存登记']);
  });

  it('keeps related technical skills as partial and avoids counting repeated requirements twice', () => {
    const requirements: AnalysisPayload['requirements'] = [
      { requirement: '应用打包与部署', evidence: '负责过 Docker 镜像构建和发布', category: 'focus', status: 'matched', dimension: 'capability' },
      { requirement: 'Kubernetes 集群运维', evidence: '有 Docker 容器发布实践，Kubernetes 集群运维未体现', category: 'core', status: 'partial', dimension: 'capability' },
      { requirement: 'Kubernetes 集群运维', evidence: '有 Docker 容器发布实践，Kubernetes 集群运维未体现', category: 'core', status: 'partial', dimension: 'capability' },
      { requirement: '生产值班期间独立处理告警', evidence: '只在演习中参与告警处理', category: 'focus', status: 'partial', dimension: 'capability' },
    ];
    const result = calibrateMatchAnalysis({ requirements, greetingSelections: [2, 3, 1] }, false, sources);
    expect(result.capabilityEvidence).toMatchObject({ matched: 1, partial: 2 });
    expect(result.gaps).toEqual([requirements[1], requirements[3]]);
    expect(result.greetingPoints).toEqual([requirements[1]!.evidence, requirements[0]!.evidence]);
  });

  it('uses the model score independently of capability evidence counts', () => {
    const statuses = [
      'matched', 'transferable', 'transferable', 'transferable', 'partial', 'partial', 'partial', 'not_shown', 'not_shown',
    ] as const;
    const requirements: AnalysisPayload['requirements'] = statuses.map((status, index) => ({
      ...assessments.requirements[3]!, requirement: `不同的职责 ${index}`, status,
    }));
    const analyze = (matchScore: number, selected = requirements) => calibrateMatchAnalysis({
      matchScore, requirements: selected, greetingSelections: [],
    }, false, sources);

    expect(analyze(84)).toMatchObject({
      matchScore: 84,
      capabilityCoverage: 78,
      recommendation: 'consider',
      capabilityEvidence: { matched: 1, transferable: 3, partial: 3, not_shown: 2, confirmed_lacking: 0 },
    });
    expect(analyze(71)).toMatchObject({ matchScore: 71, capabilityCoverage: 78 });
    expect(analyze(62, [requirements[0]!, ...requirements.slice(-2)])).toMatchObject({
      matchScore: 62, capabilityCoverage: 33, recommendation: 'consider',
    });
    expect(analyze(80, requirements.slice(-2))).toMatchObject({
      matchScore: 80, capabilityCoverage: 0, recommendation: 'consider',
    });
  });

  it('counts an overlapping responsibility and requirement as one capability theme', () => {
    const deployment = { ...assessments.requirements[3]!, capabilityTopic: '输送线巡检' };
    const repair = assessments.requirements[4]!;
    const overlap = {
      ...deployment,
      requirement: '例行检查输送线的运行状态',
      category: 'core' as const,
    };
    const evaluate = (requirements: AnalysisPayload['requirements']) =>
      calibrateMatchAnalysis({ matchScore: 76, requirements, greetingSelections: [] }, false, sources);
    const original = evaluate([deployment, repair]);
    const withOverlap = evaluate([deployment, repair, overlap]);
    expect(withOverlap).toMatchObject({
      matchScore: original.matchScore,
      capabilityCoverage: original.capabilityCoverage,
      capabilityEvidence: original.capabilityEvidence,
    });
    expect(withOverlap.matchScore).toBe(76);
  });

  it('credits proven transferable work without converting a screening uncertainty or a material gap into a match', async () => {
    const role = {
      ...job,
      title: '初级档案系统实施助理',
      description: '接受应届生，需有相关工作经验。参与档案系统部署、用户问题排查和流程协同，协助扫描质检。熟练使用一种同类协作工具。须参加现场轮班。',
    };
    const candidate = {
      ...profile,
      summary: '在制造企业实习时参与内部工单系统部署、排查用户问题，并和业务部门核对流程调整。使用协作工具管理上线问题单。参加过一次纸质档案扫描，未承担质检。',
    };
    const evaluated: AnalysisPayload = {
      matchScore: 82,
      requirements: [
        { requirement: '相关工作经验', evidence: '曾参与企业内部工单系统实施实习', category: 'hard', status: 'matched', dimension: 'qualification' },
        { requirement: '接受现场轮班', evidence: '档案未说明轮班意愿', category: 'hard', status: 'not_shown', dimension: 'preference' },
        { requirement: '参与档案系统部署', evidence: '曾参与内部工单系统部署，需适应档案系统环境', category: 'focus', status: 'transferable', dimension: 'capability' },
        { requirement: '协调业务流程', evidence: '与制造企业业务部门核对过流程调整，需了解档案工作流程', category: 'focus', status: 'transferable', dimension: 'capability' },
        { requirement: '排查用户问题', evidence: '在实习中排查内部系统用户问题', category: 'focus', status: 'matched', dimension: 'capability' },
        { requirement: '使用协作工具处理问题单', evidence: '实际使用协作工具管理上线问题单', category: 'core', status: 'matched', dimension: 'capability' },
        { requirement: '协助扫描和质检', evidence: '参加过纸质档案扫描，未承担质检', category: 'focus', status: 'partial', dimension: 'capability' },
      ],
      greetingSelections: [3, 4],
    };
    const responses = [JSON.stringify(evaluated), '您好，我参与过内部系统部署，也与业务部门核对过流程调整，期待进一步沟通。'];
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: responses.shift() } }] }));

    const result = await analyzeJob({ job: role, profile: candidate, config, apiKey: 'sk-test', examples: [] }, { fetchImpl });
    expect(result.matchScore).toBe(82);
    expect(result.capabilityEvidence).toEqual({ matched: 2, transferable: 2, partial: 1, not_shown: 0, confirmed_lacking: 0 });
    expect(result.recommendation).toBe('consider');
    expect(result.summary).toContain('经验可迁移到「参与档案系统部署」');
    expect(result.gaps).toEqual([evaluated.requirements[6]]);
    expect(result.decisionFactors).toEqual([evaluated.requirements[1], evaluated.requirements[6]]);
    expect(result.greetingPoints).toEqual(evaluated.requirements.slice(2, 4).map((item) => item.evidence));
  });

  it('uses complementary task evidence ahead of generic tools while honoring explicit selection rules', () => {
    const payload: AnalysisPayload = {
      requirements: [
        {
          requirement: '熟悉电子表格',
          evidence: '用电子表格登记备件库存',
          category: 'core', status: 'matched', dimension: 'capability',
        },
        {
          requirement: '排查输送设备故障',
          evidence: '跟随维修师傅处理输送线急停故障，独立维修的证据未体现',
          greetingFact: '跟随维修师傅处理输送线急停故障',
          greetingArea: '设备检修',
          category: 'focus', status: 'partial', dimension: 'capability',
        },
        {
          requirement: '更换故障部件',
          evidence: '协助更换输送带部件',
          greetingFact: '协助更换输送带部件',
          greetingArea: '设备检修',
          category: 'focus', status: 'matched', dimension: 'capability',
        },
        {
          requirement: '协调班组交接',
          evidence: '参与班组交接并记录设备问题，未说明独立负责协调',
          greetingFact: '参与班组交接并记录设备问题',
          greetingArea: '班组协作',
          category: 'focus', status: 'partial', dimension: 'capability',
        },
        {
          requirement: '制定维保计划',
          evidence: '未明确做过维保规划',
          greetingFact: '独立制定维保计划',
          greetingArea: '维保计划',
          category: 'focus', status: 'not_shown', dimension: 'capability',
        },
      ],
      greetingSelections: [1, 2],
    };
    const normal = calibrateMatchAnalysis(payload, false, sources);
    expect(normal.greetingPoints).toEqual(['跟随维修师傅处理输送线急停故障', '参与班组交接并记录设备问题']);

    const custom = calibrateMatchAnalysis(payload, false, sources, { prioritizeTasks: false });
    expect(custom.greetingPoints).toEqual(['用电子表格登记备件库存', '跟随维修师傅处理输送线急停故障']);
    expect(custom).toEqual({ ...normal, greetingPoints: custom.greetingPoints });
  });

  it('only carries a confirmed lack into writing if enabled and keeps the scoring independent of that preference', () => {
    const payload: AnalysisPayload = {
      matchScore: 0,
      recommendation: 'not_recommended',
      requirements: [
        {
          ...assessments.requirements[4]!, status: 'confirmed_lacking', evidence: '从未负责设备维修',
          conflict: { jobQuote: '负责输送线巡检和故障修复', profileQuote: '从未负责设备维修' },
        },
      ],
      greetingSelections: [1],
    };
    const supplied = { job, profile: { ...profile, extraNotes: '从未负责设备维修' } };
    const normal = calibrateMatchAnalysis(payload, false, supplied);
    const withGap = calibrateMatchAnalysis(payload, true, supplied);
    expect(normal).toMatchObject({ greetingPoints: [], recommendation: 'not_recommended', matchScore: 0 });
    expect(withGap).toEqual({ ...normal, greetingPoints: [payload.requirements[0]!.evidence] });
  });
});

it('carries ordered evidence and screening conditions through the two-stage flow', async () => {
  const requests: { messages: { content: string }[] }[] = [];
  const facts = {
    ...assessments,
    requirements: assessments.requirements.map((item, i) => i === 4
      ? { ...item, greetingFact: '跟随维修师傅处理故障' }
      : item),
  };
  const fetchImpl: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(init?.body as string));
    const content = requests.length === 1
      ? JSON.stringify(facts)
      : '您好，我参与过输送线巡检和记录，也协助过设备故障处理，希望进一步了解贵司的仓储设备维护岗位。';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };
  const result = await analyzeJob(
    { job, profile, examples: [], config, apiKey: 'sk-test' },
    { fetchImpl },
  );
  expect(result.hardRequirements).toEqual(assessments.requirements.slice(0, 3));
  expect(requests).toHaveLength(2);
  expect(requests[0]!.messages[0]!.content).toBe(ANALYSIS_SYSTEM_PROMPT);
  expect(ANALYSIS_SYSTEM_PROMPT).toContain('每条只判断一件事');
  expect(ANALYSIS_SYSTEM_PROMPT).toContain('另一类主要任务的互补经历');
  expect(requests[1]!.messages[0]!.content).toBe(GREETING_SYSTEM_PROMPT);
  expect(GREETING_SYSTEM_PROMPT).toContain('一到两个互补的能力亮点');
  const writing = requests[1]!.messages[1]!.content;
  expect(writing).toContain(`1. ${assessments.requirements[3]!.evidence}\n2. 跟随维修师傅处理故障`);
  expect(writing).not.toContain(assessments.requirements[4]!.evidence);
  expect(writing).not.toContain(assessments.requirements[1]!.evidence);
  expect(writing).not.toContain(profile.resumeText);

  const evidenceKey = buildAnalysisCacheKey({
    jobFingerprint: job.fingerprint, job, profile, config,
    preferences: { maxPoints: 2, allowGapExplanation: false },
  });
  expect(result.analysisCacheKey).toBe(evidenceKey);
});

it('shows the greeting below a short decision overview and keeps all evidence behind a closed disclosure', async () => {
  const storageKey = `greetingExamples:${profile.id}`;
  await browser.storage.local.set({ [storageKey]: [{
    profileId: profile.id,
    jobFingerprint: job.fingerprint,
    jobTitle: job.title,
    company: job.company,
    jobExcerpt: job.description,
    points: [],
    greeting: '您好，我有设备巡检相关经历，也参与过现场问题记录。期待进一步沟通。',
    createdAt: '2026-11-20T00:00:00.000Z',
  }] });
  const fetchImpl = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(assessments) } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '您好，我参与过输送线巡检，希望进一步沟通。' } }] })));
  vi.stubGlobal('fetch', fetchImpl);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(App)));
    const analyze = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('生成打招呼语'));
    expect(analyze).toBeDefined();
    await act(async () => analyze!.click());

    const overview = container.querySelector('[aria-label="投递前优先核对"]');
    expect(overview?.querySelectorAll('li')).toHaveLength(3);
    expect(overview?.textContent).toContain('高影响待确认');
    const details = container.querySelector<HTMLDetailsElement>('details.match-details');
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('机电一体化大专毕业');
    expect(container.textContent).toContain('证据覆盖率 100%');
    expect(details?.textContent).toContain('能力主题 · 证据充分 1 项 · 部分匹配 1 项');
    const greeting = container.querySelector('textarea');
    expect(greeting?.value).toContain('输送线巡检');
    expect(greeting!.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const basis = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === '依据');
    await act(async () => basis!.click());
    expect(container.textContent).toContain(`主要样例 · ${job.title} · ${job.company}`);

    details?.querySelector('summary')?.click();
    expect(details?.open).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    await browser.storage.local.remove(storageKey);
    vi.unstubAllGlobals();
  }
});

it('keeps the refine field editable during composition, sends its text only to one rewrite and then clears it', async () => {
  const original = '您好，我参与过输送线巡检，希望进一步沟通。';
  const revised = '您好，我参与过输送线巡检和记录，期待进一步沟通。';
  const replies = [JSON.stringify(assessments), original, revised, JSON.stringify(assessments), revised];
  const requests: { response_format?: unknown; messages: { content: string }[] }[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    requests.push(JSON.parse(init?.body as string));
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }));
  });
  vi.stubGlobal('fetch', fetchImpl);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
  try {
    await act(async () => root.render(createElement(App)));
    await act(async () => button('生成打招呼语').click());
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="单次生成补充要求"]')!;
    await act(async () => button('依据').click());
    expect(container.textContent).toContain(`沟通重点 · ${assessments.greetingFocus}`);
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    input.focus();

    const rule = '优先突出输送线巡检，保留 1 条素材并主动提及差距，不超过 80 字。';
    for (const value of ['w', 'wo', '我', rule]) {
      await act(async () => {
        setInputValue.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(input.value).toBe(value);
      expect(input.disabled).toBe(false);
      expect(document.activeElement).toBe(input);
      expect(button('重写').disabled).toBe(false);
      expect(container.textContent).not.toContain('分析已过期');
    }
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    expect(requests).toHaveLength(2);

    await act(async () => button('重写').click());
    expect(requests).toHaveLength(3);
    expect(requests[2]?.response_format).toBeUndefined();
    expect(requests[2]?.messages.map((message) => message.content).join('\n')).toContain(rule);
    expect(requests[2]?.messages.at(-1)?.content).toContain(`沟通重点：${assessments.greetingFocus}`);
    expect(container.querySelector('textarea')?.value).toBe(revised);
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="单次生成补充要求"]')?.value).toBe('');
    expect(container.textContent).not.toContain('写作设置已更新');

    panelJob = { ...job, description: `${job.description}\n新增要求：会记录日常维护数据。` };
    await act(async () => root.render(createElement(App)));
    const staleInput = container.querySelector<HTMLTextAreaElement>('[aria-label="单次生成补充要求"]')!;
    expect(staleInput.disabled).toBe(false);
    expect(staleInput.value).toBe('');
    expect(button('重写').disabled).toBe(true);
    expect(container.textContent).toContain('分析已过期');

    await act(async () => button('更新分析').click());
    expect(requests).toHaveLength(5);
    expect(requests[3]?.response_format).toBeDefined();
    expect(requests[3]?.messages.map((message) => message.content).join('\n')).not.toContain(rule);
    expect(requests[4]?.messages.map((message) => message.content).join('\n')).not.toContain(rule);
    expect(button('重写').disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    panelJob = job;
    vi.unstubAllGlobals();
  }
});
