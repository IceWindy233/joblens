import { browser } from 'wxt/browser';
import type { AppSettings, UserProfile } from '../shared/types';

// Profile 与设置存 storage.local；API Key 默认存 storage.session，用户勾选“记住”时存 storage.local。
// 只能在扩展页面（Side Panel / Options / Background）中调用；Content Script 不访问存储。

const KEY_PROFILES = 'profiles';
const KEY_SETTINGS = 'settings';
const KEY_API_KEY = 'apiKey';

export const DEFAULT_SETTINGS: AppSettings = { activeProfileId: null, llm: null };

export async function loadProfiles(): Promise<UserProfile[]> {
  const data = await browser.storage.local.get(KEY_PROFILES);
  const v = data[KEY_PROFILES];
  return Array.isArray(v) ? (v as UserProfile[]) : [];
}

export async function saveProfiles(profiles: UserProfile[]): Promise<void> {
  await browser.storage.local.set({ [KEY_PROFILES]: profiles });
}

export async function loadSettings(): Promise<AppSettings> {
  const data = await browser.storage.local.get(KEY_SETTINGS);
  const v = data[KEY_SETTINGS] as Partial<AppSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(v ?? {}) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await browser.storage.local.set({ [KEY_SETTINGS]: settings });
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await saveSettings(next);
  return next;
}

const asKey = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export interface ApiKeyInfo {
  key: string | null;
  /** true：保存在 storage.local（浏览器重启后仍在）；false：仅本次会话 */
  persisted: boolean;
}

/** 会话存储优先，其次读取用户选择“记住”的本地存储。 */
export async function loadApiKeyInfo(): Promise<ApiKeyInfo> {
  const s = asKey((await browser.storage.session.get(KEY_API_KEY))[KEY_API_KEY]);
  if (s) return { key: s, persisted: false };
  const l = asKey((await browser.storage.local.get(KEY_API_KEY))[KEY_API_KEY]);
  return { key: l, persisted: !!l };
}

/**
 * 保存 API Key。persist=true 写入 storage.local（重启后保留，明文、未加密）；
 * 否则写入 storage.session。两处互斥，切换模式时清除另一处。key=null 时两处都清除。
 */
export async function saveApiKey(key: string | null, persist = false): Promise<void> {
  if (!key) {
    await browser.storage.session.remove(KEY_API_KEY);
    await browser.storage.local.remove(KEY_API_KEY);
    return;
  }
  if (persist) {
    await browser.storage.local.set({ [KEY_API_KEY]: key });
    await browser.storage.session.remove(KEY_API_KEY);
  } else {
    await browser.storage.session.set({ [KEY_API_KEY]: key });
    await browser.storage.local.remove(KEY_API_KEY);
  }
}

/** 不改 Key 本身，只切换保存位置。 */
export async function setApiKeyPersistence(persist: boolean): Promise<void> {
  const { key } = await loadApiKeyInfo();
  if (key) await saveApiKey(key, persist);
}

export async function clearAllData(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.session.clear();
}

/** 订阅存储变化（Options 修改后 Side Panel 实时刷新）。返回取消订阅函数。 */
export function onStorageChanged(cb: () => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === 'local' || area === 'session') cb();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** 检查是否已获得某个 API 源的主机权限。 */
export async function hasOriginPermission(baseURL: string): Promise<boolean> {
  try {
    const origin = new URL(baseURL).origin;
    return await browser.permissions.contains({ origins: [`${origin}/*`] });
  } catch {
    return false;
  }
}

/** 必须在用户手势（点击）回调中同步路径内调用。 */
export async function requestOriginPermission(baseURL: string): Promise<boolean> {
  const origin = new URL(baseURL).origin;
  return browser.permissions.request({ origins: [`${origin}/*`] });
}
