import type { JobAdapter, JobState } from '../../shared/types';
import { jobStateKey } from '../../shared/messages';
import { extractJob } from './extract';

export interface BossAdapterOptions {
  doc?: Document;
  getUrl?: () => string;
  debounceMs?: number;
  /** 自最近一次 DOM 变化起，字段仍不齐全多久后判定为失败 */
  loadTimeoutMs?: number;
  urlPollMs?: number;
  now?: () => number;
}

/**
 * BOSS 职位 Adapter：
 * body 级 MutationObserver + URL 轮询 + 防抖 + 状态去重。
 */
export class BossJobAdapter implements JobAdapter {
  private readonly doc: Document;
  private readonly getUrl: () => string;
  private readonly debounceMs: number;
  private readonly loadTimeoutMs: number;
  private readonly urlPollMs: number;
  private readonly now: () => number;

  private lastMutationAt: number;

  constructor(opts: BossAdapterOptions = {}) {
    this.doc = opts.doc ?? document;
    this.getUrl = opts.getUrl ?? (() => location.href);
    this.debounceMs = opts.debounceMs ?? 400;
    this.loadTimeoutMs = opts.loadTimeoutMs ?? 5000;
    this.urlPollMs = opts.urlPollMs ?? 1000;
    this.now = opts.now ?? (() => Date.now());
    this.lastMutationAt = this.now();
  }

  getJobState(): JobState {
    const outcome = extractJob(this.doc, this.getUrl());
    switch (outcome.kind) {
      case 'unsupported':
        return { status: 'error', code: 'UNSUPPORTED_PAGE' };
      case 'none':
        return { status: 'error', code: 'NO_ACTIVE_JOB' };
      case 'incomplete':
        if (this.now() - this.lastMutationAt >= this.loadTimeoutMs) {
          return {
            status: 'error',
            code: 'JOB_EXTRACTION_FAILED',
            detail: `${outcome.layout} 缺少字段：${outcome.missing.join(', ')}`,
          };
        }
        return { status: 'loading' };
      case 'ok':
        return { status: 'ready', job: outcome.job };
    }
  }

  onJobStateChange(listener: (state: JobState) => void): () => void {
    const initial = this.getJobState();
    let lastKey = jobStateKey(initial);
    let lastUrl = this.getUrl();
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      const state = this.getJobState();
      const key = jobStateKey(state);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = undefined;
      if (state.status === 'loading') {
        // 若之后没有新的 DOM 变化，超时后重新评估以给出失败状态
        timeoutTimer = setTimeout(evaluate, this.loadTimeoutMs + 50);
      }
      if (key !== lastKey) {
        lastKey = key;
        listener(state);
      }
    };

    const schedule = () => {
      this.lastMutationAt = this.now();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(evaluate, this.debounceMs);
    };

    const view = this.doc.defaultView;
    const Observer = view?.MutationObserver ?? MutationObserver;
    const observer = new Observer(schedule);
    observer.observe(this.doc.body ?? this.doc.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    const urlTimer = setInterval(() => {
      const url = this.getUrl();
      if (url !== lastUrl) {
        lastUrl = url;
        schedule();
      }
    }, this.urlPollMs);

    if (initial.status === 'loading') {
      timeoutTimer = setTimeout(evaluate, this.loadTimeoutMs + 50);
    }

    return () => {
      observer.disconnect();
      clearInterval(urlTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }
}
