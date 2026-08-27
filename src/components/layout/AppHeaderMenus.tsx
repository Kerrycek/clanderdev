import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Globe, LogOut, User, WifiOff } from 'lucide-react';

import { formatErrorMessage } from '../../lib/errors';
import { Button } from '../ui/Button';
import { clsx } from '../ui/clsx';
import type { AppHeaderProps } from './AppHeaderTypes';

export function AppSyncPopover(props: Pick<AppHeaderProps,
  't' | 'syncRef' | 'syncOpen' | 'setSyncOpen' | 'syncStatus' | 'syncTitle' | 'syncBody' | 'syncError' | 'onRetrySync'
>) {
  const { t, syncRef, syncOpen, setSyncOpen, syncStatus, syncTitle, syncBody, syncError, onRetrySync } = props;
  return (
    <div className="relative order-8 md:order-6" ref={syncRef}>
      <button
        className={clsx(
          'inline-flex h-11 w-12 items-center justify-center rounded-md border border-border bg-overlay-surface text-sm shadow-card hover:bg-surface-2',
          'sm:h-10 sm:w-auto sm:justify-start sm:gap-2 sm:px-3',
          syncStatus === 'offline' ? 'text-danger' : 'text-warn'
        )}
        onClick={() => setSyncOpen((v) => !v)}
        aria-label={syncStatus === 'offline' ? t('sync.offline.indicator') : t('sync.error.indicator')}
        title={syncStatus === 'offline' ? t('sync.offline.indicator') : t('sync.error.indicator')}
        data-testid="shell.sync-indicator"
      >
        {syncStatus === 'offline' ? <WifiOff size={18} /> : <AlertTriangle size={18} />}
        <span className="hidden sm:inline">{syncTitle}</span>
      </button>
      {syncOpen ? (
        <div
          className="absolute right-0 mt-2 w-64 rounded-md border border-border bg-overlay-surface p-2 shadow-panel"
          data-testid="shell.sync-panel"
          data-overlay="popover"
          data-overlay-surface="overlay"
        >
          <div className="px-2 py-1">
            <div className="text-sm font-semibold">{syncTitle}</div>
            <p className="mt-1 text-xs text-muted">{syncBody}</p>
            {syncStatus === 'error' && syncError ? (
              <p className="mt-2 text-xs text-muted" data-testid="shell.sync-panel.last-error">
                {t('sync.error.last_error', { message: formatErrorMessage(syncError) })}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button testId="shell.sync-panel.retry" size="sm" variant="primary" onClick={() => {
                onRetrySync();
                setSyncOpen(false);
              }}>
                {t('common.retry')}
              </Button>
              <Button testId="shell.sync-panel.reload" size="sm" variant="secondary" onClick={() => window.location.reload()}>
                {t('common.reload')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppUserMenu(props: Pick<AppHeaderProps,
  't' | 'mode' | 'canSwitchMode' | 'userMenuRef' | 'userMenuOpen' | 'setUserMenuOpen' | 'authLogin' | 'authRole' |
  'sessionExpiresAt' | 'theme' | 'language' | 'onSetTheme' | 'onSetLanguage' | 'onGoToOtherMode' | 'onGoToProfile' | 'onGoToPublicStatus' | 'loginLogoutHref'
> & { sessionIdleLimitSeconds: number | null }) {
  const {
    t, mode, canSwitchMode, userMenuRef, userMenuOpen, setUserMenuOpen, authLogin, authRole,
    sessionExpiresAt, sessionIdleLimitSeconds, theme, language, onSetTheme, onSetLanguage,
    onGoToOtherMode, onGoToProfile, onGoToPublicStatus, loginLogoutHref,
  } = props;
  const sessionRemaining = useSessionRemainingLabel(t, sessionExpiresAt);
  const sessionIdleLimit = formatSessionIdleLimit(t, sessionIdleLimitSeconds);
  const sessionDisplay = sessionIdleLimit
    ? { menuLabel: t('auth.session_idle.menu_label'), value: sessionIdleLimit }
    : sessionRemaining
      ? { menuLabel: t('auth.session_remaining.menu_label'), value: sessionRemaining }
      : null;

  return (
    <div className="relative order-10 flex items-center gap-2 md:order-8" ref={userMenuRef}>
      {sessionDisplay ? (
        <div
          className={clsx(
            'hidden h-10 items-center gap-1.5 rounded-md border border-border bg-overlay-surface px-2.5 text-xs font-medium text-muted shadow-card',
            'lg:inline-flex'
          )}
          aria-label={`${sessionDisplay.menuLabel}: ${sessionDisplay.value}`}
          title={`${sessionDisplay.menuLabel}: ${sessionDisplay.value}`}
          data-testid="shell.session-remaining"
        >
          <Clock3 size={15} />
          <span>{sessionDisplay.value}</span>
        </div>
      ) : null}
      <button
        className={clsx(
          'inline-flex h-11 w-12 items-center justify-center gap-2 rounded-md border border-border bg-overlay-surface text-sm shadow-card hover:bg-surface-2',
          'sm:h-10 sm:w-auto sm:justify-start sm:px-3'
        )}
        onClick={() => setUserMenuOpen((v) => !v)}
        aria-label={t('user_menu.open')}
        data-testid="shell.user-menu-button"
      >
        <User size={18} />
        <span className="hidden sm:inline font-medium">{authLogin ?? '—'}</span>
        <span className="hidden md:inline text-xs text-muted">{String(authRole ?? '—')}</span>
      </button>

      {userMenuOpen ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-modal w-drawer-md overflow-y-auto overscroll-contain rounded-md border border-border bg-overlay-surface p-2 shadow-panel"
          data-testid="shell.user-menu"
          data-overlay="popover"
          data-overlay-surface="overlay"
        >
          {canSwitchMode ? (
            <div className="px-2 py-1">
              <div className="text-xs text-muted">{t('settings.scope.label')}</div>
              <div className="mt-1 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2">
                <button
                  type="button"
                  data-testid="shell.user-menu.scope.mine"
                  className={segmentedButtonClass(mode === 'user')}
                  onClick={() => {
                    if (mode === 'user') return;
                    setUserMenuOpen(false);
                    onGoToOtherMode();
                  }}
                >
                  {t('settings.scope.mine')}
                </button>
                <button
                  type="button"
                  data-testid="shell.user-menu.scope.all"
                  className={segmentedButtonClass(mode === 'admin')}
                  onClick={() => {
                    if (mode === 'admin') return;
                    setUserMenuOpen(false);
                    onGoToOtherMode();
                  }}
                >
                  {t('settings.scope.all')}
                </button>
              </div>
              <p className={clsx('mt-2 text-xs', mode === 'admin' ? 'text-warn' : 'text-muted')}>
                {mode === 'admin' ? t('scope.indicator.admin_hint') : t('scope.indicator.my_hint')}
              </p>
            </div>
          ) : null}

          <PreferenceSelector
            label={t('settings.theme.label')}
            options={[
              { id: 'system', label: t('settings.theme.system') },
              { id: 'light', label: t('settings.theme.light') },
              { id: 'dark', label: t('settings.theme.dark') },
            ]}
            selected={theme}
            testIdPrefix="shell.user-menu.theme"
            onSelect={(value) => onSetTheme(value as AppHeaderProps['theme'])}
          />
          <PreferenceSelector
            label={t('settings.language.label')}
            options={[
              { id: 'system', label: t('settings.language.system') },
              { id: 'en', label: 'EN', title: t('settings.language.en') },
              { id: 'cs', label: 'CS', title: t('settings.language.cs') },
            ]}
            selected={language}
            testIdPrefix="shell.user-menu.language"
            onSelect={(value) => onSetLanguage(value as AppHeaderProps['language'])}
          />

          <div className="mt-2 border-t border-border pt-2">
            <UserMenuButton icon={<User size={16} />} testId="shell.user-menu.account" onClick={() => {
              setUserMenuOpen(false);
              onGoToProfile();
            }}>{t('user_menu.account')}</UserMenuButton>
            <UserMenuButton className="mt-1" icon={<Globe size={16} />} testId="shell.user-menu.public-status" onClick={() => {
              setUserMenuOpen(false);
              onGoToPublicStatus();
            }}>{t('user_menu.public_status')}</UserMenuButton>
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <a
              data-testid="shell.user-menu.logout"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-2"
              href={loginLogoutHref}
            >
              <LogOut size={16} />
              <span>{t('user_menu.logout')}</span>
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreferenceSelector(props: {
  label: string;
  options: Array<{ id: string; label: string; title?: string }>;
  selected: string;
  testIdPrefix: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mt-2 border-t border-border px-2 pt-2">
      <div className="text-xs text-muted">{props.label}</div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {props.options.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid={`${props.testIdPrefix}.${option.id}`}
            title={option.title}
            className={segmentedButtonClass(option.id === props.selected)}
            onClick={() => props.onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserMenuButton(props: {
  children: React.ReactNode;
  className?: string;
  icon: React.ReactNode;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-2', props.className)}
      onClick={props.onClick}
      data-testid={props.testId}
    >
      {props.icon}
      <span>{props.children}</span>
    </button>
  );
}

function segmentedButtonClass(active: boolean) {
  return clsx(
    'inline-flex min-h-8 w-full min-w-0 items-center justify-center rounded-md border px-2 py-1 text-center text-xs font-medium leading-tight transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg',
    active ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover' : 'border-border bg-surface text-fg hover:bg-surface-2'
  );
}

function formatSessionRemaining(t: AppHeaderProps['t'], expiresAt: number, now: number): string {
  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) return t('auth.session_remaining.expired');
  if (remainingMs < 60_000) return t('auth.session_remaining.less_than_minute');
  const minutesTotal = Math.ceil(remainingMs / 60_000);
  if (minutesTotal < 60) return t('auth.session_remaining.minutes', { minutes: minutesTotal });
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return minutes === 0
    ? t('auth.session_remaining.hours', { hours })
    : t('auth.session_remaining.hours_minutes', { hours, minutes });
}

function useSessionRemainingLabel(t: AppHeaderProps['t'], expiresAt?: number): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  return formatSessionRemaining(t, expiresAt, now);
}

export function readSessionIdleLimitSeconds(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function formatSessionIdleLimit(t: AppHeaderProps['t'], seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds === 0) return t('security.settings.session_length.preset.never');
  if (seconds < 60) return t('auth.session_remaining.less_than_minute');
  const minutesTotal = Math.ceil(seconds / 60);
  if (minutesTotal < 60) return t('auth.session_remaining.minutes', { minutes: minutesTotal });
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return minutes === 0
    ? t('auth.session_remaining.hours', { hours })
    : t('auth.session_remaining.hours_minutes', { hours, minutes });
}
