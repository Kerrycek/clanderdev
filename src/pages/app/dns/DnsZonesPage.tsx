import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleHelp, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';

import { useAppMode } from '../../../app/appMode';
import { useObjectScope } from '../../../app/objectScope';
import { useI18n } from '../../../app/i18n';
import { fetchDnsZones, createDnsZone, type DnsZone } from '../../../lib/api/dns';
import { formatErrorMessage } from '../../../lib/errors';
import { searchUsers } from '../../../lib/api/users';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { parseBoolParam, parsePositiveInt } from '../../../lib/parse';
import {
  parseNumericToken,
  splitKeyValueToken,
  tokenizeSmartInput,
  unquoteSmartValue,
} from '../../../lib/smartFilter';
import { dotVariantFromBadgeVariant, dotVariantFromRowVariant } from '../../../lib/variantMap';

import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { SyncStaleBanner } from '../../../components/layout/SyncStaleBanner';
import { PageHeader } from '../../../components/layout/PageHeader';

import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { FilterChip } from '../../../components/ui/FilterChip';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LinkButton } from '../../../components/ui/LinkButton';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../components/ui/SmartInputHelp';
import { StatusDot } from '../../../components/ui/StatusDot';
import { TableCard } from '../../../components/ui/TableCard';
import { TableRowLink } from '../../../components/ui/TableRowLink';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { toneSurfaceClass } from '../../../components/ui/tone';
import {
  canonicalDnsZoneName,
  canonicalKey,
  isValidDnsZoneEmail,
  normalizeRole,
  normalizeSource,
  roleLabel,
  sourceLabel,
  zoneName,
} from './dnsZoneListSemantics';

