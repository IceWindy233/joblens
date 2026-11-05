import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { BossJobAdapter } from '../adapters/boss/adapter';
import { buildDomSnapshot } from '../adapters/boss/snapshot';
import {
  isDomSnapshotMessage,
  isGetJobStateMessage,
  type JobStateChangedMessage,
} from '../shared/messages';

// 只读取当前职位 DOM，输出 JobState；不访问扩展存储、不调用 LLM。
export default defineContentScript({
  matches: ['https://www.zhipin.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const adapter = new BossJobAdapter();

    const onMessage = (
      msg: unknown,
      sender: { id?: string },
      sendResponse: (r: unknown) => void,
    ) => {
      if (sender.id !== browser.runtime.id) return;
      if (isGetJobStateMessage(msg)) sendResponse(adapter.getJobState());
      else if (isDomSnapshotMessage(msg)) sendResponse(buildDomSnapshot(document, location.href));
    };
    browser.runtime.onMessage.addListener(onMessage);

    const unsubscribe = adapter.onJobStateChange((state) => {
      const msg: JobStateChangedMessage = { type: 'JOB_STATE_CHANGED', state };
      // Side Panel 未打开时没有接收方，忽略该错误
      browser.runtime.sendMessage(msg).catch(() => undefined);
    });

    ctx.onInvalidated(() => {
      unsubscribe();
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});
