import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { useAppMode } from '../../../app/appMode';
import { useObjectScope } from '../../../app/objectScope';
import { useI18n } from '../../../app/i18n';
import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { SyncStaleBanner } from '../../../components/layout/SyncStaleBanner';
import { PageHeader } from '../../../components/layout/PageHeader';
import { fetchDatasets, type Dataset } from '../../../lib/api/datasets';
import { searchUsers } from '../../../lib/api/users';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { objectStateBadge } from '../../../lib/taskStatus';
import { dotVariantFromBadgeVariant, dotVariantFromRowVariant } from '../../../lib/variantMap';
import { parsePositiveInt } from '../../../lib/parse';
import {
  parseNumericToken,
  splitKeyValueToken,
  tokenizeSmartInput,
  unquoteSmartValue,
} from '../../../lib/smartFilter';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { FilterChip } from '../../../components/ui/FilterChip';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../components/ui/LoadingState';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { VpsLookupInput } from '../../../components/ui/VpsLookupInput';
import { toneSurfaceClass } from '../../../components/ui/tone';

import { DatasetUsage } from './DatasetUsage';

function datasetLabel(ds: Dataset): string {
  const label = ds.full_name ?? ds.name ?? ds.label;
  return String(label ?? `#${ds.id}`);
}

function datasetObjectState(ds: Dataset): string {
  return String((ds as any).object_state ?? '').trim();
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function canonicalKey(raw: string): 'q' | 'user' | 'vps' | 'id' | null {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!k) return null;

  if (k === 'q' || k === 'query' || k === 'search') return 'q';
  if (k === 'user' || k === 'owner') return 'user';
  if (k === 'vps' || k === 'vm') return 'vps';
  if (k === 'id') return 'id';

  return null;
}

export interface DatasetsListPageProps {
  rolePreset?: "primary" | "hypervisor";
  titleKey?: string;
  descriptionKey?: string;
  searchPlaceholderKey?: string;
  loadErrorTitleKey?: string;
  emptyTitleKey?: string;
  emptyBodyKey?: string;
  showVpsFilter?: boolean;
  showOwnerColumn?: boolean;
  headerActions?: React.ReactNode;
}

