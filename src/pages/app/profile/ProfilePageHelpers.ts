import type { UiLanguagePreference, UiThemePreference } from '../../../app/uiSettings';
import type { User } from '../../../lib/api/users';

export function isUiThemePreference(value: string): value is UiThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function isUiLanguagePreference(value: string): value is UiLanguagePreference {
  return value === 'system' || value === 'en' || value === 'cs';
}

export function userString(user: User | null | undefined, key: keyof User): string {
  const value = user?.[key];
  return typeof value === 'string' ? value : '';
}

export function profileSyncModeLabel(
  t: (key: any) => string,
  mode: 'server' | 'local'
): string {
  return mode === 'server'
    ? t('profile.prefs.persistence.server')
    : t('profile.prefs.persistence.local');
}

export function profileSyncStatusLabel(
  t: (key: any) => string,
  status: 'loading' | 'saving' | 'error' | 'idle'
): string {
  if (status === 'loading') return t('profile.prefs.sync_status.loading');
  if (status === 'saving') return t('profile.prefs.sync_status.saving');
  if (status === 'error') return t('profile.prefs.sync_status.error');
  return t('profile.prefs.sync_status.idle');
}
