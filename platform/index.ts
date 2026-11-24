import { browser } from 'wxt/browser';
import type { AnalysisCacheStore } from '../analysis/session';

// 界面依赖的宿主能力。默认实现为 Chrome 扩展；Android WebView 启动时通过 setPlatform 注入原生实现。

/** 界面文案中随宿主变化的说法 */
export interface PlatformTerms {
  /** 数据存放位置，如“本机浏览器” */
  dataHome: string;
  /** 分析界面的称呼，如“侧边栏” */
  workspace: string;
  /** 设置完成后的下一步 */
  getStarted: string;
  /** 记住 API Key 开关的补充说明 */
  rememberKeyHint: string;
  /** 记住 API Key 时的存储说明 */
  persistedKeyNote: string;
  /** 默认（不记住）时的存储说明 */
  sessionKeyNote: string;
}

/** 一项系统权限或运行环境检查（由宿主检测） */
export interface SetupCheck {
  id: string;
  title: string;
  description: string;
  /** manual：系统无法检测，需用户设置后手动确认 */
  state: 'ok' | 'missing' | 'manual';
  required: boolean;
  /** state 为 manual 时用户是否已确认 */
  confirmed: boolean;
  /** 跳转按钮文字；点击时以序号调用 runAction */
  actions: string[];
}

/** 宿主权限检查（仅 Android 设置页提供） */
export interface SetupHost {
  list(): SetupCheck[];
  runAction(id: string, index: number): void;
  setConfirmed(id: string, confirmed: boolean): void;
  /** 用户从系统设置返回等可能改变状态时回调；返回取消订阅函数 */
  onChanged(cb: () => void): () => void;
  /** 是否为首次启动（读取后即清除），首次启动时设置页直接打开权限检查分区 */
  consumeFirstRun(): boolean;
}

export interface Platform {
  terms: PlatformTerms;
  /** WebView 能否弹出原生 select 下拉框（悬浮窗中的 WebView 不能） */
  selectPopups: boolean;
  /** 跨界面实例保存分析结果缓存；扩展不需要（侧边栏常驻） */
  analysisCache?: AnalysisCacheStore;
  /** 系统权限与运行环境检查；提供时设置页显示“权限与运行”分区 */
  setup?: SetupHost;
  openSettings(): void;
  copyText(text: string): Promise<void>;
  /** 把诊断文本保存为文件（扩展：下载；Android：分享） */
  saveTextFile(filename: string, text: string): Promise<void>;
  /** 是否已获得某个模型 API 源的访问授权 */
  hasOriginPermission(baseURL: string): Promise<boolean>;
  /** 扩展中必须在用户手势（点击）回调的同步路径内调用 */
  requestOriginPermission(baseURL: string): Promise<boolean>;
  /** 授权变化时回调；返回取消订阅函数 */
  onPermissionsChanged(cb: () => void): () => void;
}

const extensionPlatform: Platform = {
  terms: {
    dataHome: '本机浏览器',
    workspace: '侧边栏',
    getStarted: '打开 BOSS 职位页使用侧边栏',
    rememberKeyHint: '浏览器重启后免重新输入',
    persistedKeyNote: '开启后将以明文保存在本机扩展存储中（网页脚本读不到，本机目录可读取）',
    sessionKeyNote: '默认仅保存在本次浏览器会话中，重启后需重新填写。',
  },
  selectPopups: true,
  openSettings() {
    void browser.runtime.openOptionsPage();
  },
  copyText: (text) => navigator.clipboard.writeText(text),
  async saveTextFile(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async hasOriginPermission(baseURL) {
    try {
      const origin = new URL(baseURL).origin;
      return await browser.permissions.contains({ origins: [`${origin}/*`] });
    } catch {
      return false;
    }
  },
  requestOriginPermission(baseURL) {
    const origin = new URL(baseURL).origin;
    return browser.permissions.request({ origins: [`${origin}/*`] });
  },
  onPermissionsChanged(cb) {
    browser.permissions.onAdded.addListener(cb);
    browser.permissions.onRemoved.addListener(cb);
    return () => {
      browser.permissions.onAdded.removeListener(cb);
      browser.permissions.onRemoved.removeListener(cb);
    };
  },
};

let current: Platform = extensionPlatform;

/** 替换宿主实现；须在渲染界面之前调用。 */
export function setPlatform(next: Platform): void {
  current = next;
}

export function getPlatform(): Platform {
  return current;
}