export function DatasetsListPage(props: DatasetsListPageProps = {}) {
  const rolePreset = props.rolePreset;
  const titleKey = props.titleKey ?? 'datasets.list.title';
  const descriptionKey = props.descriptionKey ?? 'datasets.list.description';
  const searchPlaceholderKey = props.searchPlaceholderKey ?? 'datasets.list.search.placeholder';
  const loadErrorTitleKey = props.loadErrorTitleKey ?? 'datasets.list.load_error.title';
  const emptyTitleKey = props.emptyTitleKey ?? 'datasets.list.empty';
  const emptyBodyKey = props.emptyBodyKey;
  const showVpsFilter = props.showVpsFilter ?? true;
  const requestedOwnerColumn = props.showOwnerColumn ?? false;
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const qText = (searchParams.get('q') ?? '').trim();
  const userRaw = (searchParams.get('user') ?? '').trim();
  const vpsRaw = (searchParams.get('vps') ?? '').trim();

  const userIdNum = useMemo(() => (mode === 'admin' ? parsePositiveInt(userRaw) : undefined), [mode, userRaw]);
  const vpsIdNum = useMemo(() => parsePositiveInt(vpsRaw), [vpsRaw]);
  const showOwnerColumn = requestedOwnerColumn && mode === 'admin';
  const listId = rolePreset === 'primary' ? 'nas.list' : 'datasets.list';
  const detailSection = rolePreset === 'primary' ? 'nas' : 'datasets';
  const includes = showOwnerColumn ? 'user' : showVpsFilter ? 'vps' : undefined;

  // URL hygiene: keep unsupported/invalid params from lingering.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    if (mode !== 'admin' && next.get('user')) {
      next.delete('user');
      changed = true;
    }

    if (mode === 'admin') {
      const u = next.get('user');
      if (u && parsePositiveInt(u) === undefined) {
        next.delete('user');
        changed = true;
      }
    }

    const v = next.get('vps');
    if (!showVpsFilter && v) {
      next.delete('vps');
      changed = true;
    } else if (showVpsFilter && v && parsePositiveInt(v) === undefined) {
      next.delete('vps');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
  }, [mode, searchParams, setSearchParams, showVpsFilter]);

  const pagination = useKeysetPagination({
    id: listId,
    filterKey: JSON.stringify({
      basePath,
      q: qText,
      user: mode === 'admin' ? userIdNum ?? null : scope.mineUserId ?? null,
      vps: showVpsFilter ? vpsIdNum ?? null : null,
      role: rolePreset ?? null,
      scope: scope.scope,
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const datasetsQ = useQuery({
    queryKey: [
      'datasets',
      'index',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qText || null,
        user: mode === 'admin' ? userIdNum ?? null : scope.mineUserId ?? null,
        vps: showVpsFilter ? vpsIdNum ?? null : null,
        role: rolePreset ?? null,
        includes,
      },
    ],
    queryFn: async () => (
      await fetchDatasets({
        limit: pagination.limit,
        fromId: pagination.fromId,
        includes,
        q: qText || undefined,
        user: mode === 'admin' ? userIdNum : scope.mineUserId,
        vps: showVpsFilter ? vpsIdNum || undefined : undefined,
        role: rolePreset,
      })
    ).data,
  });

  const rows = datasetsQ.data ?? [];
  const showSnapshotColumn = rows.some((ds) => hasValue(ds.snapshots_count));
  const showMountColumn = rows.some((ds) => hasValue(ds.mount_count));
  const showExportColumn = rows.some((ds) => hasValue(ds.export_count));
  const showStateColumn = rows.some((ds) => hasValue((ds as any).object_state));
  const showRelatedMeta = showSnapshotColumn || showMountColumn || showExportColumn;

  const pageCursor = useMemo(() => cursorFromDescendingPage(rows as any), [rows]);
  const hasMore = rows.length >= pagination.limit;

  const filtersActive = Boolean(qText) || Boolean(userIdNum !== undefined) || Boolean(showVpsFilter && vpsIdNum !== undefined);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    // Keep the URL stable across rerenders.
    return window.location.href;
  }, [searchParams.toString()]);

  function setTextParam(key: string, value: string | undefined) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const v = String(value ?? '').trim();
      if (v) next.set(key, v);
      else next.delete(key);
      return next;
    });
  }

  function datasetRowVariant(ds: Dataset, stateVariant: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'black') {
    if (stateVariant === 'danger') return 'danger' as const;
    if (stateVariant === 'warn') return 'warn' as const;

    const used = typeof ds.used === 'number' && Number.isFinite(ds.used) ? (ds.used as number) : undefined;
    const quota =
      typeof ds.refquota === 'number' && Number.isFinite(ds.refquota) && (ds.refquota as number) > 0
        ? (ds.refquota as number)
        : undefined;

    if (used !== undefined && quota !== undefined && used > quota) return 'danger' as const;
    if (used !== undefined && quota !== undefined && quota > 0 && used / quota >= 0.9) return 'warn' as const;

    return undefined;
  }

  function clearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('user');
      next.delete('vps');
      return next;
    });
    setSmart('');
    setSmartErrors([]);
  }

  async function openDatasetById(id: number) {
    navigate(`${basePath}/${detailSection}/${id}`);
  }

  // Smart filter input
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();

  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Optional admin-mode user suggestions for convenience.
  const userSuggestQ = useQuery({
    queryKey: ['users', 'search', { q: smartNeedle }],
    enabled: mode === 'admin' && smartNeedle.length >= 2 && !smartNeedle.includes(':') && parseNumericToken(smartNeedle) === null,
    queryFn: async () => (await searchUsers({ q: smartNeedle, limit: 8 })).data,
  });

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const out: SmartFilterSuggestion[] = [];
    const needle = smartNeedle;
    if (!needle) return out;

    if (needle === '?') {
      out.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'datasets.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num !== null) {
      out.push({
        id: `open.${num}`,
        primary: t('datasets.smart.suggest.open_dataset', { id: num }),
        secondary: t('datasets.smart.suggest.open_dataset.secondary'),
        onPick: () => {
          void openDatasetById(num);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'datasets.smart.suggest.open_dataset',
      });


      if (showVpsFilter) {
        out.push({
          id: `vps.${num}`,
          primary: `vps:${num}`,
          secondary: t('datasets.smart.suggest.vps_id'),
          onPick: () => {
            setTextParam('vps', String(num));
            setSmart('');
            setSmartErrors([]);
          },
        });
      }

      if (mode === 'admin') {
        out.push({
          id: `user.${num}`,
          primary: `user:${num}`,
          secondary: t('datasets.smart.suggest.user_id'),
          onPick: () => {
            setTextParam('user', String(num));
            setSmart('');
            setSmartErrors([]);
          },
        });
      }

      return out;
    }

    if (needle.includes(':')) {
      out.push({
        id: 'apply',
        primary: t('filters.smart.suggest.apply.primary'),
        secondary: t('filters.smart.suggest.apply.secondary'),
        onPick: () => void applySmartText(needle),
        testId: 'datasets.smart.suggest.apply',
      });
      return out;
    }

    out.push({
      id: 'search',
      primary: t('datasets.smart.suggest.search', { q: needle }),
      secondary: t('datasets.smart.suggest.search.secondary'),
      onPick: () => {
        setTextParam('q', needle);
        setSmart('');
        setSmartErrors([]);
      },
      testId: 'datasets.smart.suggest.search',
    });

    if (mode === 'admin') {
      const users = userSuggestQ.data ?? [];
      for (const u of users.slice(0, 5)) {
        out.push({
          id: `user.login.${u.id}`,
          primary: t('filters.smart.suggest.user_login', { login: u.login }),
          secondary: `#${u.id}`,
          onPick: () => {
            setTextParam('user', String(u.id));
            setSmart('');
            setSmartErrors([]);
          },
        });
      }
    }

    return out;
  }, [mode, showVpsFilter, smartNeedle, t, userSuggestQ.data]);

  async function applySmartText(raw: string) {
    const input = raw.trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input)
      .map((x) => x.trim())
      .filter(Boolean);

    // Pure numeric → open dataset by id.
    const firstToken = tokens[0];
    const numericOnly = tokens.length === 1 && firstToken ? parseNumericToken(firstToken) : null;
    if (numericOnly !== null) {
      setSmart('');
      setSmartErrors([]);
      void openDatasetById(numericOnly);
      return;
    }

    let nextQ = qText;
    let nextUser = userRaw;
    let nextVps = vpsRaw;

    let touchedQ: string | null = null;

    const free: string[] = [];
    const errors: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (kv) {
        const key = canonicalKey(kv.rawKey);
        const value = unquoteSmartValue(kv.rawValue);

        if (!key) {
          errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
          continue;
        }

        if (!value.trim()) {
          errors.push(t('filters.smart.error.missing_value', { key: kv.rawKey }));
          continue;
        }

        if (key === 'q') {
          touchedQ = value;
          continue;
        }

        if (key === 'id') {
          const n = parseNumericToken(value);
          if (n === null) {
            errors.push(t('filters.smart.error.numeric_only', { key: kv.rawKey, value }));
            continue;
          }
          setSmart('');
          setSmartErrors([]);
          void openDatasetById(n);
          return;
        }

        if (key === 'user') {
          if (mode !== 'admin') {
            errors.push(t('filters.smart.error.admin_only', { key: 'user' }));
            continue;
          }

          const n = parseNumericToken(value);
          if (n !== null) {
            nextUser = String(n);
            continue;
          }

          const users = (await searchUsers({ q: value, limit: 10 })).data;
          const exact = users.filter((u) => u.login.toLowerCase() === value.toLowerCase());
          const [resolvedUser] = exact;
          if (resolvedUser) {
            nextUser = String(resolvedUser.id);
            continue;
          }

          errors.push(t('filters.smart.error.user_unresolved', { value }));
          continue;
        }

        if (key === 'vps') {
          if (!showVpsFilter) {
            errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
            continue;
          }
          const n = parseNumericToken(value);
          if (n !== null) {
            nextVps = String(n);
            continue;
          }

          errors.push(t('filters.smart.error.numeric_only', { key: kv.rawKey, value }));
          continue;
        }

        continue;
      }

      free.push(unquoteSmartValue(token));
    }

    if (free.length > 0) {
      touchedQ = touchedQ ? `${touchedQ} ${free.join(' ')}` : free.join(' ');
    }

    if (errors.length > 0) {
      setSmartErrors(errors);
      return;
    }

    if (touchedQ !== null) nextQ = touchedQ;

    setTextParam('q', nextQ || undefined);
    if (mode === 'admin') setTextParam('user', nextUser || undefined);
    if (showVpsFilter) setTextParam('vps', nextVps || undefined);

    setSmart('');
    setSmartErrors([]);
  }

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    if (qText.trim()) {
      chips.push(
        <FilterChip
          key="q"
          label={`q:${qText.trim()}`}
          tone="neutral"
          onRemove={() => setTextParam('q', undefined)}
          testId="datasets.chip.q"
        />
      );
    }

    if (mode === 'admin' && userIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="user"
          label={`user:${userIdNum}`}
          tone="neutral"
          onRemove={() => setTextParam('user', undefined)}
          testId="datasets.chip.user"
        />
      );
    }

    if (showVpsFilter && vpsIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="vps"
          label={`vps:${vpsIdNum}`}
          tone="neutral"
          onRemove={() => setTextParam('vps', undefined)}
          testId="datasets.chip.vps"
        />
      );
    }

    return chips;
  }, [mode, qText, userIdNum, vpsIdNum, showVpsFilter]);

  return (
    <ListShell
      testId="datasets.list"
      banner={<SyncStaleBanner />}
      header={
        <PageHeader
          testId="datasets.list.header"
          title={t(titleKey)}
          description={t(descriptionKey)}
          meta={filtersActive ? t('list.meta.filters_active') : undefined}
          actions={
            <>
              {props.headerActions}
              <Button variant="secondary" size="sm" onClick={() => void datasetsQ.refetch()} testId="datasets.list.refresh">
                {t('common.refresh')}
              </Button>
            </>
          }
        />
      }
      filters={
        <FilterBar testId="datasets.list.filters">
          <div className="w-full sm:max-w-xl">
            <SmartFilterInput
              value={smart}
              onChange={(v) => {
                setSmart(v);
                if (smartErrors.length > 0) setSmartErrors([]);
              }}
              placeholder={t(searchPlaceholderKey)}
              testId="datasets.search.input"
              suggestions={smartSuggestions}
              onSubmit={() => void applySmartText(smart)}
              errors={smartErrors}
              suffix={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 px-0"
                  onClick={() => setHelpOpen(true)}
                  aria-label={t('filters.help.open')}
                  title={t('filters.help.open')}
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                </Button>
              }
            />

            {activeFilterChips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1" data-testid="datasets.active_filters">
                {activeFilterChips}
              </div>
            ) : null}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdvancedOpen(true)}
            aria-label={t('filters.advanced.open')}
            title={t('filters.advanced.open')}
            testId="datasets.filters.advanced.open"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
          </Button>

          <CopyButton
            size="sm"
            variant="secondary"
            label={t('common.copy_link')}
            text={shareUrl}
            testId="datasets.copy_link"
          />

          {filtersActive ? (
            <Button variant="secondary" size="sm" onClick={clearFilters} testId="datasets.filter.clear">
              {t('common.clear_filters')}
            </Button>
          ) : null}
        </FilterBar>
      }
    >
      {datasetsQ.isLoading ? (
        <LoadingState testId="datasets.list.loading" />
      ) : datasetsQ.isError ? (
        <ErrorState
          testId="datasets.list.error"
          title={t(loadErrorTitleKey)}
          error={datasetsQ.error}
          onRetry={() => void datasetsQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'datasets.list', scope: scope.scope }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          testId="datasets.list.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t(emptyTitleKey)}
          body={filtersActive ? t('empty.list.no_matches.body') : emptyBodyKey ? t(emptyBodyKey) : undefined}
          actionLabel={filtersActive ? t('common.clear_filters') : undefined}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((ds) => {
              const rawState = datasetObjectState(ds);
              const state = rawState ? objectStateBadge(rawState, t) : null;
              const rowVariant = datasetRowVariant(ds, state?.variant ?? 'neutral');
              const dotVariant = dotVariantFromRowVariant(rowVariant) ?? dotVariantFromBadgeVariant(state?.variant ?? 'neutral');
              const label = datasetLabel(ds);
              const vpsId =
                ds.vps && typeof ds.vps === 'object' && 'id' in ds.vps ? Number((ds.vps as any).id) : undefined;
              const vpsHostname = ds.vps && typeof ds.vps === 'object' ? String((ds.vps as any).hostname ?? '') : '';
              const ownerId =
                ds.user && typeof ds.user === 'object' && 'id' in ds.user ? Number((ds.user as any).id) : undefined;
              const ownerLogin = ds.user && typeof ds.user === 'object' ? String((ds.user as any).login ?? '') : '';

              return (
                <Card key={ds.id} testId={`datasets.card.${ds.id}`} className={toneSurfaceClass(rowVariant)}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusDot variant={dotVariant} testId={`datasets.card.${ds.id}.dot`} />
                          <Link
                            className="block truncate text-base font-semibold text-accent hover:underline"
                            to={`${basePath}/${detailSection}/${ds.id}`}
                          >
                            {label}
                          </Link>
                        </div>
                        <div className="mt-0.5 text-xs text-faint">#{ds.id}</div>
                      </div>
                      {state ? <Badge variant={state.variant}>{state.label}</Badge> : null}
                    </div>

                    <div className="mt-3">
                      <DatasetUsage used={ds.used} refquota={ds.refquota} avail={ds.avail} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {showOwnerColumn ? (
                        <span>
                          {t('common.user')}: 
                          {ownerId ? (
                            <Link className="text-accent hover:underline" to={`${basePath}/users/${ownerId}`}>
                              {ownerLogin ? ownerLogin : `#${ownerId}`}
                            </Link>
                          ) : (
                            <span className="text-faint">{t('common.na')}</span>
                          )}
                        </span>
                      ) : showVpsFilter ? (
                        vpsId ? (
                          <span>
                            {t('common.vps')}: 
                            <Link className="text-accent hover:underline" to={`${basePath}/vps/${vpsId}`}>
                              {vpsHostname ? vpsHostname : `#${vpsId}`}
                            </Link>
                          </span>
                        ) : (
                          <span className="text-faint">
                            {t('common.vps')}: {t('common.na')}
                          </span>
                        )
                      ) : null}
                      {showRelatedMeta && showSnapshotColumn ? (
                        <span>
                          {t('dataset.field.snapshots')}: {ds.snapshots_count ?? 0}
                        </span>
                      ) : null}
                      {showRelatedMeta && showMountColumn ? (
                        <span>
                          {t('dataset.field.mounts')}: {ds.mount_count ?? 0}
                        </span>
                      ) : null}
                      {showRelatedMeta && showExportColumn ? (
                        <span>
                          {t('dataset.field.exports')}: {ds.export_count ?? 0}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="md:hidden">
            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={pagination.hasForward || (hasMore && pageCursor !== null)}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="datasets.pagination.mobile"
            />
          </Card>

          {/* Desktop: table */}
          <TableCard
            className="hidden md:block"
            minWidth="md"
            footer={
              <KeysetPagination
                page={pagination.page}
                pageCount={pagination.stack.length}
                canPrev={pagination.canPrev}
                canNext={pagination.hasForward || (hasMore && pageCursor !== null)}
                onPrev={pagination.goPrev}
                onNext={() => pagination.goNext(pageCursor)}
                onGoToPage={pagination.goToPage}
                limit={pagination.limit}
                allowedLimits={pagination.allowedLimits}
                onLimitChange={pagination.setLimit}
                testId="datasets.pagination.desktop"
              />
            }
          >
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-8 px-3 py-2"><span className="sr-only">{t('common.state')}</span></th>
                <th className="px-3 py-2">{t('common.name')}</th>
                {showOwnerColumn ? <th className="px-3 py-2">{t('common.user')}</th> : showVpsFilter ? <th className="px-3 py-2">{t('common.vps')}</th> : null}
                <th className="px-3 py-2">{t('dataset.field.usage')}</th>
                {showSnapshotColumn ? <th className="px-3 py-2">{t('dataset.field.snapshots')}</th> : null}
                {showMountColumn ? <th className="px-3 py-2">{t('dataset.field.mounts')}</th> : null}
                {showExportColumn ? <th className="px-3 py-2">{t('dataset.field.exports')}</th> : null}
                {showStateColumn ? <th className="px-3 py-2">{t('common.state')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((ds) => {
                const rawState = datasetObjectState(ds);
                const state = rawState ? objectStateBadge(rawState, t) : null;
                const rowVariant = datasetRowVariant(ds, state?.variant ?? 'neutral');
                const dotVariant = dotVariantFromRowVariant(rowVariant) ?? dotVariantFromBadgeVariant(state?.variant ?? 'neutral');
                const label = datasetLabel(ds);
                const vpsId =
                  ds.vps && typeof ds.vps === 'object' && 'id' in ds.vps ? Number((ds.vps as any).id) : undefined;
                const vpsHostname = ds.vps && typeof ds.vps === 'object' ? String((ds.vps as any).hostname ?? '') : '';
                const ownerId =
                  ds.user && typeof ds.user === 'object' && 'id' in ds.user ? Number((ds.user as any).id) : undefined;
                const ownerLogin = ds.user && typeof ds.user === 'object' ? String((ds.user as any).login ?? '') : '';

                return (
                  <TableRowLink
                    key={ds.id}
                    testId={`datasets.row.${ds.id}`}
                    to={`${basePath}/${detailSection}/${ds.id}`}
                    variant={rowVariant}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="px-3 py-2 align-top">
                      <StatusDot variant={dotVariant} testId={`datasets.row.${ds.id}.dot`} />
                    </td>
                    <td className="px-3 py-2">
                      <Link className="font-medium text-accent hover:underline" to={`${basePath}/${detailSection}/${ds.id}`}>
                        {label}
                      </Link>
                      <div className="mt-0.5 text-xs text-faint">#{ds.id}</div>
                    </td>
                    {showOwnerColumn ? (
                      <td className="px-3 py-2">
                        {ownerId ? (
                          <Link className="text-accent hover:underline" to={`${basePath}/users/${ownerId}`}>
                            {ownerLogin ? ownerLogin : `#${ownerId}`}
                          </Link>
                        ) : (
                          <span className="text-faint">{t('common.na')}</span>
                        )}
                      </td>
                    ) : showVpsFilter ? (
                      <td className="px-3 py-2">
                        {vpsId ? (
                          <Link className="text-accent hover:underline" to={`${basePath}/vps/${vpsId}`}>
                            {vpsHostname ? vpsHostname : `#${vpsId}`}
                          </Link>
                        ) : (
                          <span className="text-faint">{t('common.na')}</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <DatasetUsage used={ds.used} refquota={ds.refquota} avail={ds.avail} />
                    </td>
                    {showSnapshotColumn ? <td className="px-3 py-2">{ds.snapshots_count ?? 0}</td> : null}
                    {showMountColumn ? <td className="px-3 py-2">{ds.mount_count ?? 0}</td> : null}
                    {showExportColumn ? <td className="px-3 py-2">{ds.export_count ?? 0}</td> : null}
                    {showStateColumn ? (
                      <td className="px-3 py-2">
                        {state ? <Badge variant={state.variant}>{state.label}</Badge> : <span className="text-faint">—</span>}
                      </td>
                    ) : null}
                  </TableRowLink>
                );
              })}
            </tbody>
          </TableCard>
        </>
      )}

      <SmartInputHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('datasets.smart_help.title')}
        intro={t('datasets.smart_help.intro')}
        items={[
          {
            key: '?',
            description: t('datasets.smart_help.items.help'),
          },
          {
            key: '123',
            description: t('datasets.smart_help.items.open'),
          },
          {
            key: 'q:foo',
            description: t('datasets.smart_help.items.q'),
          },
          ...(mode === 'admin'
            ? [
                {
                  key: 'user:alice',
                  description: t('datasets.smart_help.items.user'),
                },
              ]
            : []),
          ...(showVpsFilter
            ? [
                {
                  key: 'vps:101',
                  description: t('datasets.smart_help.items.vps'),
                },
              ]
            : []),
          {
            key: 'foo bar',
            description: t('datasets.smart_help.items.free'),
          },
        ]}
        footnote={t('datasets.smart_help.footnote')}
      />

      <Drawer open={advancedOpen} onClose={() => setAdvancedOpen(false)} title={t('filters.advanced.title')} width="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">{t('datasets.advanced.q.label')}</label>
            <div className="mt-1">
              <Input
                value={qText}
                onChange={(e) => setTextParam('q', e.target.value)}
                placeholder={t('datasets.advanced.q.placeholder')}
                testId="datasets.advanced.q"
              />
            </div>
          </div>

          {mode === 'admin' ? (
            <div>
              <label className="block text-sm font-medium">{t('datasets.advanced.user.label')}</label>
              <div className="mt-1">
                <UserLookupInput
                  value={userIdNum}
                  onChange={(id) => setTextParam('user', id ? String(id) : undefined)}
                  placeholder={t('datasets.advanced.user.placeholder')}
                  testId="datasets.advanced.user"
                />
              </div>
            </div>
          ) : null}

          {showVpsFilter ? (
            <div>
              <label className="block text-sm font-medium">{t('datasets.advanced.vps.label')}</label>
              <div className="mt-1">
                <VpsLookupInput
                  value={vpsIdNum ?? null}
                  onChange={(id) => setTextParam('vps', id ? String(id) : undefined)}
                  userId={mode === 'admin' ? (userIdNum ?? undefined) : scope.mineUserId ?? undefined}
                  placeholder={t('datasets.advanced.vps.placeholder')}
                  testId="datasets.advanced.vps"
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={clearFilters} disabled={!filtersActive} testId="datasets.advanced.clear">
              {t('common.clear_filters')}
            </Button>

            <Button variant="primary" onClick={() => setAdvancedOpen(false)} testId="datasets.advanced.close">
              {t('common.close')}
            </Button>
          </div>

          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-faint">
            {t('datasets.advanced.note')}
          </div>
        </div>
      </Drawer>
    </ListShell>
  );
}
