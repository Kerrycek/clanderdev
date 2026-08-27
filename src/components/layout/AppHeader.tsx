import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Menu, Search } from 'lucide-react';

import { useAuth } from '../../app/auth';
import { useAppMode } from '../../app/appMode';
import { useObjectScope } from '../../app/objectScope';
import { clusterSearch, type ClusterSearchHit } from '../../lib/api/clusterSearch';
import {
  clusterResourceHref,
  clusterResourceKey,
  clusterResourceRefLabel,
  enrichUserSearchResults,
  normalizeClusterResource,
  parseClusterId,
} from '../../lib/search/clusterSearchResults';
import {
  searchUserObjects,
  type UserGlobalSearchGroup,
} from '../../lib/search/userGlobalSearch';
import { Badge } from '../ui/Badge';
import { clsx } from '../ui/clsx';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import { AppSyncPopover, AppUserMenu, readSessionIdleLimitSeconds } from './AppHeaderMenus';
import type { AppHeaderProps } from './AppHeaderTypes';

export type { AppHeaderProps } from './AppHeaderTypes';

interface InlineSearchResult {
  key: string;
  primary: string;
  secondary: string;
  href: string;
  id?: number;
  resource?: string;
  attribute?: string;
  group?: UserGlobalSearchGroup;
}

function userSearchGroupLabel(group: UserGlobalSearchGroup, t: AppHeaderProps['t']): string {
  if (group === 'vps') return t('palette.group.vps');
  if (group === 'ips') return t('palette.group.ip_addresses');
  return t('palette.group.dns_zones');
}

function inlineResultsFromClusterSearch(basePath: string, t: AppHeaderProps['t'], hits: ClusterSearchHit[]): InlineSearchResult[] {
  const out: InlineSearchResult[] = [];
  const seen = new Set<string>();

  for (const hit of hits ?? []) {
    const resource = normalizeClusterResource(hit.resource);
    const id = parseClusterId(hit.id);
    if (!resource || id === null) continue;

    const href = clusterResourceHref(basePath, resource, id);
    if (!href) continue;

    const key = clusterResourceKey(resource, id);
    if (seen.has(key)) continue;
    seen.add(key);

    const fallback = clusterResourceRefLabel(t, resource, id);
    const primary = String(hit.value ?? hit.label ?? fallback).trim();
    const attr = String(hit.attribute ?? '').trim();

    out.push({
      key,
      primary: primary || fallback,
      secondary: attr ? `${fallback} · ${attr}` : fallback,
      href,
      id,
      resource,
      attribute: attr || undefined,
    });
  }

  return out.slice(0, 8);
}

