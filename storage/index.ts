import { browser } from 'wxt/browser';
import type { AppSettings, GreetingExample, UserProfile } from '../shared/types';
import { migrateGreetingExample, migrateProfile, migrateSettings } from '../profile/manager';

// Profile 与设置存 local；API Key 默认存 session，用户勾选“记住”时存 local。
// 默认后端为扩展的 chrome.storage，只能在扩展页面（Side Panel / Options / Background）中调用；Content Script 不访问存储。
// 其他宿主（Android WebView 引擎）启动时通过 setStorageBackend 注入自己的实现。

export interface StorageArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface StorageBackend {
  /** 持久存储：档案、设置、样例、用户选择记住的 API Key */
  local: StorageArea;
  /** 会话存储：默认的 API Key，宿主重启后清空 */
  session: StorageArea;
  /** 任一区域变化时回调；返回取消订阅函数 */
  onChanged(cb: () => void): () => void;
}

function browserArea(area: 'local' | 'session'): StorageArea {
  return {
    get: async (key) => (await browser.storage[area].get(key))[key],
    set: (key, value) => browser.storage[area].set({ [key]: value }),
    remove: (key) => browser.storage[area].remove(key),
    clear: () => browser.storage[area].clear(),
  };
}

const browserBackend: StorageBackend = {
  local: browserArea('local'),
  session: browserArea('session'),
  onChanged(cb) {
    const listener = (_changes: unknown, area: string) => {
      if (area === 'local' || area === 'session') cb();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  },
};

let backend: StorageBackend = browserBackend;

/** 替换存储后端；须在任何读写之前调用。 */
export function setStorageBackend(next: StorageBackend): void {
  backend = next;
}

const KEY_PROFILES = 'profiles';
const KEY_SETTINGS = 'settings';
const KEY_API_KEY = 'apiKey';
const GREETING_EXAMPLES_PREFIX = 'greetingExamples:';

export const DEFAULT_SETTINGS: AppSettings = { activeProfileId: null, llm: null };

export async function loadProfiles(): Promise<UserProfile[]> {
  const v = await backend.local.get(KEY_PROFILES);
  return Array.isArray(v) ? (v as UserProfile[]).map(migrateProfile) : [];
}

export async function saveProfiles(profiles: UserProfile[]): Promise<void> {
  await backend.local.set(KEY_PROFILES, profiles);
}

export async function loadGreetingExamples(profileId: string): Promise<GreetingExample[]> {
  const v = await backend.local.get(GREETING_EXAMPLES_PREFIX + profileId);
  return Array.isArray(v) ? (v as GreetingExample[]).map(migrateGreetingExample) : [];
}

/** 同一档案、同一职位只保留最新确认的版本。 */
export async function saveGreetingExample(example: GreetingExample): Promise<void> {
  const key = GREETING_EXAMPLES_PREFIX + example.profileId;
  await navigator.locks.request(key, async () => {
    const profiles = await loadProfiles();
    if (!profiles.some((p) => p.id === example.profileId)) throw new Error('档案已删除，无法保存样例');
    const examples = await loadGreetingExamples(example.profileId);
    const next = examples.filter((e) => e.jobFingerprint !== example.jobFingerprint);
    await backend.local.set(key, [migrateGreetingExample(example), ...next]);
  });
}

/** 更新某条样例的元信息（如是否优先参考、适用岗位标签）。 */
export async function updateGreetingExample(
  profileId: string,
  jobFingerprint: string,
  patch: Partial<Pick<GreetingExample, 'preferred' | 'roleTags' | 'greeting'>>,
): Promise<void> {
  const key = GREETING_EXAMPLES_PREFIX + profileId;
  await navigator.locks.request(key, async () => {
    const examples = await loadGreetingExamples(profileId);
    const next = examples.map((e) =>
      e.jobFingerprint === jobFingerprint ? migrateGreetingExample({ ...e, ...patch }) : e,
    );
    await backend.local.set(key, next);
  });
}

export async function removeGreetingExamples(profileId: string, jobFingerprint?: string): Promise<void> {
  const key = GREETING_EXAMPLES_PREFIX + profileId;
  await navigator.locks.request(key, async () => {
    if (jobFingerprint === undefined) {
      await backend.local.remove(key);
      return;
    }
    const examples = await loadGreetingExamples(profileId);
    const next = examples.filter((e) => e.jobFingerprint !== jobFingerprint);
    if (next.length) await backend.local.set(key, next);
    else await backend.local.remove(key);
  });
}

export async function loadSettings(): Promise<AppSettings> {
  const v = (await backend.local.get(KEY_SETTINGS)) as Partial<AppSettings> | undefined;
  return migrateSettings(v);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await backend.local.set(KEY_SETTINGS, settings);
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
  const s = asKey(await backend.session.get(KEY_API_KEY));
  if (s) return { key: s, persisted: false };
  const l = asKey(await backend.local.get(KEY_API_KEY));
  return { key: l, persisted: !!l };
}

/**
 * 保存 API Key。persist=true 写入 storage.local（重启后保留，明文、未加密）；
 * 否则写入 storage.session。两处互斥，切换模式时清除另一处。key=null 时两处都清除。
 */
export async function saveApiKey(key: string | null, persist = false): Promise<void> {
  if (!key) {
    await backend.session.remove(KEY_API_KEY);
    await backend.local.remove(KEY_API_KEY);
    return;
  }
  if (persist) {
    await backend.local.set(KEY_API_KEY, key);
    await backend.session.remove(KEY_API_KEY);
  } else {
    await backend.session.set(KEY_API_KEY, key);
    await backend.local.remove(KEY_API_KEY);
  }
}

/** 不改 Key 本身，只切换保存位置。 */
export async function setApiKeyPersistence(persist: boolean): Promise<void> {
  const { key } = await loadApiKeyInfo();
  if (key) await saveApiKey(key, persist);
}

export async function clearAllData(): Promise<void> {
  await backend.local.clear();
  await backend.session.clear();
}

/** 订阅存储变化（Options 修改后 Side Panel 实时刷新）。返回取消订阅函数。 */
export function onStorageChanged(cb: () => void): () => void {
  return backend.onChanged(cb);
}
