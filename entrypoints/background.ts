import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

// Background 只负责轻量事务，不发起 LLM 请求、不保存内存状态
// （MV3 Service Worker 会被回收；LLM 请求由扩展页面直接发起，便于取消且不中断）。
export default defineBackground(() => {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.error('[JobLens] setPanelBehavior failed', err));

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') browser.runtime.openOptionsPage().catch(() => undefined);
  });
});