export function AppHeader(props: AppHeaderProps) {
  const {
    t,
    mode,
    canSwitchMode,
    shortcutHint,
    onOpenMobileNav,
    showSyncIndicator,
    syncRef,
    syncOpen,
    setSyncOpen,
    syncStatus,
    syncTitle,
    syncBody,
    syncError,
    onRetrySync,
    tasksFailedCount,
    tasksActiveCount,
    onOpenTasks,
    userMenuRef,
    userMenuOpen,
    setUserMenuOpen,
    authLogin,
    authRole,
    sessionExpiresAt,
    theme,
    language,
    onSetTheme,
    onSetLanguage,
    onGoToOtherMode,
    onGoToProfile,
    onGoToPublicStatus,
    loginLogoutHref,
  } = props;
  const auth = useAuth();
  const { basePath } = useAppMode();
  const scope = useObjectScope();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<InlineSearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 180);
  const sessionIdleLimitSeconds = readSessionIdleLimitSeconds(auth.user?.preferred_session_length);

  useEffect(() => {
    setSearch('');
    setSearchOpen(false);
    setSearchResults([]);
  }, [location.pathname]);

  const canUseClusterSearch = auth.canUseAdminUi && mode === 'admin';

  useEffect(() => {
    const q = debouncedSearch;
    if (!q || q === '?') {
      setSearchLoading(false);
      setSearchError(null);
      setSearchResults([]);
      return undefined;
    }

    const ac = new AbortController();
    let alive = true;
    setSearchLoading(true);
    setSearchError(null);

    const run = async () => {
      try {
        if (canUseClusterSearch) {
          const res = await clusterSearch({ query: q, signal: ac.signal });
          const results = inlineResultsFromClusterSearch(basePath, t, res.data);
          const enrichedResults = await enrichUserSearchResults(results, t, ac.signal);
          if (!alive || ac.signal.aborted) return;
          setSearchResults(enrichedResults);
          return;
        }

        const results = await searchUserObjects({
          basePath,
          query: q,
          t,
          scopeUserId: scope.mineUserId,
          expectedUserId: typeof auth.user?.id === 'number' ? auth.user.id : undefined,
          limitPerGroup: 4,
          signal: ac.signal,
        });
        if (!alive || ac.signal.aborted) return;
        setSearchResults(results);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!alive || ac.signal.aborted) return;
        setSearchError(String(e?.message ?? e));
        setSearchResults([]);
      } finally {
        if (!alive || ac.signal.aborted) return;
        setSearchLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [auth.user?.id, basePath, canUseClusterSearch, debouncedSearch, mode, scope.mineUserId, t]);

  useEffect(() => {
    setSelectedSearchResult(0);
  }, [debouncedSearch, searchResults.length]);

  const searchStatus = useMemo(() => {
    if (!search.trim()) return t('palette.empty.type_to_search');
    if (searchLoading) return t('palette.loading');
    if (searchError) return `${t('palette.error_prefix')}: ${searchError}`;
    if (searchResults.length === 0) return t('palette.empty.no_results');
    return null;
  }, [search, searchError, searchLoading, searchResults.length, t]);

  const openInlineResult = (result: InlineSearchResult) => {
    navigate(result.href);
    setSearch('');
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg" data-testid="shell.header">
      <div className="flex items-center gap-2 px-4 py-2 md:py-3">
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-overlay-surface shadow-card hover:bg-surface-2 md:hidden"
          onClick={onOpenMobileNav}
          aria-label={t('nav.open')}
          data-testid="shell.mobile-nav-button"
        >
          <Menu size={20} />
        </button>

        <form
          className={clsx(
            'relative order-6 flex h-11 w-12 items-center gap-2 rounded-md border border-border bg-overlay-surface px-3 text-sm shadow-card',
            'focus-within:ring-2 focus-within:ring-accent/40',
            'sm:w-56 md:order-3 md:h-10 md:w-72 lg:w-80'
          )}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const selected = searchResults[selectedSearchResult] ?? searchResults[0];
            if (selected) openInlineResult(selected);
          }}
          onBlur={() => {
            window.setTimeout(() => setSearchOpen(false), 120);
          }}
          data-testid="shell.inline-search"
        >
          <Search size={18} className="shrink-0 text-muted" />
          <input
            value={search}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchOpen(true);
                setSelectedSearchResult((prev) => Math.min(prev + 1, Math.max(0, searchResults.length - 1)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchOpen(true);
                setSelectedSearchResult((prev) => Math.max(prev - 1, 0));
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            placeholder={mode === 'admin' ? t('palette.placeholder.admin') : t('palette.placeholder.user')}
            aria-label={t('search.inline.aria')}
            data-testid="shell.inline-search.input"
          />
          <span className="hidden shrink-0 rounded border border-border bg-surface-2 px-2 py-0.5 text-xs text-faint lg:inline" title={t('palette.shortcut_title')}>
            {shortcutHint}
          </span>

          {searchOpen && (search.trim() || searchResults.length > 0) ? (
            <div
              className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-drawer-md overflow-hidden rounded-md border border-border bg-overlay-surface shadow-panel"
              data-testid="shell.inline-search.results"
              data-overlay="popover"
              data-overlay-surface="overlay"
            >
              {searchResults.length > 0 ? (
                <div className="py-1">
                  {searchResults.map((result, index) => {
                    const showGroup = !canUseClusterSearch && result.group && (
                      index === 0 || searchResults[index - 1]?.group !== result.group
                    );
                    return (
                      <React.Fragment key={result.key}>
                        {showGroup && result.group ? (
                          <div
                            className="border-t border-border px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted first:border-t-0"
                            data-testid={`shell.inline-search.group.${result.group}`}
                          >
                            {userSearchGroupLabel(result.group, t)}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className={clsx(
                            'flex w-full flex-col items-start px-3 py-2 text-left text-sm',
                            index === selectedSearchResult ? 'bg-surface-2' : 'hover:bg-surface-2'
                          )}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setSelectedSearchResult(index)}
                          onClick={() => openInlineResult(result)}
                          data-testid={`shell.inline-search.result.${index}`}
                        >
                          <span className="font-medium text-fg">{result.primary}</span>
                          <span className="text-xs text-muted">{result.secondary}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-2 text-sm text-muted" data-testid="shell.inline-search.status">
                  {searchStatus}
                </div>
              )}
            </div>
          ) : null}
        </form>

        <div className="order-5 flex-1 md:order-4" />

        {canSwitchMode ? (
          <Badge
            variant={mode === 'admin' ? 'black' : 'neutral'}
            testId="scope.indicator"
            title={mode === 'admin' ? t('scope.indicator.admin_hint') : t('scope.indicator.my_hint')}
            className="order-7 md:order-5"
          >
            <span className="md:hidden">
              {mode === 'admin' ? t('scope.indicator.admin_short') : t('scope.indicator.my_short')}
            </span>
            <span className="hidden md:inline">
              {mode === 'admin' ? t('scope.indicator.admin') : t('scope.indicator.my')}
            </span>
          </Badge>
        ) : null}

        {showSyncIndicator ? (
          <AppSyncPopover
            t={t}
            syncRef={syncRef}
            syncOpen={syncOpen}
            setSyncOpen={setSyncOpen}
            syncStatus={syncStatus}
            syncTitle={syncTitle}
            syncBody={syncBody}
            syncError={syncError}
            onRetrySync={onRetrySync}
          />
        ) : null}

        <button
          className={clsx(
            'relative inline-flex h-11 w-12 items-center justify-center rounded-md border border-border bg-overlay-surface text-sm shadow-card hover:bg-surface-2',
            'order-9 md:order-7 sm:h-10 sm:w-auto sm:justify-start sm:gap-2 sm:px-3'
          )}
          onClick={onOpenTasks}
          aria-label={t('common.open_tasks')}
          data-testid="tasks.open-button"
        >
          <Activity size={18} />
          <span className="hidden sm:inline">{t('tasks.title')}</span>

          {tasksFailedCount > 0 || tasksActiveCount > 0 ? (
            <span className="ml-1 hidden items-center gap-1 sm:flex">
              {tasksFailedCount > 0 ? <Badge variant="danger">{tasksFailedCount}</Badge> : null}
              {tasksActiveCount > 0 ? <Badge variant="warn">{tasksActiveCount}</Badge> : null}
            </span>
          ) : null}

          {tasksFailedCount > 0 || tasksActiveCount > 0 ? (
            <span className="absolute -right-1 -top-1 sm:hidden">
              <Badge variant={tasksFailedCount > 0 ? 'danger' : 'warn'}>
                {tasksFailedCount > 0 ? tasksFailedCount : tasksActiveCount}
              </Badge>
            </span>
          ) : null}
        </button>

        <AppUserMenu
          t={t}
          mode={mode}
          canSwitchMode={canSwitchMode}
          userMenuRef={userMenuRef}
          userMenuOpen={userMenuOpen}
          setUserMenuOpen={setUserMenuOpen}
          authLogin={authLogin}
          authRole={authRole}
          sessionExpiresAt={sessionExpiresAt}
          sessionIdleLimitSeconds={sessionIdleLimitSeconds}
          theme={theme}
          language={language}
          onSetTheme={onSetTheme}
          onSetLanguage={onSetLanguage}
          onGoToOtherMode={onGoToOtherMode}
          onGoToProfile={onGoToProfile}
          onGoToPublicStatus={onGoToPublicStatus}
          loginLogoutHref={loginLogoutHref}
        />
      </div>
    </header>
  );
}
