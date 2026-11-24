import type { AnalysisResult, Job, UserProfile } from '../shared/types';
import { DEFAULT_GREETING_POINTS } from '../shared/types';
import type { AnalysisPayload, RequirementAssessment } from './schema';

export type MatchAssessment = Pick<AnalysisResult,
  'matchScore' | 'recommendation' | 'summary' | 'strengths' | 'gaps' | 'greetingPoints' | 'greetingContext'
> & Required<Pick<AnalysisResult,
  'toConfirm' | 'hardRequirements' | 'decisionFactors' | 'capabilityEvidence' | 'capabilityCoverage'
>>;

const CAPABILITY_STATUS_ORDER = ['confirmed_lacking', 'partial', 'transferable', 'matched', 'not_shown'];

function isPrimary(item: RequirementAssessment): boolean {
  return item.category === 'focus' || item.category === 'core';
}

type EvidenceSources = {
  job: Pick<Job, 'title' | 'description'>;
  profile: Pick<UserProfile, 'summary' | 'extraNotes' | 'facts'>;
};

const DURATION = /(\d+(?:\.\d+)?|[零一二两三四五六七八九十]{1,3}|半)(年|个?月)/g;
const TENURE_LIMIT = /(?:累计|合计|总计|总共|只有|仅有|仅|至多|最多|不足|不到|不满|少于)$/;
const SHORT_OF_LIMIT = /(?:不足|不到|不满|少于)$/;
const CHINESE_DIGITS = '零一二三四五六七八九';
const EXPLICIT_CONDITION_LIMIT = /不接受|不愿|不考虑|不出差|不驻场|不上夜班|拒绝|不能|无法|(?:只|仅)(?:接受|考虑|能)|\b(?:no|cannot|unwilling to|only accept|only available)\b/i;

