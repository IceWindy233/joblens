import type { Job, UserProfile } from '../../shared/types';

export type JDCategory =
  | 'ai_agent'
  | 'rag_kb'
  | 'ai_fullstack'
  | 'enterprise_fde'
  | 'ai_efficiency'
  | 'security_ai'
  | 'partial_or_mismatch';

export interface RegressionJD {
  category: JDCategory;
  focusKeywords: string[];
  job: Job;
}

const makeJob = (
  id: string,
  title: string,
  company: string,
  description: string,
  location = '上海',
  salary = '25-45K',
): Job => ({
  source: 'boss',
  sourceId: id,
  url: `https://www.zhipin.com/job_detail/${id}.html`,
  title,
  company,
  location,
  salary,
  description,
  fingerprint: `boss:reg:${id}`,
  capturedAt: '2026-11-20T00:00:00.000Z',
});

/** 18 条真实风格 JD 回归样本集，覆盖 7 大类别 */
export const REGRESSION_JDS: RegressionJD[] = [
  // 1. AI Agent 开发（3 条）
  {
    category: 'ai_agent',
    focusKeywords: ['Agent', '编排', '工具调用', 'MCP', 'LangGraph'],
    job: makeJob(
      'agent-1',
      'AI Agent 开发工程师',
      '星图智能',
      '岗位职责：\n1. 负责企业级 AI Agent 核心架构设计与多步骤工具调用编排（Function Calling / MCP）；\n2. 基于 LangGraph / 自研状态机实现长链路任务规划、记忆管理与异常恢复；\n3. 优化 Agent 执行稳定性与端到端延迟。\n任职要求：\n- 本科及以上，2 年以上后端或 LLM 应用开发经验；\n- 熟练掌握 Python 或 TypeScript，有真实 Agent 编排与工具沙箱落地经验。',
    ),
  },
  {
    category: 'ai_agent',
    focusKeywords: ['多智能体', '工作流', '状态机', 'Agent'],
    job: makeJob(
      'agent-2',
      '多智能体平台研发工程师',
      '云智引擎',
      '岗位职责：\n1. 设计 Multi-Agent 协同调度引擎与可视化工作流执行器；\n2. 建设工具注册中心与上下文压缩机制；\n任职要求：\n- 熟悉 LLM Agent 设计模式（ReAct、Plan-and-Execute）；\n- 具备高可用异步任务调度经验。',
    ),
  },
  {
    category: 'ai_agent',
    focusKeywords: ['Agent', '评测', '工具', '记忆'],
    job: makeJob(
      'agent-3',
      '大模型应用工程师（Agent 方向）',
      '智川科技',
      '岗位职责：\n1. 构建面向客服与运营场景的自主决策 Agent；\n2. 设计记忆检索策略与工具调用护栏；\n任职要求：\n- 有实际 Agent 上线经验，熟悉工具失败降级方案；\n- 加分项：熟悉自动化评测集建设。',
    ),
  },

  // 2. RAG / 知识库（3 条）
  {
    category: 'rag_kb',
    focusKeywords: ['RAG', '检索', '知识库', '向量', 'Rerank'],
    job: makeJob(
      'rag-1',
      'RAG 系统与知识库研发工程师',
      '数脉未来',
      '岗位职责：\n1. 负责企业知识库 RAG 检索增强链路优化，包括文档切片、混合检索与 Rerank；\n2. 解决复杂表格/PDF 多模态文档解析与幻觉溯源问题；\n任职要求：\n- 熟练使用 Milvus / Qdrant / Elasticsearch 等检索引擎；\n- 有大规模文档检索召回率与准确率调优经验。',
    ),
  },
  {
    category: 'rag_kb',
    focusKeywords: ['知识图谱', 'RAG', '问答', '召回'],
    job: makeJob(
      'rag-2',
      '企业知识问答算法与应用工程师',
      '知行数据',
      '岗位职责：\n1. 构建 GraphRAG + 向量双路召回问答系统；\n2. 设计引用标注与拒答机制，保障高严谨场景输出可核验；\n任职要求：\n- 深入理解 Embedding 选型与索引调优。',
    ),
  },
  {
    category: 'rag_kb',
    focusKeywords: ['文档解析', 'RAG', '分块', '检索'],
    job: makeJob(
      'rag-3',
      'AI 检索与知识工程开发工程师',
      '文档云',
      '岗位职责：\n1. 负责金融/法务长文档结构化解析、层级分块与语义检索；\n2. 建立 RAG 端到端离线评测基准；\n任职要求：\n- 扎实的 Python 工程能力，有文档解析与检索调优实践。',
    ),
  },

  // 3. AI 全栈开发（2 条）
  {
    category: 'ai_fullstack',
    focusKeywords: ['全栈', 'Next.js', 'React', 'TypeScript', '流式'],
    job: makeJob(
      'fs-1',
      'AI Native 全栈开发工程师',
      '灵动工作台',
      '岗位职责：\n1. 负责 AI 协作产品的端到端开发，包含 React / Next.js 前端交互（SSE 流式渲染、Canvas 画布）与 Python / Node 后端服务；\n2. 设计直观的人机协同编辑与提示词调优界面；\n任职要求：\n- 熟练掌握 TypeScript、React，具备独立全栈交付能力。',
    ),
  },
  {
    category: 'ai_fullstack',
    focusKeywords: ['React', 'Chrome', '扩展', 'TypeScript', '全栈'],
    job: makeJob(
      'fs-2',
      'AI 效率工具全栈工程师',
      '轻舟效率',
      '岗位职责：\n1. 负责浏览器插件与 Web 工作台的架构与交互开发；\n2. 打通本地文档解析、模型流式对话与用户数据本地存储；\n任职要求：\n- 熟悉 React 生态与 Node.js / Python API 集成。',
    ),
  },

  // 4. 企业 AI 落地 / FDE（3 条）
  {
    category: 'enterprise_fde',
    focusKeywords: ['企业', '交付', '需求', '私有化', '跨部门'],
    job: makeJob(
      'fde-1',
      'Forward Deployed Engineer（企业 AI 交付）',
      '智汇企业服务',
      '岗位职责：\n1. 深入大型客户业务一线，梳理业务流程并将大模型/Agent 方案落地至客户生产系统；\n2. 协调产品、算法与客户 IT 团队完成私有化部署、权限对接与 PoC 验收；\n任职要求：\n- 极强的跨部门沟通能力与业务理解力，能快速在客户现场定位并解决问题。',
    ),
  },
  {
    category: 'enterprise_fde',
    focusKeywords: ['解决方案', '业务', 'PoC', '交付'],
    job: makeJob(
      'fde-2',
      'ToB 大模型解决方案与落地工程师',
      '华企云智',
      '岗位职责：\n1. 主导制造/零售行业客户的大模型 PoC 验证与定制交付；\n2. 将客户非结构化业务痛点转化为可落地的工程架构；\n任职要求：\n- 有 ToB 项目交付和跨团队推进经验，能写代码也能做客户技术汇报。',
    ),
  },
  {
    category: 'enterprise_fde',
    focusKeywords: ['客户', '落地', '集成', '交付'],
    job: makeJob(
      'fde-3',
      'AI 行业应用交付工程师',
      '数智协同',
      '岗位职责：\n1. 负责 ERP/OA 系统与 AI 能力的企业级集成；\n2. 编写交付文档并保障客户团队顺利上线使用；\n任职要求：\n- 良好的业务抽象能力与客户沟通能力。',
    ),
  },

  // 5. AI 工程化与研发效能（2 条）
  {
    category: 'ai_efficiency',
    focusKeywords: ['研发效能', '自动化测试', '评测', 'CI/CD'],
    job: makeJob(
      'eff-1',
      'AI 研发效能与自动化评测工程师',
      '快码科技',
      '岗位职责：\n1. 建设大模型与 Agent 回归评测流水线及自动化测试平台；\n2. 推动 Prompt 版本管理、CI/CD 质量门禁与工程效率提升；\n任职要求：\n- 有测试平台或研发效能工具建设经验，熟悉自动化回归体系。',
    ),
  },
  {
    category: 'ai_efficiency',
    focusKeywords: ['LLMOps', '可观测', '工程化', 'CI/CD'],
    job: makeJob(
      'eff-2',
      'LLMOps 平台工程化开发工程师',
      '天工基建',
      '岗位职责：\n1. 负责模型网关、Token 成本追踪、链路可观测性与灰度发布平台；\n2. 优化工程部署脚本与开发者本地调试工具链；\n任职要求：\n- 扎实的后端工程化与 CI/CD 实践经验。',
    ),
  },

  // 6. 网络安全与 AI 安全（2 条）
  {
    category: 'security_ai',
    focusKeywords: ['AI 安全', '提示注入', '红蓝对抗', '安全'],
    job: makeJob(
      'sec-1',
      'AI 安全与大模型红蓝对抗工程师',
      '盾卫安全',
      '岗位职责：\n1. 负责大模型应用的提示词注入防护、越狱检测与输出护栏建设；\n2. 开展内部 Agent 系统的红蓝对抗演练与安全评测；\n任职要求：\n- 熟悉 LLM 安全威胁模型（OWASP Top 10 for LLM）及常见 Web 安全攻防。',
    ),
  },
  {
    category: 'security_ai',
    focusKeywords: ['DevSecOps', '应用安全', '漏洞', '安全'],
    job: makeJob(
      'sec-2',
      '应用安全与 DevSecOps 工程师',
      '安芯科技',
      '岗位职责：\n1. 负责企业 Web 与 AI 服务的安全审计、SAST/DAST 流水线落地；\n2. 梳理数据脱敏、接口鉴权与密钥隔离规范；\n任职要求：\n- 熟悉常见漏洞原理与安全开发生命周期。',
    ),
  },

  // 7. 部分匹配与明显不匹配岗位（3 条）
  {
    category: 'partial_or_mismatch',
    focusKeywords: ['Java', '高并发', '后端', '微服务'],
    job: makeJob(
      'mix-1',
      '资深 Java 电商交易后端工程师（部分匹配）',
      '优购商城',
      '岗位职责：\n1. 负责千万级日活电商订单、支付与库存核心链路重构；\n2. 主导 Spring Cloud 微服务性能调优与分库分表；\n任职要求：\n- 5 年以上 Java 高并发交易系统经验，精通 JVM 调优与分布式事务。',
    ),
  },
  {
    category: 'partial_or_mismatch',
    focusKeywords: ['嵌入式', 'RTOS', 'C语言', '驱动'],
    job: makeJob(
      'mix-2',
      '嵌入式固件开发工程师（RTOS/C）（明显不匹配）',
      '智联硬件',
      '岗位职责：\n1. 负责基于 STM32 与 FreeRTOS 的工业传感器底层驱动与蓝牙协议栈开发；\n任职要求：\n- 精通 C/C++，3 年以上嵌入式单片机与硬件调试经验，熟悉 SPI/I2C/CAN 总线。',
    ),
  },
  {
    category: 'partial_or_mismatch',
    focusKeywords: ['财务', '审计', 'CPA', '税务'],
    job: makeJob(
      'mix-3',
      '资深财务审计经理（完全不匹配）',
      '恒信集团',
      '岗位职责：\n1. 负责集团年度财务报表合并、税务筹划及内控合规审计；\n任职要求：\n- 持有 CPA 证书，6 年以上四大或大型集团审计经验。',
    ),
  },
];

