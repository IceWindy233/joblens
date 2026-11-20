import type { Job, JobErrorCode, JobState } from './types';
import { isRecord } from './json';
import { cyrb53, squashWhitespace } from './text';

// Side Panel ↔ Content Script 消息契约。LLM 调用不走消息，由扩展页面直接发起。

export interface GetJobStateMessage {
  type: 'GET_JOB_STATE';
}

export interface JobStateChangedMessage {
  type: 'JOB_STATE_CHANGED';
  state: JobState;
}

/** 开发诊断：请求当前页面的结构快照，用于核验/更新选择器（只读，用户手动触发）。 */
export interface DomSnapshotMessage {
  type: 'DOM_SNAPSHOT';
}

export type PanelToContentMessage = GetJobStateMessage | DomSnapshotMessage;
export type ContentToPanelMessage = JobStateChangedMessage;

export function isDomSnapshotMessage(v: unknown): v is DomSnapshotMessage {
  return isRecord(v) && v.type === 'DOM_SNAPSHOT';
}

const JOB_ERROR_CODES: readonly JobErrorCode[] = [
  'UNSUPPORTED_PAGE',
  'NO_ACTIVE_JOB',
  'JOB_EXTRACTION_FAILED',
  'CONTENT_SCRIPT_MISSING',
];

const isStr = (v: unknown): v is string => typeof v === 'string';
const isOptStr = (v: unknown) => v === undefined || isStr(v);

export function isJob(v: unknown): v is Job {
  return (
    isRecord(v) &&
    v.source === 'boss' &&
    isOptStr(v.sourceId) &&
    isStr(v.url) &&
    isStr(v.title) &&
    v.title.length > 0 &&
    isStr(v.company) &&
    v.company.length > 0 &&
    isOptStr(v.salary) &&
    isOptStr(v.location) &&
    isStr(v.description) &&
    v.description.length > 0 &&
    isStr(v.fingerprint) &&
    v.fingerprint.length > 0 &&
    isStr(v.capturedAt)
  );
}

export function isJobState(v: unknown): v is JobState {
  if (!isRecord(v)) return false;
  switch (v.status) {
    case 'ready':
      return isJob(v.job);
    case 'loading':
      return true;
    case 'error':
      return (
        isStr(v.code) &&
        (JOB_ERROR_CODES as readonly string[]).includes(v.code) &&
        isOptStr(v.detail)
      );
    default:
      return false;
  }
}

export function isGetJobStateMessage(v: unknown): v is GetJobStateMessage {
  return isRecord(v) && v.type === 'GET_JOB_STATE';
}

export function isJobStateChangedMessage(v: unknown): v is JobStateChangedMessage {
  return isRecord(v) && v.type === 'JOB_STATE_CHANGED' && isJobState(v.state);
}

/** 用于去重：状态 + 错误码 + 指纹 + 内容摘要相同视为同一状态。 */
export function jobStateKey(s: JobState): string {
  switch (s.status) {
    case 'ready': {
      // 薪资/地点可能晚于正文加载，同一职位 ID 的 JD 标题/正文修改也应触发刷新
      const contentHash = cyrb53(
        `${squashWhitespace(s.job.title)}|${squashWhitespace(s.job.description)}`,
      );
      return `ready:${s.job.fingerprint}:${contentHash}:${s.job.salary ?? ''}:${s.job.location ?? ''}`;
    }
    case 'loading':
      return 'loading';
    case 'error':
      return `error:${s.code}`;
  }
}
