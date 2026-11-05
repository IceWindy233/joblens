import type { MatchPoint, Recommendation } from '../shared/types';
import { isRecord } from '../shared/json';

// 模型只返回六个业务字段；校验类型、范围与评分/结论一致性。

export interface AnalysisPayload {
  matchScore: number;
  recommendation: Recommendation;
  summary: string;
  strengths: MatchPoint[];
  gaps: MatchPoint[];
  greeting: string;
}

export const MAX_POINTS = 8;
const RECS: readonly Recommendation[] = ['recommended', 'consider', 'not_recommended'];

export type ValidationResult =
  | { ok: true; value: AnalysisPayload }
  | { ok: false; errors: string[] };

function parsePoints(v: unknown, name: string, errors: string[]): MatchPoint[] {
  if (!Array.isArray(v)) {
    errors.push(`${name} 必须是数组`);
    return [];
  }
  const out: MatchPoint[] = [];
  v.forEach((p, i) => {
    if (!isRecord(p) || typeof p.requirement !== 'string' || typeof p.evidence !== 'string') {
      errors.push(`${name}[${i}] 必须包含字符串 requirement 与 evidence`);
      return;
    }
    const requirement = p.requirement.trim();
    const evidence = p.evidence.trim();
    if (requirement || evidence) out.push({ requirement, evidence });
  });
  return out.slice(0, MAX_POINTS);
}

export function validateAnalysisPayload(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['输出不是 JSON 对象'] };

  let score = raw.matchScore;
  if (typeof score === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(score)) score = Number(score);
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    errors.push('matchScore 必须是数字');
  } else {
    score = Math.round(score);
    if ((score as number) < 0 || (score as number) > 100) errors.push('matchScore 必须在 0~100');
  }

  const rec = raw.recommendation;
  if (typeof rec !== 'string' || !(RECS as readonly string[]).includes(rec)) {
    errors.push('recommendation 取值非法');
  }

  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) errors.push('summary 不能为空');
  const greeting = typeof raw.greeting === 'string' ? raw.greeting.trim() : '';
  if (!greeting) errors.push('greeting 不能为空');

  const strengths = parsePoints(raw.strengths, 'strengths', errors);
  const gaps = parsePoints(raw.gaps, 'gaps', errors);

  if (errors.length === 0) {
    const s = score as number;
    if (rec === 'recommended' && s < 60) errors.push('recommended 要求 matchScore ≥ 60');
    if (rec === 'not_recommended' && s > 60) errors.push('not_recommended 要求 matchScore ≤ 60');
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      matchScore: score as number,
      recommendation: rec as Recommendation,
      summary,
      strengths,
      gaps,
      greeting,
    },
  };
}
