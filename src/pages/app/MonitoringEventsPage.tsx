import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import {
  fetchMonitoredEvents,
  type MonitoredEvent,
  type MonitoredEventOrder,
  type MonitoredEventState,
} from '../../lib/api/monitoring';
import { searchUsers } from '../../lib/api/users';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';
import { useObjectScope } from '../../app/objectScope';
import { useToasts } from '../../app/toasts';
import { FilterBar } from '../../components/layout/FilterBar';
import { ListShell } from '../../components/layout/ListShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { formatDateTime, formatDurationSeconds } from '../../lib/format';
import { formatErrorMessage } from '../../lib/errors';
import { monitoredEventBadgeVariant, monitoredEventRowVariant, monitoredEventStateLabelKey } from '../../lib/monitoringBadges';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import {
  cursorFromAscendingNumber,
  cursorFromAscendingPage,
  cursorFromDescendingNumber,
  cursorFromDescendingPage,
} from '../../lib/lockIndex';
import { useTierAIntervalMs } from '../../lib/refreshTiers';
import { dotVariantFromRowVariant } from '../../lib/variantMap';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { KeysetPagination } from '../../components/ui/KeysetPagination';
import { LoadingState } from '../../components/ui/LoadingState';
import { Select } from '../../components/ui/Select';
import { TableCard } from '../../components/ui/TableCard';
import { TableRowLink } from '../../components/ui/TableRowLink';
import { StatusDot } from '../../components/ui/StatusDot';
import { MiniLink } from '../../components/ui/ChipLink';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { Drawer } from '../../components/ui/Drawer';
import { FilterChip } from '../../components/ui/FilterChip';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../components/ui/SmartInputHelp';
import { UserLookupInput } from '../../components/ui/UserLookupInput';
import {
  parseNumericToken,
  splitKeyValueToken,
  tokenizeSmartInput,
  unquoteSmartValue,
} from '../../lib/smartFilter';
function safeNumber(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i <= 0) return undefined;
  return i;
}

function orderFromSearch(sp: URLSearchParams): MonitoredEventOrder {
  const raw = (sp.get('order') ?? '').trim();
  if (raw === 'oldest' || raw === 'latest' || raw === 'longest' || raw === 'shortest') return raw;
  return 'latest';
}

function stateOptions(mode: 'user' | 'admin'): MonitoredEventState[] {
  const all: MonitoredEventState[] = ['monitoring', 'confirmed', 'unconfirmed', 'acknowledged', 'ignored', 'closed'];
  if (mode === 'admin') return all;
  // User scope is restricted to these states by the API.
  return ['confirmed', 'acknowledged', 'ignored', 'closed'];
}

function objectLink(basePath: string, objName?: string, objId?: number): string | null {
  if (!objName || !objId) return null;
  if (objName === 'Vps') return `${basePath}/vps/${objId}`;
  if (objName === 'Node' && basePath === '/admin') return `${basePath}/nodes/${objId}`;
  return null;
}

type SmartKey = 'monitor' | 'object_name' | 'object_id' | 'state' | 'user' | 'order' | 'id';

function canonicalKey(raw: string): SmartKey | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (['monitor', 'm'].includes(k)) return 'monitor';
  if (['object', 'obj', 'type', 'object_name', 'kind'].includes(k)) return 'object_name';
  if (['object_id', 'oid', 'obj_id'].includes(k)) return 'object_id';
  if (['state', 'st', 'status'].includes(k)) return 'state';
  if (['user', 'u', 'owner'].includes(k)) return 'user';
  if (['order', 'sort'].includes(k)) return 'order';
  if (['id', '#', 'event'].includes(k)) return 'id';
  return null;
}

function normalizeOrder(value: string): MonitoredEventOrder | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === 'latest' || v === 'newest' || v === 'recent') return 'latest';
  if (v === 'oldest') return 'oldest';
  if (v === 'longest') return 'longest';
  if (v === 'shortest') return 'shortest';
  return null;
}

