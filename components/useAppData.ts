import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, UserProfile } from '../shared/types';
import { DEFAULT_SETTINGS, loadApiKeyInfo, loadProfiles, loadSettings, onStorageChanged } from '../storage';
import { getPlatform } from '../platform';

export interface AppData {
  loaded: boolean;
  profiles: UserProfile[];
  settings: AppSettings;
  apiKey: string | null;
  /** API Key 是否保存在本地（重启后保留） */
  apiKeyPersisted: boolean;
  hasPermission: boolean;
  reload: () => Promise<void>;
}

/** 读取 Profile / 设置 / API Key，并在存储变化时自动刷新。 */
export function useAppData(): AppData {
  const [state, setState] = useState<Omit<AppData, 'reload'>>({
    loaded: false,
    profiles: [],
    settings: DEFAULT_SETTINGS,
    apiKey: null,
    apiKeyPersisted: false,
    hasPermission: false,
  });

  const reload = useCallback(async () => {
    const [profiles, settings, keyInfo] = await Promise.all([loadProfiles(), loadSettings(), loadApiKeyInfo()]);
    const hasPermission = settings.llm ? await getPlatform().hasOriginPermission(settings.llm.baseURL) : false;
    setState({
      loaded: true,
      profiles,
      settings,
      apiKey: keyInfo.key,
      apiKeyPersisted: keyInfo.persisted,
      hasPermission,
    });
  }, []);

  useEffect(() => {
    void reload();
    const offStorage = onStorageChanged(() => void reload());
    const offPermissions = getPlatform().onPermissionsChanged(() => void reload());
    return () => {
      offStorage();
      offPermissions();
    };
  }, [reload]);

  return { ...state, reload };
}