export function DnsZonesPage() {
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const enabledBadge = (enabled: boolean | undefined) => {
    if (enabled === true) return <Badge variant="ok">{t('common.enabled')}</Badge>;
    if (enabled === false) return <Badge variant="warn">{t('common.disabled')}</Badge>;
    return <Badge variant="neutral">—</Badge>;
  };

  const dnssecBadge = (enabled: boolean | undefined) => {
    if (enabled === true) return <Badge variant="ok">{t('dns.zones.badge.dnssec')}</Badge>;
    if (enabled === false) return <Badge variant="neutral">{t('dns.zones.badge.no_dnssec')}</Badge>;
    return <Badge variant="neutral">—</Badge>;
  };

  function zoneRowVariant(zone: DnsZone) {
    if (zone.enabled === false) return 'warn' as const;
    return undefined;
  }

  function zoneDotVariant(zone: DnsZone) {
    const rowVariant = zoneRowVariant(zone);
    return dotVariantFromRowVariant(rowVariant) ?? dotVariantFromBadgeVariant(zone.enabled === true ? 'ok' : zone.enabled === false ? 'warn' : 'neutral');
  }

  // Active filters from URL
  const qText = (searchParams.get('q') ?? '').trim();
  const userRaw = (searchParams.get('user') ?? '').trim();
  const enabledRaw = (searchParams.get('enabled') ?? '').trim();
  const dnssecRaw = (searchParams.get('dnssec') ?? '').trim();
  const roleRaw = (searchParams.get('role') ?? '').trim();
  const sourceRaw = (searchParams.get('source') ?? '').trim();

  const userIdNum = useMemo(() => (mode === 'admin' ? parsePositiveInt(userRaw) : undefined), [mode, userRaw]);
  const enabledVal = useMemo(() => parseBoolParam(enabledRaw), [enabledRaw]);
  const dnssecVal = useMemo(() => parseBoolParam(dnssecRaw), [dnssecRaw]);
  const roleVal = useMemo(() => normalizeRole(roleRaw), [roleRaw]);
  const sourceVal = useMemo(() => normalizeSource(sourceRaw), [sourceRaw]);

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

    const en = next.get('enabled');
    if (en && parseBoolParam(en) === undefined) {
      next.delete('enabled');
      changed = true;
    }

    const ds = next.get('dnssec');
    if (ds && parseBoolParam(ds) === undefined) {
      next.delete('dnssec');
      changed = true;
    }

    const r = next.get('role');
    if (r && normalizeRole(r) === undefined) {
      next.delete('role');
      changed = true;
    }

    const s = next.get('source');
    if (s && normalizeSource(s) === undefined) {
      next.delete('source');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
  }, [mode, searchParams, setSearchParams]);

  const filtersActive =
    Boolean(qText) ||
    (mode === 'admin' && userIdNum !== undefined) ||
    enabledVal !== undefined ||
    dnssecVal !== undefined ||
    roleVal !== undefined ||
    sourceVal !== undefined;

  const pagination = useKeysetPagination({
    id: 'dns.zones.list',
    filterKey: JSON.stringify({
      basePath,
      q: qText,
      user: mode === 'admin' ? userIdNum ?? null : scope.mineUserId ?? null,
      enabled: enabledVal ?? null,
      dnssec: dnssecVal ?? null,
      role: roleVal ?? null,
      source: sourceVal ?? null,
      scope: scope.scope,
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const zonesQ = useQuery({
    queryKey: [
      'dnsZones',
      'index',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qText || null,
        user: mode === 'admin' ? userIdNum ?? null : scope.mineUserId ?? null,
        enabled: enabledVal ?? null,
        dnssec: dnssecVal ?? null,
        role: roleVal ?? null,
        source: sourceVal ?? null,
      },
    ],
    queryFn: async () => (
      await fetchDnsZones({
        limit: pagination.limit,
        fromId: pagination.fromId,
        q: qText || undefined,
        user: mode === 'admin' ? userIdNum : scope.mineUserId,
        enabled: enabledVal,
        dnssec_enabled: dnssecVal,
        role: roleVal,
        source: sourceVal,
      })
    ).data,
  });

  const rows = zonesQ.data ?? [];
  const pageCursor = useMemo(() => cursorFromDescendingPage(rows as any), [rows]);
  const hasMore = rows.length >= pagination.limit;

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
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
  function clearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('user');
      next.delete('enabled');
      next.delete('dnssec');
      next.delete('role');
      next.delete('source');
      return next;
    });
    setSmart('');
    setSmartErrors([]);
  }

  async function openZoneById(id: number) {
    navigate(`${basePath}/dns/zones/${id}`);
  }

  // Smart filter input
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();

  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        testId: 'dns.zones.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num !== null) {
      out.push({
        id: `open.${num}`,
        primary: t('dns.zones.smart.suggest.open_zone', { id: num }),
        secondary: t('dns.zones.smart.suggest.open_zone.secondary'),
        onPick: () => {
          void openZoneById(num);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'dns.zones.smart.suggest.open_zone',
      });

      if (mode === 'admin') {
        out.push({
          id: `user.${num}`,
          primary: `user:${num}`,
          secondary: t('dns.zones.smart.suggest.user_id'),
          onPick: () => {
            setTextParam('user', String(num));
            setSmart('');
            setSmartErrors([]);
          },
        });
      }

      out.push({
        id: `search.${num}`,
        primary: t('dns.zones.smart.suggest.search', { q: needle }),
        secondary: t('dns.zones.smart.suggest.search.secondary'),
        onPick: () => {
          setTextParam('q', needle);
          setSmart('');
          setSmartErrors([]);
        },
      });

      return out;
    }

    if (needle.includes(':')) {
      out.push({
        id: 'apply',
        primary: t('filters.smart.suggest.apply.primary'),
        secondary: t('filters.smart.suggest.apply.secondary'),
        onPick: () => void applySmartText(needle),
        testId: 'dns.zones.smart.suggest.apply',
      });
      return out;
    }

    out.push({
      id: 'search',
      primary: t('dns.zones.smart.suggest.search', { q: needle }),
      secondary: t('dns.zones.smart.suggest.search.secondary'),
      onPick: () => {
        setTextParam('q', needle);
        setSmart('');
        setSmartErrors([]);
      },
      testId: 'dns.zones.smart.suggest.search',
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
  }, [mode, smartNeedle, t, userSuggestQ.data]);

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

    // Pure numeric → open zone by id.
    const firstToken = tokens[0];
    const numericOnly = tokens.length === 1 && firstToken ? parseNumericToken(firstToken) : null;
    if (numericOnly !== null) {
      setSmart('');
      setSmartErrors([]);
      void openZoneById(numericOnly);
      return;
    }

    let nextQ = qText;
    let nextUser = userRaw;
    let nextEnabled = enabledRaw;
    let nextDnssec = dnssecRaw;
    let nextRole = roleRaw;
    let nextSource = sourceRaw;

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
          void openZoneById(n);
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

        if (key === 'enabled') {
          const b = parseBoolParam(value);
          if (b === undefined) {
            errors.push(t('dns.zones.smart.error.bool', { key: 'enabled', value }));
            continue;
          }
          nextEnabled = b ? '1' : '0';
          continue;
        }

        if (key === 'dnssec') {
          const b = parseBoolParam(value);
          if (b === undefined) {
            errors.push(t('dns.zones.smart.error.bool', { key: 'dnssec', value }));
            continue;
          }
          nextDnssec = b ? '1' : '0';
          continue;
        }

        if (key === 'role') {
          const r = normalizeRole(value);
          if (!r) {
            errors.push(t('dns.zones.smart.error.role', { value }));
            continue;
          }
          nextRole = r;
          continue;
        }

        if (key === 'source') {
          const s = normalizeSource(value);
          if (!s) {
            errors.push(t('dns.zones.smart.error.source', { value }));
            continue;
          }
          nextSource = s;
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
    setTextParam('enabled', nextEnabled || undefined);
    setTextParam('dnssec', nextDnssec || undefined);
    setTextParam('role', nextRole || undefined);
    setTextParam('source', nextSource || undefined);

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
          testId="dns.zones.chip.q"
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
          testId="dns.zones.chip.user"
        />
      );
    }

    if (enabledVal !== undefined) {
      chips.push(
        <FilterChip
          key="enabled"
          label={`enabled:${enabledVal ? 'true' : 'false'}`}
          tone={enabledVal ? 'ok' : 'warn'}
          onRemove={() => setTextParam('enabled', undefined)}
          testId="dns.zones.chip.enabled"
        />
      );
    }

    if (dnssecVal !== undefined) {
      chips.push(
        <FilterChip
          key="dnssec"
          label={`dnssec:${dnssecVal ? 'true' : 'false'}`}
          tone={dnssecVal ? 'ok' : 'neutral'}
          onRemove={() => setTextParam('dnssec', undefined)}
          testId="dns.zones.chip.dnssec"
        />
      );
    }

    if (roleVal !== undefined) {
      chips.push(
        <FilterChip
          key="role"
          label={`role:${roleLabel(t, roleVal)}`}
          tone="neutral"
          onRemove={() => setTextParam('role', undefined)}
          testId="dns.zones.chip.role"
        />
      );
    }

    if (sourceVal !== undefined) {
      chips.push(
        <FilterChip
          key="source"
          label={`source:${sourceLabel(sourceVal)}`}
          tone="neutral"
          onRemove={() => setTextParam('source', undefined)}
          testId="dns.zones.chip.source"
        />
      );
    }

    return chips;
  }, [dnssecVal, enabledVal, mode, qText, roleVal, sourceVal, userIdNum]);

  // Create zone modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createEnabled, setCreateEnabled] = useState(true);
  const [createDnssec, setCreateDnssec] = useState(false);
  const [createDefaultTtl, setCreateDefaultTtl] = useState('3600');
  const createEmailValue = createEmail.trim();
  const createDefaultTtlValue = Number(createDefaultTtl);
  const createValidationError = (() => {
    if (!createName.trim()) return t('dns.zones.create.validation.name_required');
    if (!createEmailValue) return t('dns.zones.create.validation.email_required');
    if (!isValidDnsZoneEmail(createEmailValue)) return t('dns.zones.create.validation.email_invalid');
    if (mode === 'admin' && (!Number.isFinite(createDefaultTtlValue) || createDefaultTtlValue < 60)) {
      return t('dns.zones.create.validation.ttl_invalid');
    }
    return '';
  })();

  const createZ = useMutation({
    mutationFn: async () => {
      if (createValidationError) throw new Error(createValidationError);

      const payload: Parameters<typeof createDnsZone>[0] = {
        name: canonicalDnsZoneName(createName),
        email: createEmailValue,
        // A zone created from this UI is an authoritative user zone. The API
        // treats internal and external zones differently, so keep this aligned
        // with the legacy primary-zone form instead of relying on a DB default.
        source: 'internal_source',
        enabled: createEnabled,
        dnssec_enabled: createDnssec,
      };

      // The API only whitelists default_ttl for admins during zone creation.
      // User-created zones receive the backend default just like the legacy UI.
      if (mode === 'admin') payload.default_ttl = createDefaultTtlValue;

      return createDnsZone(payload);
    },
    onSuccess: () => {
      setCreateOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreateEnabled(true);
      setCreateDnssec(false);
      setCreateDefaultTtl('3600');
      void zonesQ.refetch();

      // Reset cursor stack to show the newest results.
      const next = new URLSearchParams(searchParams);
      next.delete('from_id');
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    },
  });

  return (
    <ListShell
      testId="dns.zones.list"
      banner={<SyncStaleBanner />}
      header={
        <PageHeader
          testId="dns.zones.list.header"
          title={t('dns.zones.page.title')}
          description={t('dns.zones.page.description')}
          meta={filtersActive ? t('list.meta.filters_active') : undefined}
          actions={
            <div className="flex items-center gap-2">
              {mode === 'admin' ? (
                <LinkButton to={`${basePath}/dns/tsig-keys`} variant="secondary" size="sm" testId="dns.zones.tsig_keys">
                  {t('dns.zones.action.tsig_keys')}
                </LinkButton>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => void zonesQ.refetch()}
                disabled={zonesQ.isFetching}
                testId="dns.zones.refresh"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                <span className="ml-2 hidden sm:inline">{t('common.refresh')}</span>
              </Button>

              <Button size="sm" onClick={() => setCreateOpen(true)} testId="dns.zones.create.open">
                <Plus className="h-4 w-4" aria-hidden />
                <span className="ml-2">{t('dns.zones.action.create')}</span>
              </Button>
            </div>
          }
        />
      }
      filters={
        <FilterBar testId="dns.zones.list.filters">
          <div className="w-full sm:max-w-xl">
            <SmartFilterInput
              value={smart}
              onChange={(v) => {
                setSmart(v);
                if (smartErrors.length > 0) setSmartErrors([]);
              }}
              placeholder={t('dns.zones.search.placeholder')}
              testId="dns.zones.search.input"
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
              <div className="mt-2 flex flex-wrap gap-1" data-testid="dns.zones.active_filters">
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
            testId="dns.zones.filters.advanced.open"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
          </Button>

          <CopyButton
            size="sm"
            variant="secondary"
            label={t('common.copy_link')}
            text={shareUrl}
            testId="dns.zones.copy_link"
          />

          {filtersActive ? (
            <Button variant="secondary" size="sm" onClick={clearFilters} testId="dns.zones.filter.clear">
              {t('common.clear_filters')}
            </Button>
          ) : null}
        </FilterBar>
      }
    >
      {zonesQ.isLoading ? (
        <LoadingState testId="dns.zones.loading" />
      ) : zonesQ.isError ? (
        <ErrorState
          testId="dns.zones.error"
          title={t('dns.zones.load_failed')}
          error={zonesQ.error}
          onRetry={() => void zonesQ.refetch()}
          showBack={false}
          detailsExtra={{ page: 'dns.zones', scope: scope.scope }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          testId="dns.zones.empty"
          title={filtersActive ? t('empty.list.no_matches.title') : t('dns.zones.empty')}
          body={filtersActive ? t('empty.list.no_matches.body') : undefined}
          actionLabel={filtersActive ? t('common.clear_filters') : undefined}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((z) => {
              const rowVariant = zoneRowVariant(z);
              const dotVariant = zoneDotVariant(z);
              return (
                <Card key={z.id} testId={`dns.zones.card.${z.id}`} className={toneSurfaceClass(rowVariant)}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusDot variant={dotVariant} testId={`dns.zones.card.${z.id}.dot`} />
                          <Link
                            className="block truncate text-base font-semibold text-accent hover:underline"
                            to={`${basePath}/dns/zones/${z.id}`}
                          >
                            {zoneName(z)}
                          </Link>
                        </div>
                        <div className="mt-0.5 text-xs text-faint">#{z.id}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {enabledBadge(z.enabled)}
                        {dnssecBadge(z.dnssec_enabled)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        {t('dns.zones.field.role')}: {z.role ? roleLabel(t, z.role) : '—'}
                      </span>
                      <span>
                        {t('dns.zones.field.serial')}: {typeof z.serial === 'number' ? z.serial : '—'}
                      </span>
                      <span>
                        {t('dns.zones.field.ttl')}: {typeof z.default_ttl === 'number' ? z.default_ttl : '—'}
                      </span>
                    </div>

                    <div className="mt-3">
                      <LinkButton to={`${basePath}/dns/zones/${z.id}`} variant="secondary" size="sm">
                        {t('common.open')}
                      </LinkButton>
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
              testId="dns.zones.pagination.mobile"
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
                testId="dns.zones.pagination.desktop"
              />
            }
          >
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-8 px-4 py-2"><span className="sr-only">{t('common.state')}</span></th>
                <th className="px-4 py-2">{t('dns.zones.table.name')}</th>
                <th className="px-4 py-2">{t('dns.zones.table.role')}</th>
                <th className="px-4 py-2">{t('dns.zones.table.status')}</th>
                <th className="px-4 py-2">{t('dns.zones.table.security')}</th>
                <th className="px-4 py-2">{t('dns.zones.table.serial')}</th>
                <th className="px-4 py-2">{t('dns.zones.table.ttl')}</th>
                <th className="px-4 py-2 text-right">{t('dns.zones.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((z) => {
                const rowVariant = zoneRowVariant(z);
                const dotVariant = zoneDotVariant(z);
                return (
                  <TableRowLink
                    key={z.id}
                    testId={`dns.zones.row.${z.id}`}
                    to={`${basePath}/dns/zones/${z.id}`}
                    variant={rowVariant}
                    className="border-b border-border/60 last:border-b-0"
                  >
                  <td className="px-4 py-2 align-top">
                    <StatusDot variant={dotVariant} testId={`dns.zones.row.${z.id}.dot`} />
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`${basePath}/dns/zones/${z.id}`} className="font-medium text-accent hover:underline">
                      {zoneName(z)}
                    </Link>
                    <div className="mt-0.5 text-xs text-faint">#{z.id}</div>
                  </td>
                  <td className="px-4 py-2">{z.role ? roleLabel(t, z.role) : '—'}</td>
                  <td className="px-4 py-2">{enabledBadge(z.enabled)}</td>
                  <td className="px-4 py-2">{dnssecBadge(z.dnssec_enabled)}</td>
                  <td className="px-4 py-2">{typeof z.serial === 'number' ? z.serial : '—'}</td>
                  <td className="px-4 py-2">{typeof z.default_ttl === 'number' ? z.default_ttl : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <LinkButton to={`${basePath}/dns/zones/${z.id}`} variant="secondary" size="sm">
                      {t('common.open')}
                    </LinkButton>
                  </td>
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
        title={t('dns.zones.smart_help.title')}
        intro={t('dns.zones.smart_help.intro')}
        items={[
          {
            key: '?',
            description: t('dns.zones.smart_help.items.help'),
          },
          {
            key: '123',
            description: t('dns.zones.smart_help.items.open'),
          },
          {
            key: 'q:example.com',
            description: t('dns.zones.smart_help.items.q'),
          },
          {
            key: 'enabled:false',
            description: t('dns.zones.smart_help.items.enabled'),
          },
          {
            key: 'dnssec:true',
            description: t('dns.zones.smart_help.items.dnssec'),
          },
          {
            key: 'role:reverse',
            description: t('dns.zones.smart_help.items.role'),
          },
          {
            key: 'source:external',
            description: t('dns.zones.smart_help.items.source'),
          },
          ...(mode === 'admin'
            ? [
                {
                  key: 'user:alice',
                  description: t('dns.zones.smart_help.items.user'),
                },
              ]
            : []),
          {
            key: 'example.com',
            description: t('dns.zones.smart_help.items.free'),
          },
        ]}
        footnote={t('dns.zones.smart_help.footnote')}
      />

      <Drawer open={advancedOpen} onClose={() => setAdvancedOpen(false)} title={t('filters.advanced.title')} width="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">{t('dns.zones.advanced.q.label')}</label>
            <div className="mt-1">
              <Input
                value={qText}
                onChange={(e) => setTextParam('q', e.target.value)}
                placeholder={t('dns.zones.advanced.q.placeholder')}
                testId="dns.zones.advanced.q"
              />
            </div>
          </div>

          {mode === 'admin' ? (
            <div>
              <label className="block text-sm font-medium">{t('dns.zones.advanced.user.label')}</label>
              <div className="mt-1">
                <UserLookupInput
                  value={userIdNum}
                  onChange={(id) => setTextParam('user', id ? String(id) : undefined)}
                  placeholder={t('dns.zones.advanced.user.placeholder')}
                  testId="dns.zones.advanced.user"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium">{t('dns.zones.advanced.enabled.label')}</label>
            <div className="mt-1">
              <Select
                value={enabledRaw}
                onChange={(e) => setTextParam('enabled', e.target.value || undefined)}
                testId="dns.zones.advanced.enabled"
                options={[
                  { value: '', label: t('common.all') },
                  { value: '1', label: t('common.enabled') },
                  { value: '0', label: t('common.disabled') },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t('dns.zones.advanced.dnssec.label')}</label>
            <div className="mt-1">
              <Select
                value={dnssecRaw}
                onChange={(e) => setTextParam('dnssec', e.target.value || undefined)}
                testId="dns.zones.advanced.dnssec"
                options={[
                  { value: '', label: t('common.all') },
                  { value: '1', label: t('common.yes') },
                  { value: '0', label: t('common.no') },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t('dns.zones.advanced.role.label')}</label>
            <div className="mt-1">
              <Select
                value={roleVal ?? ''}
                onChange={(e) => setTextParam('role', e.target.value || undefined)}
                testId="dns.zones.advanced.role"
                options={[
                  { value: '', label: t('common.all') },
                  { value: 'forward_role', label: t('dns.zones.role.forward') },
                  { value: 'reverse_role', label: t('dns.zones.role.reverse') },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t('dns.zones.advanced.source.label')}</label>
            <div className="mt-1">
              <Select
                value={sourceVal ?? ''}
                onChange={(e) => setTextParam('source', e.target.value || undefined)}
                testId="dns.zones.advanced.source"
                options={[
                  { value: '', label: t('common.all') },
                  { value: 'internal_source', label: t('dns.zones.source.internal') },
                  { value: 'external_source', label: t('dns.zones.source.external') },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={clearFilters} disabled={!filtersActive} testId="dns.zones.advanced.clear">
              {t('common.clear_filters')}
            </Button>

            <Button variant="primary" onClick={() => setAdvancedOpen(false)} testId="dns.zones.advanced.close">
              {t('common.close')}
            </Button>
          </div>

          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-faint">
            {t('dns.zones.advanced.note')}
          </div>
        </div>
      </Drawer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('dns.zones.create.title')}
        testId="dns.zones.create.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={createZ.isPending}
              testId="dns.zones.create.cancel"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createZ.mutate()}
              disabled={createZ.isPending || Boolean(createValidationError)}
              testId="dns.zones.create.submit"
            >
              {createZ.isPending ? t('dns.zones.create.submit_creating') : t('dns.zones.create.submit')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t('dns.zones.create.name.label')}</div>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('dns.zones.create.name.placeholder')}
              testId="dns.zones.create.name"
            />
            <div className="mt-1 text-xs text-muted">{t('dns.zones.create.name.help')}</div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted">{t('dns.zones.create.email.label')}</div>
            <Input
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder={t('dns.zones.create.email.placeholder')}
              testId="dns.zones.create.email"
              className={createEmailValue && !isValidDnsZoneEmail(createEmailValue) ? 'border-danger-border' : undefined}
            />
            <div className="mt-1 text-xs text-muted">{t('dns.zones.create.email.help')}</div>
          </div>

          {mode === 'admin' ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">{t('dns.zones.create.ttl.label')}</div>
              <Select
                value={createDefaultTtl}
                onChange={(e) => setCreateDefaultTtl(e.target.value)}
                testId="dns.zones.create.ttl"
                options={[
                  { value: '300', label: '300' },
                  { value: '600', label: '600' },
                  { value: '3600', label: '3600' },
                  { value: '14400', label: '14400' },
                  { value: '86400', label: '86400' },
                ]}
              />
            </div>
          ) : null}

          <Checkbox checked={createEnabled} onChange={setCreateEnabled} testId="dns.zones.create.enabled" label={t('common.enabled')} />

          <Checkbox
            checked={createDnssec}
            onChange={setCreateDnssec}
            testId="dns.zones.create.dnssec"
            label={t('dns.zones.create.dnssec.label')}
          />

          {createValidationError && (createName.trim() || createEmail.trim()) ? (
            <Alert title={t('dns.zones.create.validation.title')} variant="warn">
              {createValidationError}
            </Alert>
          ) : null}

          {createZ.isError ? (
            <Alert title={t('dns.zones.create.failed')} variant="danger">
              {formatErrorMessage(createZ.error)}
            </Alert>
          ) : null}
        </div>
      </Modal>
    </ListShell>
  );
}