function normalizeObjectName(value: string): string {
  const v = value.trim();
  if (!v) return '';
  const low = v.toLowerCase();
  if (low === 'vps') return 'Vps';
  if (low === 'node') return 'Node';
  return v;
}

function inferState(value: string, allowed: MonitoredEventState[]): MonitoredEventState | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;

  const exact = allowed.find((s) => String(s).toLowerCase() === v);
  if (exact) return exact;

  const byPrefix = allowed.filter((s) => String(s).toLowerCase().startsWith(v));
  if (byPrefix.length === 1) return byPrefix[0] ?? null;
  return null;
}

export function MonitoringEventsPage() {
  const { basePath, mode } = useAppMode();
  const scope = useObjectScope();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const tierARefetchMs = useTierAIntervalMs();

  const [sp, setSp] = useSearchParams();

  const order = useMemo(() => orderFromSearch(sp), [sp]);

  const [monitor, setMonitor] = useState(() => sp.get('monitor') ?? '');
  const [objectName, setObjectName] = useState(() => sp.get('object_name') ?? '');
  const [objectId, setObjectId] = useState(() => sp.get('object_id') ?? '');
  const [state, setState] = useState(() => sp.get('state') ?? '');
  const [userId, setUserId] = useState(() => sp.get('user') ?? '');

  // Smart filter input (unapplied text).
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const smartInputRef = useRef<HTMLInputElement>(null);
  const smartNeedle = smart.trim();
  const debouncedSmartNeedle = useDebouncedValue(smartNeedle, 150);

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  // Sync from URL on navigation.
  useEffect(() => {
    setMonitor(sp.get('monitor') ?? '');
    setObjectName(sp.get('object_name') ?? '');
    setObjectId(sp.get('object_id') ?? '');
    setState(sp.get('state') ?? '');
    setUserId(sp.get('user') ?? '');
  }, [sp]);

  // Keep filters in the URL.
  useEffect(() => {
    const next = new URLSearchParams(sp);

    // order
    if (order && order !== 'latest') next.set('order', order);
    else next.delete('order');

    if (monitor.trim()) next.set('monitor', monitor.trim());
    else next.delete('monitor');

    if (objectName.trim()) next.set('object_name', objectName.trim());
    else next.delete('object_name');

    if (objectId.trim()) next.set('object_id', objectId.trim());
    else next.delete('object_id');

    const st = state.trim();
    if (st && stateOptions(mode).includes(st as any)) next.set('state', st);
    else next.delete('state');

    // API forbids specifying user filter in user mode.
    if (mode === 'admin') {
      if (userId.trim()) next.set('user', userId.trim());
      else next.delete('user');
    } else {
      next.delete('user');
    }

    if (next.toString() !== sp.toString()) setSp(next, { replace: true });
  }, [mode, monitor, objectId, objectName, order, sp, setSp, state, userId]);

  const objectIdNum = safeNumber(objectId);
  const userIdNum = mode === 'admin' ? safeNumber(userId) : undefined;
  const effectiveUserId = mode === 'admin' ? userIdNum : scope.mineUserId;

  const userSuggestQuery = useQuery({
    queryKey: ['users', 'search', { q: debouncedSmartNeedle }],
    enabled:
      mode === 'admin' &&
      debouncedSmartNeedle.length >= 2 &&
      debouncedSmartNeedle !== '?' &&
      !debouncedSmartNeedle.includes(':') &&
      !debouncedSmartNeedle.includes(' ') &&
      parseNumericToken(debouncedSmartNeedle) === null,
    queryFn: async () => (await searchUsers({ q: debouncedSmartNeedle, limit: 6 })).data,
    staleTime: 10_000,
  });

  const cursorParam = order === 'longest' || order === 'shortest' ? 'from_duration' : 'from_id';
  const cursorMin = cursorParam === 'from_duration' ? 0 : 1;
  const cursorInteger = cursorParam !== 'from_duration';

  const pagination = useKeysetPagination({
    id: 'monitoring.events.list',
    filterKey: JSON.stringify({
      scope: basePath,
      order,
      monitor: monitor.trim(),
      object_name: objectName.trim(),
      object_id: objectIdNum,
      state: state.trim(),
      user: effectiveUserId,
    }),
    searchParams: sp,
    setSearchParams: setSp,
    cursorParam,
    cursorMin,
    cursorInteger,
    // When the cursor param changes (order switches), remove stale cursor params.
    wipeQueryKeys: ['from_id', 'from_duration'],
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const q = useQuery({
    queryKey: [
      'monitored_events',
      'index',
      {
        limit: pagination.limit,
        cursor: pagination.cursor,
        cursorParam,
        order,
        monitor: monitor.trim(),
        objectName: objectName.trim(),
        objectId: objectIdNum,
        state: state.trim(),
        userId: effectiveUserId,
      },
    ],
    queryFn: async () =>
      (
        await fetchMonitoredEvents({
          limit: pagination.limit,
          order,
          fromId: cursorParam === 'from_id' ? (pagination.cursor as number | undefined) : undefined,
          fromDuration:
            cursorParam === 'from_duration' ? (pagination.cursor as number | undefined) : undefined,
          monitor: monitor.trim() || undefined,
          objectName: objectName.trim() || undefined,
          objectId: objectIdNum,
          state: state.trim() || undefined,
          userId: effectiveUserId,
        })
      ).data,
    refetchInterval: tierARefetchMs,
  });

  const rows = q.data ?? [];

  const pageCursor = useMemo(() => {
    if (order === 'oldest') return cursorFromAscendingPage(rows as any);
    if (order === 'latest') return cursorFromDescendingPage(rows as any);
    if (order === 'longest') return cursorFromDescendingNumber(rows, (r) => (r as any).duration);
    if (order === 'shortest') return cursorFromAscendingNumber(rows, (r) => (r as any).duration);
    return cursorFromDescendingPage(rows as any);
  }, [order, rows]);

  const canNext = rows.length >= pagination.limit;

  const filtersActive = Boolean(
    monitor.trim() || objectName.trim() || objectIdNum || state.trim() || (mode === 'admin' && userIdNum)
  );

  function clearFilters() {
    setMonitor('');
    setObjectName('');
    setObjectId('');
    setState('');
    setUserId('');
    setSmartErrors([]);
  }

  function setOrderInUrl(v: MonitoredEventOrder) {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (v && v !== 'latest') next.set('order', v);
      else next.delete('order');
      return next;
    });
  }

  async function applySmartText(raw: string) {
    const input = raw.trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input).map((t) => t.trim()).filter(Boolean);

    const firstToken = tokens[0];
    const numericOnly = tokens.length === 1 && firstToken ? parseNumericToken(firstToken) : null;
    if (numericOnly !== null) {
      setSmart('');
      setSmartErrors([]);
      navigate(`${basePath}/monitoring/${numericOnly}`);
      return;
    }

    let nextMonitor = monitor;
    let nextObjectName = objectName;
    let nextObjectId = objectId;
    let nextState = state;
    let nextUser = userId;
    let nextOrder: MonitoredEventOrder = order;

    const free: string[] = [];
    const errors: string[] = [];
    const allowedStates = stateOptions(mode);

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (kv) {
        const rawKey = kv.rawKey;
        const rawValue = kv.rawValue;
        const key = canonicalKey(rawKey);
        const value = unquoteSmartValue(rawValue);

        if (!key) {
          errors.push(t('filters.smart.error.unknown_key', { key: rawKey }));
          continue;
        }

        if (!value.trim()) {
          errors.push(t('filters.smart.error.missing_value', { key: rawKey }));
          continue;
        }

        if (key === 'monitor') {
          nextMonitor = value;
          continue;
        }

        if (key === 'object_name') {
          nextObjectName = normalizeObjectName(value);
          continue;
        }

        if (key === 'object_id') {
          const n = parseNumericToken(value);
          if (n !== null) {
            nextObjectId = String(n);
            continue;
          }

          errors.push(t('monitoring.smart.error.object_id_numeric_only', { value }));
          continue;
        }

        if (key === 'state') {
          const inferred = inferState(value, allowedStates);
          if (inferred) {
            nextState = String(inferred);
            continue;
          }

          errors.push(t('monitoring.smart.error.invalid_state', { value }));
          continue;
        }

        if (key === 'user') {
          if (mode !== 'admin') {
            errors.push(t('filters.smart.error.user_admin_only'));
            continue;
          }

          const n = parseNumericToken(value);
          if (n !== null) {
            nextUser = String(n);
            continue;
          }

          const users = (await searchUsers({ q: value, limit: 10 })).data;
          const exact = users.filter((u) => u.login.toLowerCase() === value.toLowerCase());
          const firstExact = exact[0];
          if (exact.length === 1 && firstExact) {
            nextUser = String(firstExact.id);
            continue;
          }

          errors.push(t('filters.smart.error.user_unresolved', { value }));
          continue;
        }

        if (key === 'order') {
          const ord = normalizeOrder(value);
          if (ord) {
            nextOrder = ord;
            continue;
          }

          errors.push(t('monitoring.smart.error.invalid_order', { value }));
          continue;
        }

        if (key === 'id') {
          const n = parseNumericToken(value);
          if (n !== null) {
            setSmart('');
            setSmartErrors([]);
            navigate(`${basePath}/monitoring/${n}`);
            return;
          }

          errors.push(t('monitoring.smart.error.event_id_numeric_only', { value }));
          continue;
        }
      } else {
        free.push(unquoteSmartValue(token));
      }
    }

    if (free.length > 0) {
      nextMonitor = free.join(' ');
    }

    if (errors.length > 0) {
      setSmartErrors(errors);
      toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.error') });
      return;
    }

    setMonitor(nextMonitor);
    setObjectName(nextObjectName);
    setObjectId(nextObjectId);
    setState(nextState);
    setUserId(nextUser);
    setSmart('');
    setSmartErrors([]);

    if (nextOrder !== order) setOrderInUrl(nextOrder);
  }

  const smartSuggestions = useMemo((): SmartFilterSuggestion[] => {
    const needle = smartNeedle;
    if (!needle) return [];

    if (needle === '?') {
      return [
        {
          id: 'help',
          primary: t('filters.help.title'),
          secondary: t('filters.help.suggestion.secondary'),
          onPick: () => setHelpOpen(true),
          testId: 'monitoring.smart_filter.suggest.help',
        },
      ];
    }

    const suggestions: SmartFilterSuggestion[] = [];
    const numeric = parseNumericToken(needle);

    if (numeric !== null) {
      const id = String(numeric);
      suggestions.push({
        id: 'open',
        primary: t('monitoring.smart.suggest.open_event', { id }),
        secondary: t('monitoring.smart.suggest.open_event.secondary'),
        onPick: () => {
          setSmart('');
          setSmartErrors([]);
          navigate(`${basePath}/monitoring/${id}`);
        },
        testId: 'monitoring.smart_filter.suggest.open',
      });

      suggestions.push({
        id: 'object_id',
        primary: t('monitoring.smart.suggest.object_id', { id }),
        secondary: t('monitoring.smart.suggest.object_id.secondary'),
        onPick: () => {
          setObjectId(id);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'monitoring.smart_filter.suggest.object_id',
      });

      if (mode === 'admin') {
        suggestions.push({
          id: 'user',
          primary: t('filters.smart.suggest.user_id', { id }),
          secondary: t('filters.smart.suggest.user_id.secondary'),
          onPick: () => {
            setUserId(id);
            setSmart('');
            setSmartErrors([]);
          },
          testId: 'monitoring.smart_filter.suggest.user',
        });
      }

      return suggestions;
    }

    if (needle.includes(':')) {
      suggestions.push({
        id: 'apply',
        primary: t('filters.smart.suggest.apply.primary'),
        secondary: t('filters.smart.suggest.apply.secondary'),
        onPick: () => void applySmartText(needle),
        testId: 'monitoring.smart_filter.suggest.apply',
      });
      return suggestions;
    }

    suggestions.push({
      id: 'monitor',
      primary: t('monitoring.smart.suggest.monitor', { value: needle }),
      secondary: t('monitoring.smart.suggest.monitor.secondary'),
      onPick: () => {
        setMonitor(needle);
        setSmart('');
        setSmartErrors([]);
      },
      testId: 'monitoring.smart_filter.suggest.monitor',
    });

    const inferred = inferState(needle, stateOptions(mode));
    if (inferred) {
      const labelKey = monitoredEventStateLabelKey(inferred);
      const stateLabel = labelKey ? t(labelKey) : String(inferred);
      suggestions.push({
        id: 'state',
        primary: t('monitoring.smart.suggest.state', { state: stateLabel }),
        secondary: t('monitoring.smart.suggest.state.secondary'),
        onPick: () => {
          setState(String(inferred));
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'monitoring.smart_filter.suggest.state',
      });
    }

    const low = needle.toLowerCase();
    if (low === 'vps' || low === 'node') {
      const obj = normalizeObjectName(needle);
      suggestions.push({
        id: 'object',
        primary: t('monitoring.smart.suggest.object_name', { name: obj }),
        secondary: t('monitoring.smart.suggest.object_name.secondary'),
        onPick: () => {
          setObjectName(obj);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'monitoring.smart_filter.suggest.object',
      });
    }

    if (mode === 'admin') {
      const users = userSuggestQuery.data ?? [];
      for (const u of users.slice(0, 5)) {
        suggestions.push({
          id: `user.${u.id}`,
          primary: t('monitoring.smart.suggest.user_login', { login: u.login }),
          secondary: `#${u.id}`,
          onPick: () => {
            setUserId(String(u.id));
            setSmart('');
            setSmartErrors([]);
          },
          testId: `monitoring.smart_filter.suggest.user.${u.id}`,
        });
      }
    }

    return suggestions;
  }, [basePath, mode, navigate, smartNeedle, t, userSuggestQuery.data]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    const m = monitor.trim();
    if (m) {
      chips.push(
        <FilterChip
          key="monitor"
          label={`monitor:${m}`}
          onRemove={() => setMonitor('')}
          testId="monitoring.chip.monitor"
        />
      );
    }

    const obj = objectName.trim();
    if (obj) {
      chips.push(
        <FilterChip
          key="object"
          label={`object:${obj}`}
          onRemove={() => setObjectName('')}
          testId="monitoring.chip.object"
        />
      );
    }

    if (objectIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="object_id"
          label={`object_id:${objectIdNum}`}
          onRemove={() => setObjectId('')}
          testId="monitoring.chip.object_id"
        />
      );
    }

    const st = state.trim();
    if (st) {
      chips.push(
        <FilterChip
          key="state"
          label={`state:${st}`}
          onRemove={() => setState('')}
          testId="monitoring.chip.state"
        />
      );
    }

    if (mode === 'admin' && userIdNum !== undefined) {
      chips.push(
        <FilterChip
          key="user"
          label={`user:${userIdNum}`}
          onRemove={() => setUserId('')}
          testId="monitoring.chip.user"
        />
      );
    }

    smartErrors.forEach((e, idx) => {
      chips.push(
        <FilterChip
          key={`err.${idx}`}
          label={e}
          tone="danger"
          onRemove={() => setSmartErrors([])}
          testId={`monitoring.chip.error.${idx}`}
        />
      );
    });

    return chips;
  }, [mode, monitor, objectIdNum, objectName, smartErrors, state, userIdNum]);

  return (
    <ListShell
      testId="monitoring.events.list"
      header={<PageHeader title={t('monitoring.title')} description={t('monitoring.description')} testId="monitoring.events.header" />}
      filters={
        <>
          <FilterBar testId="monitoring.events.filters">
            <div className="w-full sm:max-w-xl">
              <SmartFilterInput
                ref={smartInputRef}
                value={smart}
                onChange={(v) => {
                  setSmart(v);
                  if (smartErrors.length) setSmartErrors([]);
                }}
                placeholder={t('monitoring.smart.placeholder')}
                ariaLabel={t('monitoring.smart.placeholder')}
                testId="monitoring.smart_filter.input"
                suggestions={smartSuggestions}
                onSubmit={() => void applySmartText(smart)}
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
                <div className="mt-2 flex flex-wrap gap-1" data-testid="monitoring.events.active_filters">
                  {activeFilterChips}
                </div>
              ) : null}
            </div>

            <div className="w-full sm:w-44">
              <Select
                value={order}
                onChange={(e) => setOrderInUrl(e.target.value as MonitoredEventOrder)}
                testId="monitoring.events.filter.order"
              >
                <option value="latest">{t('monitoring.order.latest')}</option>
                <option value="oldest">{t('monitoring.order.oldest')}</option>
                <option value="longest">{t('monitoring.order.longest')}</option>
                <option value="shortest">{t('monitoring.order.shortest')}</option>
              </Select>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              aria-label={t('filters.advanced.open')}
              title={t('filters.advanced.open')}
              testId="monitoring.events.advanced.open"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="ml-2 hidden sm:inline">{t('filters.advanced.label')}</span>
            </Button>

            <CopyButton
              size="sm"
              variant="secondary"
              label={t('common.copy_link')}
              text={typeof window !== 'undefined' ? window.location.href : ''}
              testId="monitoring.events.copy_link"
            />

            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="monitoring.events.clear_filters">
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </FilterBar>

          <SmartInputHelp
            open={helpOpen}
            onClose={() => {
              setHelpOpen(false);
              if (smartNeedle === '?') setSmart('');
            }}
            title={t('filters.help.title')}
            intro={t('monitoring.smart_help.intro')}
            examples={
              mode === 'admin'
                ? [
                    { example: '?', description: t('monitoring.smart_help.examples.help') },
                    { example: '123', description: t('monitoring.smart_help.examples.open_id') },
                    { example: 'disk', description: t('monitoring.smart_help.examples.monitor') },
                    { example: 'state:acknowledged', description: t('monitoring.smart_help.examples.state') },
                    {
                      example: 'object:Vps object_id:101',
                      description: t('monitoring.smart_help.examples.object'),
                    },
                    { example: 'user:alice', description: t('monitoring.smart_help.examples.user') },
                  ]
                : [
                    { example: '?', description: t('monitoring.smart_help.examples.help') },
                    { example: '123', description: t('monitoring.smart_help.examples.open_id') },
                    { example: 'disk', description: t('monitoring.smart_help.examples.monitor') },
                    { example: 'state:acknowledged', description: t('monitoring.smart_help.examples.state') },
                    {
                      example: 'object:Vps object_id:101',
                      description: t('monitoring.smart_help.examples.object'),
                    },
                  ]
            }
            topKeys={
              mode === 'admin'
                ? [
                    { key: 'monitor', description: t('monitoring.smart_help.keys.monitor'), example: 'monitor:disk' },
                    { key: 'state', description: t('monitoring.smart_help.keys.state'), example: 'state:confirmed' },
                    { key: 'object', description: t('monitoring.smart_help.keys.object'), example: 'object:Vps' },
                    {
                      key: 'object_id',
                      description: t('monitoring.smart_help.keys.object_id'),
                      example: 'object_id:101',
                    },
                    { key: 'user', description: t('monitoring.smart_help.keys.user'), example: 'user:alice' },
                    { key: 'id', description: t('monitoring.smart_help.keys.id'), example: 'id:123' },
                    { key: 'order', description: t('monitoring.smart_help.keys.order'), example: 'order:longest' },
                  ]
                : [
                    { key: 'monitor', description: t('monitoring.smart_help.keys.monitor'), example: 'monitor:disk' },
                    { key: 'state', description: t('monitoring.smart_help.keys.state'), example: 'state:confirmed' },
                    { key: 'object', description: t('monitoring.smart_help.keys.object'), example: 'object:Vps' },
                    {
                      key: 'object_id',
                      description: t('monitoring.smart_help.keys.object_id'),
                      example: 'object_id:101',
                    },
                    { key: 'id', description: t('monitoring.smart_help.keys.id'), example: 'id:123' },
                    { key: 'order', description: t('monitoring.smart_help.keys.order'), example: 'order:longest' },
                  ]
            }
            inference={[
              t('monitoring.smart_help.inference.enter_applies'),
              t('monitoring.smart_help.inference.number_opens'),
              t('monitoring.smart_help.inference.key_value'),
            ]}
            onInsertKey={(key) => {
              setHelpOpen(false);
              setSmart(`${key}:`);
              window.requestAnimationFrame(() => smartInputRef.current?.focus());
            }}
            actions={[
              {
                label: t('filters.help.open_advanced'),
                onClick: () => {
                  setHelpOpen(false);
                  setAdvancedOpen(true);
                },
              },
            ]}
            testId="monitoring.smart_filter.help"
            keyRowTestIdPrefix="monitoring.smart_filter.help.key"
          />

          <Drawer
            open={advancedOpen}
            onClose={() => setAdvancedOpen(false)}
            title={t('filters.advanced.title')}
            width="lg"
            testId="monitoring.events.advanced_filters"
            footer={
              <div className="flex items-center justify-end gap-2">
                {filtersActive ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    {t('common.clear_filters')}
                  </Button>
                ) : null}
                <Button variant="primary" size="sm" onClick={() => setAdvancedOpen(false)}>
                  {t('common.done')}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium">{t('monitoring.field.monitor_name')}</div>
                <div className="mt-1">
                  <Input
                    value={monitor}
                    onChange={(e) => setMonitor(e.target.value)}
                    placeholder={t('monitoring.filter.monitor.placeholder')}
                    testId="monitoring.events.advanced.monitor"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('monitoring.field.object')}</div>
                <div className="mt-1">
                  <Input
                    value={objectName}
                    onChange={(e) => setObjectName(e.target.value)}
                    placeholder={t('monitoring.filter.object_name.placeholder')}
                    testId="monitoring.events.advanced.object_name"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('monitoring.filter.object_id.label')}</div>
                <div className="mt-1">
                  <Input
                    value={objectId}
                    onChange={(e) => setObjectId(e.target.value)}
                    type="number"
                    placeholder={t('monitoring.filter.object_id.placeholder')}
                    testId="monitoring.events.advanced.object_id"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('common.state')}</div>
                <div className="mt-1">
                  <Select value={state} onChange={(e) => setState(e.target.value)} testId="monitoring.events.advanced.state">
                    <option value="">{t('monitoring.filter.state.all')}</option>
                    {stateOptions(mode).map((s) => (
                      <option key={String(s)} value={String(s)}>
                        {t(monitoredEventStateLabelKey(s) ?? 'common.unknown')}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {mode === 'admin' ? (
                <div>
                  <div className="text-sm font-medium">{t('common.user')}</div>
                  <div className="mt-1">
                    <UserLookupInput
                      value={userId}
                      onChange={setUserId}
                      placeholder={t('monitoring.filter.user.placeholder')}
                      testId="monitoring.events.advanced.user.lookup"
                      loadingLabel={t('common.loading')}
                      noResultsLabel={t('palette.empty.no_results')}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </Drawer>
        </>
      }
    >
      {q.isLoading ? (
        <LoadingState testId="monitoring.events.loading" />
      ) : q.isError ? (
        <ErrorState
          testId="monitoring.events.error"
          title={t('monitoring.load_error.title')}
          error={q.error}
          onRetry={() => void q.refetch()}
          showBack={false}
          detailsExtra={{ page: 'monitoring.events.list', scope: basePath }}
        />
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            testId="monitoring.events.empty"
            title={filtersActive ? t('monitoring.empty.filtered.title') : t('monitoring.empty.title')}
            body={filtersActive ? t('monitoring.empty.filtered.body') : t('monitoring.empty.body')}
            actionLabel={filtersActive ? t('common.clear_filters') : undefined}
            onAction={filtersActive ? clearFilters : undefined}
          />

          <Card className="mt-4">
            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={canNext}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="monitoring.events.pagination"
            />
          </Card>
        </>
      ) : (
        <TableCard
          testId="monitoring.events.table"
          minWidth="lg"
          footer={
            <KeysetPagination
              page={pagination.page}
              pageCount={pagination.stack.length}
              canPrev={pagination.canPrev}
              canNext={canNext}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={pagination.goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="monitoring.events.pagination"
            />
          }
        >
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-3 py-2">
                <span className="sr-only">{t('common.state')}</span>
              </th>
              <th className="px-4 py-2">{t('common.id')}</th>
              <th className="px-4 py-2">{t('common.state')}</th>
              <th className="px-4 py-2">{t('monitoring.column.monitor')}</th>
              <th className="px-4 py-2">{t('monitoring.column.object')}</th>
              {mode === 'admin' ? <th className="px-4 py-2">{t('common.user')}</th> : null}
              <th className="px-4 py-2">{t('common.created')}</th>
              <th className="px-4 py-2">{t('monitoring.column.duration')}</th>
              <th className="px-4 py-2">{t('monitoring.column.saved_until')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: MonitoredEvent) => {
              const id = Number((e as any).id);
              const stateVal = String((e as any).state ?? '');
              const badgeV = monitoredEventBadgeVariant(stateVal);
              const rowV = monitoredEventRowVariant(stateVal);
              const dotV = dotVariantFromRowVariant(rowV);
              const labelKey = monitoredEventStateLabelKey(stateVal);
              const stateLabel = labelKey ? t(labelKey) : stateVal || t('common.unknown');

              const objName = (e as any).object_name as string | undefined;
              const objId = Number((e as any).object_id);
              const objLink = objectLink(basePath, objName, Number.isFinite(objId) ? objId : undefined);

              const createdAt = (e as any).created_at ? formatDateTime((e as any).created_at) : '';
              const duration = (e as any).duration;
              const durationLabel =
                typeof duration === 'number' && Number.isFinite(duration)
                  ? formatDurationSeconds(duration)
                  : t('common.na');

              const savedUntilIso = (e as any).saved_until as string | null | undefined;
              const savedUntilLabel = savedUntilIso
                ? formatDateTime(savedUntilIso)
                : stateVal === 'acknowledged' || stateVal === 'ignored'
                  ? t('monitoring.saved_until.forever')
                  : t('common.na');

              return (
                <TableRowLink
                  key={id}
                  to={`${basePath}/monitoring/${id}`}
                  variant={rowV}
                  testId={`monitoring.events.row.${id}`}
                >
                  <td className="px-3 py-2">
                    <StatusDot
                      variant={dotV}
                      ariaLabel={stateLabel}
                      testId={`monitoring.events.row.${id}.dot`}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{id}</td>
                  <td className="px-4 py-2">
                    <Badge variant={badgeV} testId={`monitoring.events.row.${id}.state`}>
                      {stateLabel}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{(e as any).label ?? (e as any).monitor ?? t('common.unknown')}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{(e as any).issue ?? ''}</div>
                      {(e as any).monitor ? (
                        <div className="mt-1 text-xs text-faint">{t('monitoring.monitor_name', { name: String((e as any).monitor) })}</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {objName ? `${objName} #${Number.isFinite(objId) ? objId : '?'}` : t('common.na')}
                      </span>
                      {objLink ? (
                        <MiniLink
                          to={objLink}
                          data-row-no-nav
                          title={t('common.open')}
                          data-testid={`monitoring.events.row.${id}.object.open`}
                        >
                          {t('common.open')}
                        </MiniLink>
                      ) : null}
                    </div>
                  </td>
                  {mode === 'admin' ? (
                    <td className="px-4 py-2">
                      <span className="text-sm">{(e as any).user?.login ?? (e as any).user?.label ?? t('common.na')}</span>
                    </td>
                  ) : null}
                  <td className="px-4 py-2 text-sm text-muted">{createdAt}</td>
                  <td className="px-4 py-2 text-sm">{durationLabel}</td>
                  <td className="px-4 py-2 text-sm text-muted">{savedUntilLabel}</td>
                </TableRowLink>
              );
            })}
          </tbody>
        </TableCard>
      )}

      {q.isError ? (
        <div className="mt-2 text-xs text-muted">
          {t('common.details')}: {formatErrorMessage(q.error)}
        </div>
      ) : null}
    </ListShell>
  );
}
