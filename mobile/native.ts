import { setStorageBackend, type StorageArea } from '../storage';
import { setPlatform, type SetupCheck } from '../platform';
import type { AnalysisCacheSnapshot } from '../analysis/session';

const ANALYSIS_CACHE_KEY = 'analysisCache';

// Android WebView 与原生层的桥。原生通过 addJavascriptInterface 注入 JobLensNative，
// 并调用 window.__joblens 上的回调推送事件。

/** 原生注入对象（android/.../web/NativeBridge.kt）。全部方法同步返回，异步结果走 window.__joblens 回调。 */
export interface NativeBridge {
  storageGet(area: string, key: string): string | null;
  storageSet(area: string, key: string, json: string): void;
  storageRemove(area: string, key: string): void;
  storageClear(area: string): void;
  httpRequest(id: string, requestJson: string): void;
  httpAbort(id: string): void;
  copyText(text: string): void;
  shareText(filename: string, text: string): void;
  openSettings(): void;
  /** 以下仅设置页（Activity）可用：权限与运行检查 */
  setupChecks(): string;
  setupAction(id: string, index: number): void;
  setupConfirm(id: string, confirmed: boolean): void;
  consumeFirstRun(): boolean;
  /** 以下仅悬浮面板可用 */
  setBubble(json: string): void;
  /** 速览卡内容（点按气泡后显示） */
  setCard(json: string): void;
  /** 屏幕底部的短暂提示 */
  showNotice(text: string): void;
  closePanel(): void;
  requestTree(): void;
}

interface HttpResponseWire {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type HubEvents = {
  storageChanged: [];
  tree: [json: string];
  bubbleTapped: [];
  setupChanged: [];
};

declare global {
  interface Window {
    JobLensNative?: NativeBridge;
    __joblens?: NativeCallbacks;
  }
}

interface NativeCallbacks {
  storageChanged(): void;
  httpDone(id: string, responseJson: string): void;
  httpFail(id: string, message: string): void;
  onTree(json: string): void;
  bubbleTapped(): void;
  setupChanged(): void;
}

const listeners: { [K in keyof HubEvents]: Set<(...args: HubEvents[K]) => void> } = {
  storageChanged: new Set(),
  tree: new Set(),
  bubbleTapped: new Set(),
  setupChanged: new Set(),
};

/** 订阅原生事件；返回取消订阅函数。 */
export function onNative<K extends keyof HubEvents>(event: K, cb: (...args: HubEvents[K]) => void): () => void {
  listeners[event].add(cb);
  return () => listeners[event].delete(cb);
}

function emit<K extends keyof HubEvents>(event: K, ...args: HubEvents[K]): void {
  for (const cb of listeners[event]) cb(...args);
}

export function native(): NativeBridge {
  const bridge = window.JobLensNative;
  if (!bridge) throw new Error('JobLens 原生桥不可用：请在 Android 客户端中打开此页面');
  return bridge;
}

const pendingHttp = new Map<string, { resolve: (r: Response) => void; reject: (e: unknown) => void }>();
let httpSeq = 0;

function area(name: 'local' | 'session'): StorageArea {
  return {
    async get(key) {
      const json = native().storageGet(name, key);
      // Java 返回 null 时 JS 侧收到 undefined
      return json == null ? undefined : (JSON.parse(json) as unknown);
    },
    async set(key, value) {
      native().storageSet(name, key, JSON.stringify(value));
    },
    async remove(key) {
      native().storageRemove(name, key);
    },
    async clear() {
      native().storageClear(name);
    },
  };
}

/** 模型请求经原生 HTTP 发出（WebView 内直接 fetch 第三方 API 会受 CORS 限制）；应用内资源仍走 WebView。 */
function nativeFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin === location.origin) return originalFetch(input, init);
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
    const { signal } = request;
    signal.throwIfAborted();
    const id = String(++httpSeq);
    const { promise, resolve, reject } = Promise.withResolvers<Response>();
    pendingHttp.set(id, { resolve, reject });
    signal.addEventListener(
      'abort',
      () => {
        if (!pendingHttp.delete(id)) return;
        native().httpAbort(id);
        reject(signal.reason);
      },
      { once: true },
    );
    native().httpRequest(
      id,
      JSON.stringify({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
      }),
    );
    return promise;
  };
}

/**
 * 安装存储后端、网络与平台能力；须在渲染界面前调用一次。
 * host：activity = 主界面的设置页（可弹原生下拉框、提供权限检查）；overlay = 悬浮面板。
 */
export function installNative({ host }: { host: 'activity' | 'overlay' }): void {
  window.__joblens = {
    storageChanged: () => emit('storageChanged'),
    httpDone(id, responseJson) {
      const p = pendingHttp.get(id);
      if (!p) return;
      pendingHttp.delete(id);
      const r = JSON.parse(responseJson) as HttpResponseWire;
      p.resolve(new Response(r.body, { status: r.status, headers: r.headers }));
    },
    httpFail(id, message) {
      const p = pendingHttp.get(id);
      if (!p) return;
      pendingHttp.delete(id);
      p.reject(new TypeError(message));
    },
    onTree: (json) => emit('tree', json),
    bubbleTapped: () => emit('bubbleTapped'),
    setupChanged: () => emit('setupChanged'),
  };

  setStorageBackend({
    local: area('local'),
    session: area('session'),
    onChanged: (cb) => onNative('storageChanged', cb),
  });

  window.fetch = nativeFetch(window.fetch.bind(window));

  setPlatform({
    terms: {
      dataHome: '本机 JobLens 应用',
      workspace: '悬浮面板',
      getStarted: '在 BOSS 直聘 APP 打开职位详情，点按悬浮按钮',
      rememberKeyHint: 'JobLens 被系统关闭后免重新输入',
      persistedKeyNote: '开启后将以明文保存在 JobLens 的应用私有存储中（其他应用读不到，已 root 的设备可读取）',
      sessionKeyNote: '默认仅保存在内存中，JobLens 被系统关闭后需重新填写。',
    },
    selectPopups: host === 'activity',
    ...(host === 'activity'
      ? {
          setup: {
            list: () => JSON.parse(native().setupChecks()) as SetupCheck[],
            runAction: (id, index) => native().setupAction(id, index),
            setConfirmed(id, confirmed) {
              native().setupConfirm(id, confirmed);
              emit('setupChanged');
            },
            onChanged: (cb) => onNative('setupChanged', cb),
            consumeFirstRun: () => native().consumeFirstRun(),
          },
        }
      : {}),
    // 存在原生内存（session 区）：面板 WebView 因深浅色切换或渲染进程回收而重建后，已分析职位无需再调用模型
    analysisCache: {
      load() {
        const json = native().storageGet('session', ANALYSIS_CACHE_KEY);
        return json == null ? undefined : (JSON.parse(json) as AnalysisCacheSnapshot);
      },
      save(snapshot) {
        native().storageSet('session', ANALYSIS_CACHE_KEY, JSON.stringify(snapshot));
      },
    },
    openSettings: () => native().openSettings(),
    copyText: async (text) => native().copyText(text),
    saveTextFile: async (filename, text) => native().shareText(filename, text),
    // Android 应用没有按域名授权的概念，网络访问由应用自身权限决定
    hasOriginPermission: async () => true,
    requestOriginPermission: async () => true,
    onPermissionsChanged: () => () => undefined,
  });
}
