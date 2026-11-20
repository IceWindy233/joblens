import type { GreetingExample, Job } from '../shared/types';

export const GREETING_EXCERPT_LIMIT = 1500;
const MAX_EXAMPLES = 3;
const MIN_SIMILARITY = 0.2;
const MIN_PREFERRED_SIMILARITY = 0.08;

export interface SelectGreetingExamplesOptions {
  /** 是否启用样例参考（默认 true；false 时直接返回空数组） */
  enabled?: boolean;
}

const CAPABILITY_DOMAINS: Record<string, readonly string[]> = {
  agent: ['agent', '智能体', 'multi-agent', 'langgraph', 'langchain', 'mcp', 'function calling', 'tool', '编排', '工作流', 'workflow'],
  rag: ['rag', '检索增强', '知识库', '向量', 'embedding', 'milvus', 'rerank', '召回', 'chunk', '文档解析', 'graphrag'],
  frontend_fullstack: ['react', 'vue', 'next.js', 'nextjs', 'typescript', 'javascript', '前端', '全栈', 'tailwind', 'ssr', '组件库'],
  backend: ['后端', '微服务', 'golang', 'java', 'spring', 'python', 'fastapi', 'node.js', 'mysql', 'redis', 'kafka', 'grpc', '高并发'],
  enterprise_fde: ['fde', '解决方案', '交付', '私有化', 'poc', '商业化落地', '企业落地', '驻场', '需求调研', '售前'],
  devops_efficiency: ['研发效能', 'ci/cd', 'devops', '自动化测试', '评测', 'eval', 'llmops', '可观测', 'jenkins', '工程化'],
  security: ['安全', '渗透', '漏洞', 'devsecops', '红蓝对抗', '提示注入', 'prompt injection', '风控', '合规', 'waf', 'iam'],
  data: ['数据分析', '数仓', 'etl', 'spark', 'flink', 'sql', 'bi', '指标体系'],
  model_algo: ['微调', 'lora', 'sft', 'rlhf', '预训练', 'pytorch', '推理加速', 'vllm', '量化'],
  embedded: ['嵌入式', 'rtos', '单片机', 'stm32', '驱动', '固件', 'fpga'],
};

function bigrams(text: string): Set<string> {
  const chars = Array.from(text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  const pairs = new Set<string>();
  for (let i = 1; i < chars.length; i++) pairs.add(chars[i - 1]! + chars[i]!);
  return pairs;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  if (a.size > b.size) [a, b] = [b, a];
  let shared = 0;
  for (const pair of a) if (b.has(pair)) shared++;
  return (2 * shared) / (a.size + b.size);
}

function extractDomains(text: string): Set<string> {
  const lower = text.normalize('NFKC').toLowerCase();
  const matched = new Set<string>();
  for (const [domain, keywords] of Object.entries(CAPABILITY_DOMAINS)) {
    if (keywords.some((kw) => lower.includes(kw))) matched.add(domain);
  }
  return matched;
}

function setDice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return (2 * shared) / (a.size + b.size);
}

function roleTagBoost(jobTextLower: string, roleTags: string[] | undefined): number {
  if (!roleTags?.length) return 0;
  const matched = roleTags.filter((tag) => {
    const t = tag.trim().toLowerCase();
    return t.length >= 2 && jobTextLower.includes(t);
  });
  return matched.length > 0 ? Math.min(0.25, matched.length * 0.15) : 0;
}

/**
 * 综合职位标题、JD 能力领域语义重合度、适用岗位标签和“优先参考”标记选择样例：
 * - 标题与能力领域权重高于普通文本重叠，减少标题相近但职责差异很大时的误选；
 * - 严格按 profileId 隔离；
 * - 用户标记为 preferred 的样例在相关前提下优先排序；
 * - 同分时优先最近保存的样例。
 */
export function selectGreetingExamples(
  job: Job,
  profileId: string,
  examples: GreetingExample[],
  options: SelectGreetingExamplesOptions = {},
): GreetingExample[] {
  if (options.enabled === false || !examples.length) return [];
  const title = bigrams(job.title);
  const description = bigrams(job.description.slice(0, GREETING_EXCERPT_LIMIT));
  const jobText = `${job.title}\n${job.description.slice(0, GREETING_EXCERPT_LIMIT)}`;
  const jobTextLower = jobText.normalize('NFKC').toLowerCase();
  const jobDomains = extractDomains(jobText);

  const matches: { example: GreetingExample; score: number; preferred: boolean }[] = [];
  for (const example of examples) {
    if (example.profileId !== profileId) continue;

    let score: number;
    if (example.jobFingerprint === job.fingerprint) {
      score = 1;
    } else {
      const titleScore = dice(title, bigrams(example.jobTitle));
      const descScore = dice(description, bigrams(example.jobExcerpt));
      const exampleText = `${example.jobTitle}\n${example.jobExcerpt}\n${(example.roleTags ?? []).join(' ')}`;
      const exampleDomains = extractDomains(exampleText);
      const tagBoost = roleTagBoost(jobTextLower, example.roleTags);

      if (jobDomains.size > 0 && exampleDomains.size > 0) {
        const domainScore = setDice(jobDomains, exampleDomains);
        score = 0.42 * titleScore + 0.23 * descScore + 0.35 * domainScore + tagBoost;
        // 明确属于不同能力领域且完全无重合时，抑制因泛化词（如“工程师”“AI”）造成的误匹配
        if (domainScore === 0 && tagBoost === 0) score *= 0.45;
      } else {
        score = 0.65 * titleScore + 0.35 * descScore + tagBoost;
      }
      score = Math.min(1, score);
    }

    const threshold = example.preferred ? MIN_PREFERRED_SIMILARITY : MIN_SIMILARITY;
    if (score >= threshold) {
      matches.push({ example, score, preferred: Boolean(example.preferred) });
    }
  }

  return matches
    .sort(
      (a, b) =>
        Number(b.preferred) - Number(a.preferred) ||
        b.score - a.score ||
        b.example.createdAt.localeCompare(a.example.createdAt),
    )
    .slice(0, MAX_EXAMPLES)
    .map(({ example }) => example);
}
