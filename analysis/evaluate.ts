import type {
  AnalysisResult,
  EffectiveGreetingConfig,
  Job,
  UserProfile,
} from '../shared/types';
import { checkGreetingDetailed } from './greeting';

export interface EvaluationCriteria {
  /** 该 JD 期望重点命中的方向关键词（用于验证不同 JD 是否产出差异化选材与表达） */
  expectedFocusKeywords?: string[];
  /** 用户规则是否要求保留固定结尾 */
  expectedFixedEnding?: string;
  /** 严禁泄露到阶段 A / 阶段 B Prompt 的敏感字符串（如原始简历密文、其他档案事实） */
  forbiddenPromptStrings?: string[];
  /** 阶段 B 严禁出现的未选中档案文本片段（验证事实隔离） */
  forbiddenStageBStrings?: string[];
}

export interface EvaluationReport {
  factualAccuracy: boolean;
  jdTargeting: boolean;
  ruleCompliance: boolean;
  redundancyCheck: boolean;
  dataIsolation: boolean;
  passed: boolean;
  details: string[];
}

function hasMechanicalConcatenation(greeting: string): boolean {
  const repeatedPattern = greeting.match(/(?:我做过|我负责过|我也做过|还做过)/g);
  if (repeatedPattern && repeatedPattern.length >= 3) return true;
  const sentences = greeting
    .split(/[。！？；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  const seenPrefixes = new Set<string>();
  for (const s of sentences) {
    const prefix = s.slice(0, 6);
    if (seenPrefixes.has(prefix)) return true;
    seenPrefixes.add(prefix);
  }
  return false;
}

/**
 * 回归评测：结合用户当前有效规则，从事实准确性、JD 针对性、规则遵循、冗余度与数据隔离五个维度验证输出。
 */
export function evaluateGenerationCase(input: {
  job: Job;
  profile: UserProfile;
  effective: EffectiveGreetingConfig;
  result: AnalysisResult;
  stageAPromptText?: string;
  stageBPromptText?: string;
  criteria?: EvaluationCriteria;
}): EvaluationReport {
  const { job, profile, effective, result, stageAPromptText, stageBPromptText, criteria } = input;
  const details: string[] = [];

  // 1. 事实准确性（严格使用候选匹配事实，仅允许职位标题中的技术标识词如 Web3/5G）
  const facts = result.greetingPoints.join('\n');
  const issues = checkGreetingDetailed(result.greeting, facts, {
    preferences: effective.preferences,
    extraNotes: profile.extraNotes,
    jobTitle: job.title,
  });
  const factIssues = issues.filter((i) => i.kind === 'fact');
  const factualAccuracy = factIssues.length === 0;
  if (!factualAccuracy) {
    details.push(`事实问题: ${factIssues.map((i) => i.message).join('；')}`);
  }

  // 2. 规则遵循（结合该用户实际配置的结构与风格规则，而非单一审美）
  const styleOrStructureIssues = issues.filter((i) => i.kind !== 'fact');
  let ruleCompliance = styleOrStructureIssues.length === 0;
  if (!ruleCompliance) {
    details.push(`规则/风格问题: ${styleOrStructureIssues.map((i) => i.message).join('；')}`);
  }
  if (criteria?.expectedFixedEnding && !result.greeting.includes(criteria.expectedFixedEnding)) {
    ruleCompliance = false;
    details.push(`未包含期望固定结尾: ${criteria.expectedFixedEnding}`);
  }
  if (result.greetingPoints.length > effective.preferences.maxPoints) {
    ruleCompliance = false;
    details.push(`选材超出上限: ${result.greetingPoints.length} > ${effective.preferences.maxPoints}`);
  }

  // 3. JD 针对性
  let jdTargeting = true;
  if (criteria?.expectedFocusKeywords?.length) {
    const combinedOutput = `${result.greetingPoints.join('\n')}\n${result.greeting}`.toLowerCase();
    const matched = criteria.expectedFocusKeywords.some((kw) => combinedOutput.includes(kw.toLowerCase()));
    if (!matched) {
      jdTargeting = false;
      details.push(`未命中 JD 重点关键词: ${criteria.expectedFocusKeywords.join('/')}`);
    }
  }

  // 4. 冗余度检查
  const redundancyCheck = !hasMechanicalConcatenation(result.greeting);
  if (!redundancyCheck) {
    details.push('存在机械拼接或连续重复句式');
  }

  // 5. 数据隔离检查
  let dataIsolation = true;
  if (stageAPromptText) {
    if (profile.resumeText && stageAPromptText.includes(profile.resumeText)) {
      dataIsolation = false;
      details.push('阶段 A Prompt 泄露了原始简历全文');
    }
    for (const secret of criteria?.forbiddenPromptStrings ?? []) {
      if (stageAPromptText.includes(secret)) {
        dataIsolation = false;
        details.push(`阶段 A Prompt 包含禁止出现的字符: ${secret}`);
      }
    }
  }
  if (stageBPromptText) {
    for (const secret of [...(criteria?.forbiddenPromptStrings ?? []), ...(criteria?.forbiddenStageBStrings ?? [])]) {
      if (stageBPromptText.includes(secret)) {
        dataIsolation = false;
        details.push(`阶段 B Prompt 泄露了未授权信息: ${secret}`);
      }
    }
  }

  return {
    factualAccuracy,
    jdTargeting,
    ruleCompliance,
    redundancyCheck,
    dataIsolation,
    passed: factualAccuracy && jdTargeting && ruleCompliance && redundancyCheck && dataIsolation,
    details,
  };
}