function normalizeQuote(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function summarizeCapabilityEvidence(items: RequirementAssessment[]) {
  const groups = new Map<string, RequirementAssessment['status']>();
  for (const item of items) {
    const key = normalizeQuote(item.capabilityTopic ?? item.requirement);
    const current = groups.get(key);
    // 同主题有多条判断时采用较保守的已知状态。
    if (!current || CAPABILITY_STATUS_ORDER.indexOf(item.status) < CAPABILITY_STATUS_ORDER.indexOf(current)) {
      groups.set(key, item.status);
    }
  }

  const capabilityEvidence = { matched: 0, transferable: 0, partial: 0, not_shown: 0, confirmed_lacking: 0 };
  for (const status of groups.values()) capabilityEvidence[status]++;
  const capabilityCoverage = groups.size ? Math.round(100 * (groups.size - capabilityEvidence.not_shown) / groups.size) : null;
  return { capabilityEvidence, capabilityCoverage };
}

function durationInMonths(amount: string, unit: string): number {
  let number = Number(amount);
  if (amount === '半') {
    number = 0.5;
  } else if (Number.isNaN(number)) {
    const digits = amount.replace('两', '二');
    if (digits.includes('十')) {
      const [tens, ones] = digits.split('十');
      number = (tens ? CHINESE_DIGITS.indexOf(tens) : 1) * 10 + (ones ? CHINESE_DIGITS.indexOf(ones) : 0);
    } else {
      number = CHINESE_DIGITS.indexOf(digits);
    }
  }
  return number < 0 ? NaN : number * (unit === '年' ? 12 : 1);
}

function hasExplicitTenureConflict(required: string, candidate: string): boolean {
  const [minimum, ...otherMinimums] = [...required.matchAll(DURATION)];
  const [maximum, ...otherMaximums] = [...candidate.matchAll(DURATION)];
  if (!minimum || !maximum || otherMinimums.length > 0 || otherMaximums.length > 0) return false;
  const requiredPrefix = required.slice(0, minimum.index);
  const requiredSuffix = required.slice(minimum.index + minimum[0].length);
  if (!/(?:至少|最低|不少于|不低于|≥)$/.test(requiredPrefix) && !/^(?:及以上|以上|或以上|\+)/.test(requiredSuffix)) return false;
  if (/[\d零一二两三四五六七八九十][-~～到至–—]$/.test(requiredPrefix)) return false;
  const candidateLimit = candidate.slice(0, maximum.index);
  if (!TENURE_LIMIT.test(candidateLimit)) return false;

  const scope = requiredSuffix.replace(/^(?:及以上|以上|或以上|\+)?的?/, '').split(/[,;。!?]/)[0]!;
  const candidateScope = candidate.slice(maximum.index + maximum[0].length)
    .replace(/^的/, '').split(/[,;。!?]/)[0]!;
  // 要求和档案总年限必须采用同一个范围。普通开发经验和仅全职开发经验是两个口径。
  if (!scope || scope !== candidateScope) return false;

  const needed = durationInMonths(minimum[1]!, minimum[2]!);
  const knownLimit = durationInMonths(maximum[1]!, maximum[2]!);
  return knownLimit < needed || (knownLimit === needed && SHORT_OF_LIMIT.test(candidateLimit));
}

function verifyAssessments(requirements: RequirementAssessment[], { job, profile }: EvidenceSources): RequirementAssessment[] {
  const jobText = [job.title, job.description].map(normalizeQuote);
  const profileText = [
    profile.summary, profile.extraNotes,
    ...(profile.facts ?? []).flatMap(({ fact, constraints, outcomes }) => [fact, constraints ?? '', outcomes ?? '']),
  ].map(normalizeQuote);

  return requirements.map((item) => {
    const category = item.category === 'hard' && item.dimension === 'capability' ? 'core' : item.category;
    if (item.status === 'transferable' && item.dimension !== 'capability') {
      return { ...item, category, status: 'partial' };
    }
    if (item.status !== 'confirmed_lacking') return category === item.category ? item : { ...item, category };

    const { conflict, ...remaining } = item;
    const jobQuote = normalizeQuote(conflict?.jobQuote ?? '');
    const profileQuote = normalizeQuote(conflict?.profileQuote ?? '');
    const hasProfileQuote = profileQuote.length > 0 && profileText.some((text) => text.includes(profileQuote));
    const quotesFound = jobQuote.length > 0 && hasProfileQuote && jobQuote !== profileQuote &&
      jobText.some((text) => text.includes(jobQuote));
    const isTenure = item.dimension === 'qualification' &&
      Boolean((jobQuote + normalizeQuote(item.requirement)).match(DURATION));
    const workingConditionConflict = item.dimension !== 'preference' || EXPLICIT_CONDITION_LIMIT.test(conflict?.profileQuote ?? '');
    if (quotesFound && workingConditionConflict && (!isTenure || hasExplicitTenureConflict(jobQuote, profileQuote))) {
      return category === item.category ? item : { ...item, category };
    }

    const note = isTenure ? '招聘方的计入范围和实际累计年限需要核实。' : '明确冲突的依据不足，需进一步核实。';
    const evidence = hasProfileQuote && conflict ? `档案中的已知信息为「${conflict.profileQuote}」。${note}` : note;
    return { ...remaining, category, status: 'not_shown', evidence };
  });
}

function summarize(main: RequirementAssessment[], scored: RequirementAssessment[]): string {
  const matched = scored.filter((item) => item.status === 'matched');
  const transferable = scored.filter((item) => item.status === 'transferable');
  const strongest = (items: RequirementAssessment[]) => items.find(isPrimary) ?? items[0];
  const direct = strongest(matched);
  const transfer = strongest(transferable);
  if (direct && transfer) return `已有证据支持「${direct.requirement}」，另有经验可迁移到「${transfer.requirement}」。`;
  if (direct) return `已有证据支持「${direct.requirement}」。`;
  if (transfer) return `已有相关经历，可迁移到「${transfer.requirement}」。`;
  if (main.some((item) => item.status === 'partial')) return '已有部分相关经验，尚需核对主要任务的经验范围。';
  return main.length > 0 ? '主要岗位能力的证据有限。' : '职位描述中可用于评估的能力要求有限。';
}

function groupMatchDetails(requirements: RequirementAssessment[]) {
  const strengths: RequirementAssessment[] = [];
  const gaps: RequirementAssessment[] = [];
  const toConfirm: RequirementAssessment[] = [];
  for (const item of requirements) {
    if (item.category === 'hard') continue;
    if (item.status === 'matched' || item.status === 'transferable') {
      if (item.dimension !== 'preference') strengths.push(item);
    } else if (item.dimension === 'preference') {
      (item.status === 'confirmed_lacking' ? gaps : toConfirm).push(item);
    } else if (item.category === 'bonus') {
      continue;
    } else if (item.status === 'confirmed_lacking' || isPrimary(item)) {
      gaps.push(item);
    } else {
      toConfirm.push(item);
    }
  }

  return { strengths, gaps, toConfirm };
}

function extractGreetingFact(item: RequirementAssessment): string | undefined {
  const fact = item.greetingFact;
  return fact && normalizeQuote(item.evidence).includes(normalizeQuote(fact)) ? fact : undefined;
}

function selectGreetingPoints(
  ranked: RequirementAssessment[],
  assessed: RequirementAssessment[],
  { maxPoints, prioritizeTasks, preferRanked, allowGapExplanation }: {
    maxPoints: number;
    prioritizeTasks: boolean;
    preferRanked: boolean;
    allowGapExplanation: boolean;
  },
): { fact: string; requirement: string }[] {
  // 问候语可用职责的部分证据，即使它没被模型列入拟选序号。仅补入已经摘录的事实。
  const taskCandidates = (prioritizeTasks ? [...ranked, ...assessed] : []).filter((item) =>
    item.category === 'focus' && item.dimension === 'capability' && extractGreetingFact(item),
  );
  const candidates = [...new Set(preferRanked ? [...ranked, ...taskCandidates] : [...taskCandidates, ...ranked])];
  const points: { fact: string; requirement: string }[] = [];
  const factKeys: string[] = [];
  const areas = new Set<string>();
  for (const item of candidates) {
    if (item.status !== 'matched' && item.status !== 'transferable' && item.status !== 'partial' &&
      !(item.status === 'confirmed_lacking' && allowGapExplanation)) continue;

    const area = normalizeQuote(item.greetingArea ?? '');
    const fact = extractGreetingFact(item) ?? item.evidence;
    const key = normalizeQuote(fact);
    if (factKeys.some((other) => other.includes(key) || key.includes(other))) continue;
    if (prioritizeTasks && area && areas.has(area)) continue;
    if (area) areas.add(area);
    points.push({ fact, requirement: item.requirement });
    factKeys.push(key);
    if (points.length === maxPoints) break;
  }
  return points;
}

/** 核对明确冲突的证据，整理匹配明细和打招呼语素材。 */
export function calibrateMatchAnalysis(
  { requirements, greetingSelections, greetingFocus, matchScore, scoreReason, recommendation: modelRecommendation = 'consider' }: AnalysisPayload,
  allowGapExplanation: boolean,
  sources: EvidenceSources,
  { maxPoints = DEFAULT_GREETING_POINTS, prioritizeTasks = true } = {},
): MatchAssessment {
  // 相同的 JD 要求只计一次。给问候语选材保留原始序号。
  const verified = verifyAssessments(requirements, sources);
  const byRequirement = new Map<string, RequirementAssessment>();
  for (const item of verified) {
    const key = normalizeQuote(item.requirement);
    if (!byRequirement.has(key)) byRequirement.set(key, item);
  }
  const assessed = [...byRequirement.values()];
  const distinctAssessments = new Set(assessed);

  const hardRequirements = assessed.filter((item) => item.category === 'hard');
  const capabilities = assessed.filter((item) => item.dimension === 'capability' && item.category !== 'hard' && item.category !== 'bonus');
  const primary = capabilities.filter(isPrimary);
  const main = primary.length ? primary : capabilities;
  const evidenceSummary = summarizeCapabilityEvidence(capabilities);

  const conflicts = hardRequirements.filter((item) => item.status === 'confirmed_lacking');
  const hardPending = hardRequirements.filter((item) => item.status === 'not_shown' || item.status === 'partial');
  const materialGaps = main.filter((item) => item.status !== 'matched' && item.status !== 'transferable');
  const roleGap = materialGaps.find((item) => item.category === 'focus' && item.status !== 'not_shown') ??
    materialGaps.find((item) => item.category === 'focus') ?? materialGaps[0];
  const decisionFactors = [
    ...conflicts,
    ...hardPending.filter((item) => item.status === 'not_shown'),
    ...hardPending.filter((item) => item.status === 'partial'),
  ].slice(0, roleGap && conflicts.length < 3 ? 2 : 3);
  if (roleGap && decisionFactors.length < 3) decisionFactors.push(roleGap);
  let recommendation = modelRecommendation;
  if (conflicts.length > 0) {
    recommendation = 'not_recommended';
  } else if (hardPending.length > 0 && recommendation === 'recommended') {
    recommendation = 'consider';
  }

  const ranked = greetingSelections.map((index) => verified[index - 1]).filter(
    (item): item is RequirementAssessment => item !== undefined && distinctAssessments.has(item),
  );
  const materials = selectGreetingPoints(ranked, assessed, {
    maxPoints, prioritizeTasks, preferRanked: Boolean(greetingFocus), allowGapExplanation,
  });
  const greetingPoints = materials.map(({ fact }) => fact);
  const greetingContext = greetingFocus && materials.length > 0
    ? { focus: greetingFocus, requirements: materials.map(({ requirement }) => requirement) }
    : undefined;

  return {
    ...evidenceSummary,
    matchScore: matchScore ?? null,
    recommendation,
    summary: scoreReason || summarize(main, capabilities),
    decisionFactors,
    ...groupMatchDetails(assessed),
    hardRequirements,
    greetingPoints,
    ...(greetingContext ? { greetingContext } : {}),
  };
}
