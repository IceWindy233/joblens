import type {
  EvidenceStatus,
  MatchPoint,
  MatchPointDimension,
  Recommendation,
  RequirementCategory,
} from '../shared/types';
import { DEFAULT_GREETING_POINTS } from '../shared/types';
import { isRecord } from '../shared/json';

export interface RequirementAssessment extends Required<MatchPoint> {
  conflict?: { jobQuote: string; profileQuote: string };
  greetingFact?: string;
  /** 属于同一项能力的重复要求使用相同主题。 */
  capabilityTopic?: string;
  /** 属于同一类岗位任务的候选事实使用相同的简短标签。 */
  greetingArea?: string;
}

export interface AnalysisPayload {
  /** 模型基于整份 JD 与档案给出的综合能力匹配参考分。 */
  matchScore?: number | null;
  scoreReason?: string;
  recommendation?: Recommendation;
  requirements: RequirementAssessment[];
  greetingFocus?: string;
  /** 要求数组的 1-based 序号，按打招呼语的选材优先级排列。 */
  greetingSelections: number[];
}

export const MAX_CONFIGURABLE_GREETING_POINTS = 8;
const CATEGORIES: readonly RequirementCategory[] = ['core', 'general', 'bonus', 'focus', 'hard'];
const STATUSES: readonly EvidenceStatus[] = ['matched', 'transferable', 'partial', 'not_shown', 'confirmed_lacking'];
const DIMENSIONS: readonly MatchPointDimension[] = ['capability', 'qualification', 'preference'];
const RECOMMENDATIONS: readonly Recommendation[] = ['recommended', 'consider', 'not_recommended'];

export type ValidationResult =
  | { ok: true; value: AnalysisPayload }
  | { ok: false; errors: string[] };

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return values.find((item) => item === value);
}

export function validateAnalysisPayload(
  raw: unknown,
  options: { maxGreetingPoints?: number } = {},
): ValidationResult {
  if (!isRecord(raw)) return { ok: false, errors: ['输出不是 JSON 对象'] };
  if (!Array.isArray(raw.requirements)) return { ok: false, errors: ['requirements 必须是数组'] };

  const errors: string[] = [];
  const score = raw.matchScore;
  let matchScore: number | null = null;
  if (score != null) {
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      errors.push('matchScore 必须为 0 到 100 的数字或 null');
    } else {
      matchScore = Math.round(score);
    }
  }
  const scoreReason = typeof raw.scoreReason === 'string' ? raw.scoreReason.trim() : '';
  const greetingFocus = typeof raw.greetingFocus === 'string' ? raw.greetingFocus.trim().slice(0, 240) : '';
  const recommendation = enumValue(raw.recommendation, RECOMMENDATIONS) ?? 'consider';
  const requirements: RequirementAssessment[] = [];
  raw.requirements.forEach((item, index) => {
    const row = `requirements[${index}]`;
    if (!isRecord(item) || typeof item.requirement !== 'string' || !item.requirement.trim() ||
      typeof item.evidence !== 'string' || !item.evidence.trim()) {
      errors.push(`${row} 必须包含非空的 requirement 与 evidence`);
      return;
    }

    const category = enumValue(item.category, CATEGORIES);
    const status = enumValue(item.status, STATUSES);
    const dimension = enumValue(item.dimension, DIMENSIONS);
    if (!category || !status || !dimension) {
      errors.push(`${row} 的 category、status 或 dimension 无效`);
      return;
    }
    const conflict = item.conflict;
    const jobQuote = isRecord(conflict) && typeof conflict.jobQuote === 'string' ? conflict.jobQuote.trim() : '';
    const profileQuote = isRecord(conflict) && typeof conflict.profileQuote === 'string' ? conflict.profileQuote.trim() : '';
    const greetingFact = typeof item.greetingFact === 'string' ? item.greetingFact.trim() : '';
    const greetingArea = typeof item.greetingArea === 'string' ? item.greetingArea.trim() : '';
    const capabilityTopic = typeof item.capabilityTopic === 'string' ? item.capabilityTopic.trim() : '';
    requirements.push({
      requirement: item.requirement.trim(),
      evidence: item.evidence.trim(),
      category,
      status,
      dimension,
      ...(jobQuote && profileQuote ? { conflict: { jobQuote, profileQuote } } : {}),
      ...(greetingFact ? { greetingFact } : {}),
      ...(greetingArea ? { greetingArea } : {}),
      ...(capabilityTopic ? { capabilityTopic } : {}),
    });
  });

  const maxPoints = Math.min(
    MAX_CONFIGURABLE_GREETING_POINTS,
    Math.max(1, Math.round(options.maxGreetingPoints ?? DEFAULT_GREETING_POINTS)),
  );
  const greetingSelections: number[] = [];
  if (!Array.isArray(raw.greetingSelections)) {
    errors.push('greetingSelections 必须是要求序号的数组');
  } else {
    // 序号只用于排序素材，个别序号无效时保留其余选择。
    for (const index of new Set<unknown>(raw.greetingSelections)) {
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > raw.requirements.length) continue;
      greetingSelections.push(index);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { matchScore, scoreReason, recommendation, requirements, greetingFocus, greetingSelections: greetingSelections.slice(0, maxPoints) } };
}
