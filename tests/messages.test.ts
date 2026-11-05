import { describe, expect, it } from 'vitest';
import { isJobState, isJobStateChangedMessage, jobStateKey } from '../shared/messages';
import { normalizeLookalikes, normalizeMultiline } from '../shared/text';
import type { Job } from '../shared/types';

const job: Job = {
  source: 'boss',
  url: 'u',
  title: 't',
  company: 'c',
  description: 'd',
  fingerprint: 'f',
  capturedAt: 'now',
};

describe('message validation', () => {
  it('validates job states', () => {
    expect(isJobState({ status: 'ready', job })).toBe(true);
    expect(isJobState({ status: 'ready', job: { ...job, title: '' } })).toBe(false);
    expect(isJobState({ status: 'loading' })).toBe(true);
    expect(isJobState({ status: 'error', code: 'NO_ACTIVE_JOB' })).toBe(true);
    expect(isJobState({ status: 'error', code: 'WHATEVER' })).toBe(false);
    expect(isJobState(null)).toBe(false);
  });
  it('validates messages', () => {
    expect(isJobStateChangedMessage({ type: 'JOB_STATE_CHANGED', state: { status: 'loading' } })).toBe(true);
    expect(isJobStateChangedMessage({ type: 'JOB_STATE_CHANGED', state: {}, apiKey: 'x' })).toBe(false);
  });
  it('state keys dedupe by fingerprint but refresh on late salary', () => {
    const a = jobStateKey({ status: 'ready', job });
    expect(jobStateKey({ status: 'ready', job: { ...job, capturedAt: 'later' } })).toBe(a);
    expect(jobStateKey({ status: 'ready', job: { ...job, salary: '10K' } })).not.toBe(a);
  });
});

describe('text normalization', () => {
  it('restores Kangxi-radical lookalikes but keeps full-width punctuation', () => {
    expect(normalizeLookalikes('应⽤（⼤模型），熟悉；')).toBe('应用（大模型），熟悉；');
  });

  it('collapses whitespace and blank lines but keeps structure', () => {
    expect(normalizeMultiline('  a   b \n\n\n\n c\u00a0d \n\n')).toBe('a b\n\nc d');
  });
});