/** 4 份不同背景与偏好的测试档案（覆盖复合型、全栈效能、安全工程、初级转行） */
export const REGRESSION_PROFILES: Record<
  'compositeAi' | 'fullstackEfficiency' | 'securityAi' | 'juniorCareerChanger',
  UserProfile
> = {
  compositeAi: {
    id: 'prof-composite-ai',
    name: '复合型 AI 工程师',
    resumeFileName: 'composite_ai.pdf',
    resumeText: 'RAW-COMPOSITE-SECRET-PHONE-13800001111',
    summary:
      '3 年软件与 AI 应用开发经验。\n工作经历：在某科技公司担任后端与 AI 应用工程师（正式工作，2 年），负责企业知识库 RAG 检索系统设计与跨部门客户 PoC 交付；主导搭建内部自动化回归评测流水线（提升发布质量稳定性）。\n项目经历：主导构建基于 LangGraph 与 MCP 的多工具 Agent 编排引擎（正式工作项目，已上线）；个人开源基于 Next.js + Python 的浏览器 AI 助手扩展。\n技能边界：熟悉 Python、TypeScript、LangGraph、RAG 混合检索、FastAPI；Go 仅自学基础语法，无生产项目经验。',
    facts: [
      {
        id: 'c-1',
        fact: '主导设计基于 LangGraph 与 MCP 的多工具 Agent 编排状态机，支持工具重试与异常降级',
        source: '正式工作-AI平台组',
        experienceType: '正式工作',
        participationLevel: '主导',
        skills: ['Agent', 'LangGraph', 'MCP', '工具调用编排'],
        outcomes: '已上线服务内部 3 条业务线',
      },
      {
        id: 'c-2',
        fact: '负责企业知识库 RAG 混合检索与 Rerank 链路搭建及长文档解析调优',
        source: '正式工作-企业知识库项目',
        experienceType: '正式工作',
        participationLevel: '负责',
        skills: ['RAG', '知识库', '向量检索', 'Rerank', '文档解析'],
      },
      {
        id: 'c-3',
        fact: '与产品、客户 IT 团队跨部门协作推进 ToB 客户现场 PoC 需求梳理与私有化交付',
        source: '正式工作-客户交付',
        experienceType: '正式工作',
        participationLevel: '负责',
        skills: ['企业 AI 落地', 'FDE', '客户沟通', '私有化交付'],
      },
      {
        id: 'c-4',
        fact: '搭建 AI 回归评测流水线与 CI/CD 自动化测试门禁',
        source: '正式工作-工程基建',
        experienceType: '正式工作',
        participationLevel: '主导',
        skills: ['研发效能', '自动化测试', '评测', 'CI/CD'],
      },
      {
        id: 'c-5',
        fact: '独立开发开源浏览器 AI 插件与 Web 协作台（React + TypeScript + FastAPI）',
        source: '个人开源项目',
        experienceType: '个人项目',
        participationLevel: '独立完成',
        skills: ['React', 'TypeScript', '全栈'],
        constraints: '个人开源项目，非企业商业系统',
      },
    ],
    extraNotes: 'Go 仅自学基础语法，无生产项目经验；不考虑纯底层嵌入式岗位',
    greetingRules: '针对当前岗位的核心职责筛选最相关的经历，不硬凑所有项目。',
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },

  fullstackEfficiency: {
    id: 'prof-fullstack-eff',
    name: '全栈与研发效能方向',
    resumeFileName: 'fullstack_eff.pdf',
    resumeText: 'RAW-FS-SECRET-EMAIL-dev@example.com',
    summary:
      '4 年全栈开发与工程效能经验。\n工作经历：在互联网研发效能团队担任高级全栈工程师（正式工作，4 年），负责 React / Next.js 前端工作台、Node.js API 网关及前端自动化测试平台研发，推动 CI/CD 流水线耗时降低 40%。\n技能边界：精通 TypeScript、React、Next.js、Node.js、Vitest；大模型应用开发仅在个人项目做过轻量接入。',
    facts: [
      {
        id: 'f-1',
        fact: '负责 React / Next.js 与 Node.js 全栈研发效能工作台开发，支持 SSE 流式日志与可视化配置',
        source: '正式工作-效能平台',
        experienceType: '正式工作',
        participationLevel: '负责',
        skills: ['React', 'Next.js', 'TypeScript', 'Node.js', '全栈'],
      },
      {
        id: 'f-2',
        fact: '主导前端自动化测试平台与 CI/CD 质量门禁改造，使构建与回归流水线耗时下降 40%',
        source: '正式工作-研发效能',
        experienceType: '正式工作',
        participationLevel: '主导',
        skills: ['研发效能', '自动化测试', 'CI/CD'],
        outcomes: '流水线耗时下降 40%',
      },
    ],
    extraNotes: '大模型模型微调与向量库未在生产环境实战，仅个人测试接入过 OpenAI API',
    greetingRules: '重点写工程架构与全栈交付细节，允许使用技术术语。',
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },

  securityAi: {
    id: 'prof-security-ai',
    name: '安全工程与 AI 安全',
    resumeFileName: 'security_ai.pdf',
    resumeText: 'RAW-SEC-SECRET-ID-110101199501010011',
    summary:
      '3 年应用安全与 AI 安全经验。\n工作经历：负责企业 SaaS 与内部 AI 助手的 DevSecOps 流水线（SAST/DAST）、提示词注入防护护栏及内部 Agent 红蓝对抗测试。\n技能边界：熟悉 OWASP Top 10、LLM 提示注入攻防、敏感数据脱敏隔离；不负责底层模型训练。',
    facts: [
      {
        id: 's-1',
        fact: '搭建内部大模型应用提示词注入防护护栏与输出审计规范，覆盖多轮越狱检测',
        source: '正式工作-安全工程部',
        experienceType: '正式工作',
        participationLevel: '负责',
        skills: ['AI 安全', '提示注入', '红蓝对抗', '安全护栏'],
      },
      {
        id: 's-2',
        fact: '推进研发流程中的 DevSecOps 集成，上线代码安全审计与敏感信息脱敏检查',
        source: '正式工作-安全工程部',
        experienceType: '正式工作',
        participationLevel: '主导',
        skills: ['DevSecOps', '应用安全', '数据脱敏'],
      },
    ],
    extraNotes: '无大模型预训练或 CUDA 算子优化经验',
    greetingRules: '',
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },

  juniorCareerChanger: {
    id: 'prof-junior-changer',
    name: '初级转行求职者',
    resumeFileName: 'junior.pdf',
    resumeText: 'RAW-JUNIOR-SECRET-ADDRESS',
    summary:
      '计算机相关背景，1 年测试实习经历，近期转入 AI 应用方向。\n项目经历：个人开发过一个本地文档问答小工具（个人项目，开发中，仅本地测试）。\n技能边界：Rust 仅自学语法无项目经验；无大规模高并发或企业级生产环境落地经验。',
    facts: [
      {
        id: 'j-1',
        fact: '参与测试团队接口自动化脚本编写与日常回归验证',
        source: '实习经历',
        experienceType: '实习',
        participationLevel: '参与',
        skills: ['Python', '自动化测试'],
      },
      {
        id: 'j-2',
        fact: '独立开发本地 PDF 文档 RAG 问答小工具原型',
        source: '个人练习项目',
        experienceType: '个人项目',
        participationLevel: '独立完成',
        skills: ['RAG', 'Python'],
        constraints: '开发中，仅本地测试，未上线',
      },
    ],
    extraNotes: 'Rust 仅自学语法，无项目经验；无高并发生产环境经验',
    greetingRules: '可坦诚说明正在转型与经验边界，突出学习能力与扎实基础，允许提及能力不足。',
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
};
