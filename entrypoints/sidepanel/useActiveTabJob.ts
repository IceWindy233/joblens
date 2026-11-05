import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { JobState } from '../../shared/types';
import {
  isJobState,
  isJobStateChangedMessage,
  type DomSnapshotMessage,
  type GetJobStateMessage,
} from '../../shared/messages';
import { isBossUrl } from '../../adapters/boss/selectors';

interface ActiveTab {
  id: number;
  windowId: number;
}

/**
 * Side Panel 跟随当前窗口的活动标签页，
 * 只接受该标签页 Content Script 推送的 JOB_STATE_CHANGED。
 */
export function useActiveTabJob(): {
  jobState: JobState | null;
  refresh: () => void;
  requestSnapshot: () => Promise<string>;
} {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const activeRef = useRef<ActiveTab | null>(null);
  const windowIdRef = useRef<number | null>(null);
  const seqRef = useRef(0);

  const query = useCallback(async () => {
    const seq = ++seqRef.current;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (seq !== seqRef.current) return;
    if (!tab || tab.id === undefined) {
      activeRef.current = null;
      setJobState({ status: 'error', code: 'UNSUPPORTED_PAGE' });
      return;
    }
    activeRef.current = { id: tab.id, windowId: tab.windowId };
    windowIdRef.current = tab.windowId;
    if (!isBossUrl(tab.url)) {
      setJobState({ status: 'error', code: 'UNSUPPORTED_PAGE' });
      return;
    }
    setJobState((prev) => prev ?? { status: 'loading' });
    try {
      const msg: GetJobStateMessage = { type: 'GET_JOB_STATE' };
      const res: unknown = await browser.tabs.sendMessage(tab.id, msg);
      if (seq !== seqRef.current) return;
      setJobState(isJobState(res) ? res : { status: 'error', code: 'CONTENT_SCRIPT_MISSING' });
    } catch {
      if (seq !== seqRef.current) return;
      // 页面仍在加载时 Content Script 尚未就绪，也会走到这里
      setJobState(
        tab.status === 'loading' ? { status: 'loading' } : { status: 'error', code: 'CONTENT_SCRIPT_MISSING' },
      );
    }
  }, []);

  useEffect(() => {
    void query();

    const onMessage = (msg: unknown, sender: { id?: string; tab?: { id?: number } }) => {
      if (sender.id !== browser.runtime.id) return;
      if (!isJobStateChangedMessage(msg)) return;
      if (!activeRef.current || sender.tab?.id !== activeRef.current.id) return;
      setJobState(msg.state);
    };
    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (windowIdRef.current !== null && info.windowId !== windowIdRef.current) return;
      setJobState(null);
      void query();
    };
    const onUpdated = (tabId: number, change: { status?: string; url?: string }) => {
      if (tabId !== activeRef.current?.id) return;
      if (change.url || change.status === 'complete') void query();
    };

    browser.runtime.onMessage.addListener(onMessage);
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [query]);

  /** 开发诊断：向当前标签页请求 DOM 结构快照。 */
  const requestSnapshot = useCallback(async (): Promise<string> => {
    const tab = activeRef.current;
    if (!tab) throw new Error('没有活动标签页');
    const msg: DomSnapshotMessage = { type: 'DOM_SNAPSHOT' };
    const res: unknown = await browser.tabs.sendMessage(tab.id, msg);
    if (typeof res !== 'string') throw new Error('页面未返回快照，请刷新 BOSS 页面后重试');
    return res;
  }, []);

  return { jobState, refresh: () => void query(), requestSnapshot };
}
