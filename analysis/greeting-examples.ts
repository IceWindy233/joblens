import type { GreetingExample, Job } from '../shared/types';

export const GREETING_EXCERPT_LIMIT = 1500;
const MAX_EXAMPLES = 3;
const MIN_SIMILARITY = 0.2;

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

/** 标题权重高于 JD；低相似度不发送，同分时优先最近保存的样例。 */
export function selectGreetingExamples(
  job: Job,
  profileId: string,
  examples: GreetingExample[],
): GreetingExample[] {
  if (!examples.length) return [];
  const title = bigrams(job.title);
  const description = bigrams(job.description.slice(0, GREETING_EXCERPT_LIMIT));
  const matches: { example: GreetingExample; score: number }[] = [];
  for (const example of examples) {
    if (example.profileId !== profileId) continue;
    const score = example.jobFingerprint === job.fingerprint
      ? 1
      : 0.65 * dice(title, bigrams(example.jobTitle)) + 0.35 * dice(description, bigrams(example.jobExcerpt));
    if (score >= MIN_SIMILARITY) matches.push({ example, score });
  }
  return matches
    .sort((a, b) => b.score - a.score || b.example.createdAt.localeCompare(a.example.createdAt))
    .slice(0, MAX_EXAMPLES)
    .map(({ example }) => example);
}
