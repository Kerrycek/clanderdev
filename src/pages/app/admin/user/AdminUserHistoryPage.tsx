import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { FilterBar } from '../../../../components/layout/FilterBar';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { Drawer } from '../../../../components/ui/Drawer';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { FilterChip } from '../../../../components/ui/FilterChip';
import { Input } from '../../../../components/ui/Input';
import { KeysetPagination } from '../../../../components/ui/KeysetPagination';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { SmartFilterInput, type SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import { SmartInputHelp } from '../../../../components/ui/SmartInputHelp';
import { StatusDot } from '../../../../components/ui/StatusDot';
import { TableCard } from '../../../../components/ui/TableCard';
import { TableRowLink } from '../../../../components/ui/TableRowLink';
import { fetchObjectHistoryEvents, type ObjectHistoryEvent } from '../../../../lib/api/audit';
import { eventBadgeVariant, eventDataSummary, eventVariant, sessionLabel, trackedObjectLabel, userLabel } from '../../../../lib/auditUi';
import { dotVariantFromBadgeVariant } from '../../../../lib/variantMap';
import { formatDateTime } from '../../../../lib/format';
import { cursorFromDescendingPage } from '../../../../lib/lockIndex';
import { useKeysetPagination } from '../../../../lib/hooks/useKeysetPagination';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../../lib/smartFilter';
import { useAdminUserContext } from './AdminUserLayout';

function safeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}
type ViewMode = 'changes' | 'actions';
type SmartKey = 'id' | 'q' | 'session' | 'event' | 'object' | 'object_id';
function canonicalKey(raw: string): SmartKey | null {
  const k = String(raw ?? '').trim().toLowerCase();
  if (!k) return null;

  if (k === 'id' || k === '#') return 'id';
  if (k === 'q' || k === 'search' || k === 'text' || k === 'query') return 'q';
  if (k === 'session' || k === 'sess' || k === 'user_session' || k === 's') return 'session';
  if (k === 'event' || k === 'event_type' || k === 'et') return 'event';
  if (k === 'object' || k === 'obj' || k === 'type' || k === 'class') return 'object';
  if (k === 'object_id' || k === 'obj_id' || k === 'oid') return 'object_id';

  return null;
}

export function AdminUserHistoryPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const na = t('common.na');

  const { userId } = useAdminUserContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const view: ViewMode = (searchParams.get('view') as ViewMode) === 'actions' ? 'actions' : 'changes';

  const [qText, setQText] = useState(() => searchParams.get('q') ?? '');
  const [eventType, setEventType] = useState(() => searchParams.get('event_type') ?? '');
  const [userSession, setUserSession] = useState(() => searchParams.get('user_session') ?? '');
  const [object, setObject] = useState(() => searchParams.get('object') ?? '');
  const [objectId, setObjectId] = useState(() => searchParams.get('object_id') ?? '');

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const smartInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextQ = searchParams.get('q') ?? '';
    const nextEvent = searchParams.get('event_type') ?? '';
    const nextSession = searchParams.get('user_session') ?? '';
    const nextObj = searchParams.get('object') ?? '';
    const nextObjId = searchParams.get('object_id') ?? '';

    if (nextQ !== qText) setQText(nextQ);
    if (nextEvent !== eventType) setEventType(nextEvent);
    if (nextSession !== userSession) setUserSession(nextSession);
    if (nextObj !== object) setObject(nextObj);
    if (nextObjId !== objectId) setObjectId(nextObjId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (view === 'actions') next.set('view', 'actions');
    else next.delete('view');

    const q = qText.trim();
    if (q) next.set('q', q);
    else next.delete('q');

    const et = eventType.trim();
    if (et) next.set('event_type', et);
    else next.delete('event_type');

    const sid = safeNumber(userSession);
    if (sid) next.set('user_session', String(sid));
    else next.delete('user_session');

    const obj = object.trim();
    if (view === 'actions' && obj) next.set('object', obj);
    else next.delete('object');

    const oid = safeNumber(objectId);
    if (view === 'actions' && oid) next.set('object_id', String(oid));
    else next.delete('object_id');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [eventType, object, objectId, qText, searchParams, setSearchParams, userSession, view]);

  const qTrim = useMemo(() => qText.trim(), [qText]);
  const eventTypeTrim = useMemo(() => eventType.trim(), [eventType]);
  const userSessionId = useMemo(() => safeNumber(userSession), [userSession]);
  const objectTrim = useMemo(() => object.trim(), [object]);
  const objectIdNum = useMemo(() => safeNumber(objectId), [objectId]);

  const pagination = useKeysetPagination({
    id: 'admin.user.history',
    filterKey: JSON.stringify({
      view,
      userId,
      q: qTrim || null,
      eventType: eventTypeTrim || null,
      userSessionId: userSessionId ?? null,
      object: view === 'actions' ? objectTrim || null : null,
      objectId: view === 'actions' ? objectIdNum ?? null : null,
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const qHistory = useQuery({
    queryKey: [
      'object_history',
      'index',
      {
        view,
        userId,
        q: qTrim || null,
        eventType: eventTypeTrim || null,
        userSessionId: userSessionId ?? null,
        object: view === 'actions' ? objectTrim || null : 'User',
        objectId: view === 'actions' ? objectIdNum ?? null : userId,
        fromId: pagination.fromId ?? null,
        limit: pagination.limit,
      },
    ],
    queryFn: async () => {
      if (view === 'actions') {
        return (
          await fetchObjectHistoryEvents({
            userId,
            userSessionId,
            object: objectTrim || undefined,
            objectId: objectIdNum,
            eventType: eventTypeTrim || undefined,
            fromId: pagination.fromId ?? undefined,
            limit: pagination.limit,
          })
        ).data;
      }

      return (
        await fetchObjectHistoryEvents({
          object: 'User',
          objectId: userId,
          userSessionId,
          eventType: eventTypeTrim || undefined,
          fromId: pagination.fromId ?? undefined,
          limit: pagination.limit,
        })
      ).data;
    },
  });

  const rawHistory = qHistory.data ?? [];
  const visibleHistory = useMemo(() => {
    const needle = qTrim.toLowerCase();
    return needle
      ? rawHistory.filter((event) =>
          [event.id, event.event_type, event.object, event.object_id, event.user?.login, event.user?.label, JSON.stringify(event.event_data ?? null)]
            .some((value) => String(value ?? '').toLowerCase().includes(needle)))
      : rawHistory;
  }, [qTrim, rawHistory]);
  const pageCursor = useMemo(() => cursorFromDescendingPage(rawHistory, (event) => event.id), [rawHistory]);
  const hasMore = rawHistory.length >= pagination.limit;

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [searchParams]);
  const filtersActive = Boolean(
    qTrim || eventTypeTrim || userSessionId || (view === 'actions' && (objectTrim || objectIdNum)) || smartErrors.length > 0
  );

  function clearFilters() {
    setQText('');
    setEventType('');
    setUserSession('');
    setObject('');
    setObjectId('');
    setSmart('');
    setSmartErrors([]);
  }

  useEffect(() => {
    if (smart.trim() === '?') setHelpOpen(true);
  }, [smart]);

  const openAudit = (historyId: number) => {
    navigate(`${basePath}/audit/${historyId}`);
  };

  async function applySmartText(raw: string) {
    const input = String(raw ?? '').trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 1) {
      const numeric = parseNumericToken(tokens[0] ?? '');
      if (numeric) {
        openAudit(numeric);
        setSmart('');
        setSmartErrors([]);
        return;
      }
    }

    const free: string[] = [];
    const errs: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        free.push(unquoteSmartValue(token));
        continue;
      }

      const key = canonicalKey(kv.rawKey);
      const value = unquoteSmartValue(kv.rawValue);

      if (!key) {
        errs.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
        continue;
      }

      if (!value.trim()) {
        errs.push(t('filters.smart.error.missing_value', { key: kv.rawKey.trim() }));
        continue;
      }

      if (key === 'id') {
        const id = parseNumericToken(value);
        if (!id) {
          errs.push(t('audit.smart.error.id', { value }));
          continue;
        }
        openAudit(id);
        setSmart('');
        setSmartErrors([]);
        return;
      }

      if (key === 'q') {
        setQText(value);
        continue;
      }

      if (key === 'session') {
        const sid = parseNumericToken(value);
        if (!sid) {
          errs.push(t('audit.smart.error.session', { value }));
          continue;
        }
        setUserSession(String(sid));
        continue;
      }

      if (key === 'event') {
        setEventType(value);
        continue;
      }

      if (view !== 'actions') {
        errs.push(t('admin.user.history.smart.error.actions_only', { key: kv.rawKey.trim() }));
        continue;
      }

      if (key === 'object') {
        setObject(value);
        continue;
      }

      if (key === 'object_id') {
        const oid = parseNumericToken(value);
        if (!oid) {
          errs.push(t('audit.smart.error.object_id', { value }));
          continue;
        }
        setObjectId(String(oid));
      }
    }

    const nextQ = free.join(' ').trim();
    if (nextQ) setQText(nextQ);

    setSmart('');
    setSmartErrors(errs);
    if (errs.length > 0) {
      toasts.pushToast({ variant: 'danger', title: errs[0] ?? t('common.unknown_error') });
    }
  }

  const smartNeedle = smart.trim();
  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    const needle = smartNeedle;
    const out: SmartFilterSuggestion[] = [];
    if (!needle) return out;

    if (needle === '?') {
      out.push({
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.user.history.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num) {
      out.push({
        id: `open.${num}`,
        primary: t('admin.user.history.smart.suggest.open', { id: num }),
        secondary: t('admin.user.history.smart.suggest.open.secondary'),
        onPick: () => {
          openAudit(num);
          setSmart('');
        },
        testId: 'admin.user.history.smart.suggest.open',
      });

      out.push({
        id: `search.${num}`,
        primary: t('admin.user.history.smart.suggest.search', { value: String(num) }),
        secondary: t('admin.user.history.smart.suggest.search.secondary'),
        onPick: () => {
          setQText(String(num));
          setSmart('');
        },
        testId: 'admin.user.history.smart.suggest.search',
      });
    } else {
      out.push({
        id: 'search',
        primary: t('admin.user.history.smart.suggest.search', { value: needle }),
        secondary: t('admin.user.history.smart.suggest.search.secondary'),
        onPick: () => {
          setQText(needle);
          setSmart('');
        },
        testId: 'admin.user.history.smart.suggest.search',
      });
    }

    if (!needle.includes(':')) {
      out.push({
        id: 'event-key',
        primary: t('admin.user.history.smart.suggest.event'),
        secondary: t('admin.user.history.smart.suggest.event.secondary'),
        onPick: () => setSmart('event:'),
        testId: 'admin.user.history.smart.suggest.event',
      });
      out.push({
        id: 'session-key',
        primary: t('admin.user.history.smart.suggest.session'),
        secondary: t('admin.user.history.smart.suggest.session.secondary'),
        onPick: () => setSmart('session:'),
        testId: 'admin.user.history.smart.suggest.session',
      });
      if (view === 'actions') {
        out.push({
          id: 'object-key',
          primary: t('admin.user.history.smart.suggest.object'),
          secondary: t('admin.user.history.smart.suggest.object.secondary'),
          onPick: () => setSmart('object:'),
          testId: 'admin.user.history.smart.suggest.object',
        });
        out.push({
          id: 'object-id-key',
          primary: t('admin.user.history.smart.suggest.object_id'),
          secondary: t('admin.user.history.smart.suggest.object_id.secondary'),
          onPick: () => setSmart('object_id:'),
          testId: 'admin.user.history.smart.suggest.object_id',
        });
      }
    } else {
      const kv = splitKeyValueToken(needle);
      if (kv) {
        const key = canonicalKey(kv.rawKey);
        const value = unquoteSmartValue(kv.rawValue);
        if (key === 'event' && value) {
          out.push({
            id: 'apply-event',
            primary: t('admin.user.history.smart.suggest.apply_event', { value }),
            secondary: t('admin.user.history.smart.suggest.apply.secondary'),
            onPick: () => {
              setEventType(value);
              setSmart('');
            },
            testId: 'admin.user.history.smart.suggest.apply_event',
          });
        }
        if (view === 'actions' && key === 'object' && value) {
          out.push({
            id: 'apply-object',
            primary: t('admin.user.history.smart.suggest.apply_object', { value }),
            secondary: t('admin.user.history.smart.suggest.apply.secondary'),
            onPick: () => {
              setObject(value);
              setSmart('');
            },
            testId: 'admin.user.history.smart.suggest.apply_object',
          });
        }
        if (view === 'actions' && key === 'object_id') {
          const oid = parseNumericToken(value);
          if (oid) {
            out.push({
              id: 'apply-object-id',
              primary: t('admin.user.history.smart.suggest.apply_object_id', { value: String(oid) }),
              secondary: t('admin.user.history.smart.suggest.apply.secondary'),
              onPick: () => {
                setObjectId(String(oid));
                setSmart('');
              },
              testId: 'admin.user.history.smart.suggest.apply_object_id',
            });
          }
        }
        if (key === 'session') {
          const sid = parseNumericToken(value);
          if (sid) {
            out.push({
              id: 'apply-session',
              primary: t('admin.user.history.smart.suggest.apply_session', { value: String(sid) }),
              secondary: t('admin.user.history.smart.suggest.apply.secondary'),
              onPick: () => {
                setUserSession(String(sid));
                setSmart('');
              },
              testId: 'admin.user.history.smart.suggest.apply_session',
            });
          }
        }
      }
    }

    return out;
  }, [basePath, smartNeedle, t, view]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    if (qTrim) {
      chips.push(
        <FilterChip
          key="q"
          label={`q:${qTrim}`}
          onRemove={() => setQText('')}
          testId="admin.user.history.chip.q"
        />
      );
    }
    if (eventTypeTrim) {
      const tone = eventBadgeVariant(eventTypeTrim);
      chips.push(
        <FilterChip
          key="event"
          label={`event:${eventTypeTrim}`}
          tone={tone === 'black' ? 'neutral' : tone}
          onRemove={() => setEventType('')}
          testId="admin.user.history.chip.event"
        />
      );
    }

    if (userSessionId) {
      chips.push(
        <FilterChip
          key="session"
          label={`session:#${userSessionId}`}
          onRemove={() => setUserSession('')}
          testId="admin.user.history.chip.session"
        />
      );
    }

    if (view === 'actions' && objectTrim) {
      chips.push(
        <FilterChip
          key="object"
          label={`object:${objectTrim}`}
          onRemove={() => setObject('')}
          testId="admin.user.history.chip.object"
        />
      );
    }

    if (view === 'actions' && objectIdNum) {
      chips.push(
        <FilterChip
          key="object_id"
          label={`object_id:#${objectIdNum}`}
          onRemove={() => setObjectId('')}
          testId="admin.user.history.chip.object_id"
        />
      );
    }

    smartErrors.forEach((msg, i) => {
      chips.push(
        <FilterChip
          key={`err.${i}`}
          label={msg}
          tone="danger"
          onRemove={() => setSmartErrors((prev) => prev.filter((_, idx) => idx !== i))}
          testId={`admin.user.history.chip.error.${i}`}
        />
      );
    });

    return chips;
  }, [eventTypeTrim, objectIdNum, objectTrim, qTrim, smartErrors, userSessionId, view]);

  const openAuditHref = useMemo(() => {
    const qs = new URLSearchParams();
    const q = qText.trim();
    if (q) qs.set('q', q);

    const et = eventType.trim();
    if (et) qs.set('event_type', et);

    const sid = safeNumber(userSession);
    if (sid) qs.set('user_session', String(sid));

    if (view === 'actions') {
      qs.set('user', String(userId));
      const obj = object.trim();
      if (obj) qs.set('object', obj);
      const objId = safeNumber(objectId);
      if (objId) qs.set('object_id', String(objId));
    } else {
      qs.set('object', 'User');
      qs.set('object_id', String(userId));
    }

    const s = qs.toString();
    return `${basePath}/audit${s ? `?${s}` : ''}`;
  }, [basePath, eventType, object, objectId, qText, userId, userSession, view]);

  return (
    <div className="space-y-3">
      <FilterBar testId="admin.user.history.filters">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs font-medium text-muted">{t('admin.user.history.view')}</div>
            <div className="mt-1 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className={view === 'changes' ? 'border-accent/60 bg-surface-2' : undefined}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('view');
                  setSearchParams(next, { replace: true });
                }}
                testId="admin.user.history.view.changes"
              >
                {t('admin.user.history.view.changes')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={view === 'actions' ? 'border-accent/60 bg-surface-2' : undefined}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('view', 'actions');
                  setSearchParams(next, { replace: true });
                }}
                testId="admin.user.history.view.actions"
              >
                {t('admin.user.history.view.actions')}
              </Button>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <SmartFilterInput
              ref={smartInputRef}
              value={smart}
              onChange={setSmart}
              placeholder={t('admin.user.history.smart.placeholder')}
              ariaLabel={t('admin.user.history.smart.aria')}
              testId="admin.user.history.smart_filter.input"
              suggestions={smartSuggestions}
              onSubmit={() => void applySmartText(smart)}
              suffix={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  ariaLabel={t('filters.help.open')}
                  testId="admin.user.history.smart_filter.help_btn"
                >
                  <CircleHelp className="h-4 w-4" />
                </Button>
              }
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAdvancedOpen(true)}
            ariaLabel={t('filters.advanced.open')}
            testId="admin.user.history.filters.advanced"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>

          <Button as="a" href={openAuditHref} variant="secondary" size="sm" testId="admin.user.history.open_audit">
            {t('admin.user.history.open_audit')}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void qHistory.refetch()}
            disabled={qHistory.isFetching}
            testId="admin.user.history.refresh"
          >
            {t('common.refresh')}
          </Button>

          <CopyButton
            text={shareUrl}
            label={t('common.copy_link')}
            size="sm"
            variant="secondary"
            testId="admin.user.history.copy_link"
          />

          {filtersActive ? (
            <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.user.history.clear">
              {t('common.clear_filters')}
            </Button>
          ) : null}
        </div>
      </FilterBar>

      {activeFilterChips.length ? <div className="flex flex-wrap gap-2">{activeFilterChips}</div> : null}

      <SmartInputHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('filters.help.title')}
        intro={t('admin.user.history.smart_help.intro')}
        examples={[
          { example: '?', description: t('filters.help.examples.help') },
          { example: 'delete', description: t('admin.user.history.smart_help.examples.search') },
          { example: 'event:update', description: t('admin.user.history.smart_help.examples.event') },
          ...(view === 'actions'
            ? [
                { example: 'object:Vps object_id:123', description: t('admin.user.history.smart_help.examples.object') },
                { example: 'session:55', description: t('admin.user.history.smart_help.examples.session') },
              ]
            : []),
          { example: '200', description: t('admin.user.history.smart_help.examples.open') },
        ]}
        topKeys={[
          { key: 'q', description: t('admin.user.history.smart_help.keys.q'), example: 'q:delete' },
          { key: 'event', description: t('admin.user.history.smart_help.keys.event'), example: 'event:update' },
          { key: 'session', description: t('admin.user.history.smart_help.keys.session'), example: 'session:55' },
        ]}
        moreKeys={view === 'actions' ? [
          { key: 'object', description: t('admin.user.history.smart_help.keys.object'), example: 'object:Vps' },
          { key: 'object_id', description: t('admin.user.history.smart_help.keys.object_id'), example: 'object_id:123' },
          { key: 'id', description: t('admin.user.history.smart_help.keys.id'), example: 'id:200' },
        ] : [
          { key: 'id', description: t('admin.user.history.smart_help.keys.id'), example: 'id:200' },
        ]}
        inference={[
          t('admin.user.history.smart_help.inference.enter_applies'),
          t('admin.user.history.smart_help.inference.number_opens'),
          t('admin.user.history.smart_help.inference.key_value'),
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
        testId="admin.user.history.smart_filter.help"
        keyRowTestIdPrefix="admin.user.history.smart_filter.help.key"
      />

      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title={t('filters.advanced.title')}
        width="lg"
        testId="admin.user.history.advanced_filters"
        footer={
          <div className="flex items-center justify-end gap-2">
            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                {t('common.clear_filters')}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => setAdvancedOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">{t('common.search')}</div>
            <div className="mt-1">
              <Input
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder={t('admin.user.history.smart_help.drawer.q_placeholder')}
                testId="admin.user.history.filter.q"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">{t('audit.filter.session')}</div>
            <div className="mt-1">
              <Input
                value={userSession}
                onChange={(e) => setUserSession(e.target.value)}
                placeholder={t('audit.filter.session_placeholder')}
                testId="admin.user.history.filter.session"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">{t('audit.filter.event_type')}</div>
            <div className="mt-1">
              <Input
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder={t('audit.filter.event_type_placeholder')}
                testId="admin.user.history.filter.event_type"
              />
            </div>
          </div>

          {view === 'actions' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium">{t('audit.filter.object')}</div>
                <div className="mt-1">
                  <Input
                    value={object}
                    onChange={(e) => setObject(e.target.value)}
                    placeholder={t('audit.filter.object_placeholder')}
                    testId="admin.user.history.filter.object"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('audit.filter.object_id')}</div>
                <div className="mt-1">
                  <Input
                    value={objectId}
                    onChange={(e) => setObjectId(e.target.value)}
                    placeholder={t('audit.filter.object_id_placeholder')}
                    inputMode="numeric"
                    testId="admin.user.history.filter.object_id"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
            {t('admin.user.history.smart_help.drawer.hint')}
          </div>
        </div>
      </Drawer>

      <TableCard
        tableTestId="admin.user.history.table"
        footer={
          <KeysetPagination
            testId="admin.user.history.pagination"
            page={pagination.page}
            pageCount={pagination.pageCount}
            canPrev={pagination.canPrev}
            canNext={hasMore}
            onPrev={pagination.goPrev}
            onNext={() => pagination.goNext(pageCursor)}
            onGoToPage={pagination.goToPage}
            limit={pagination.limit}
            allowedLimits={pagination.allowedLimits}
            onLimitChange={pagination.setLimit}
          />
        }
      >
        <thead>
          <tr>
            <th className="w-8 px-3 py-2" aria-label={t('common.state')} />
            <th className="px-3 py-2">{t('audit.col.created')}</th>
            <th className="px-3 py-2">{t('audit.col.event')}</th>
            {view === 'changes' ? <th className="px-3 py-2">{t('audit.col.user')}</th> : null}
            {view === 'actions' ? <th className="px-3 py-2">{t('audit.col.object')}</th> : null}
            <th className="px-3 py-2">{t('audit.col.session')}</th>
            <th className="px-3 py-2">{t('audit.col.data')}</th>
          </tr>
        </thead>
        <tbody>
          {qHistory.isLoading ? (
            <tr>
              <td colSpan={6} className="p-4">
                <LoadingState />
              </td>
            </tr>
          ) : null}

          {qHistory.isError ? (
            <tr>
              <td colSpan={6} className="p-4">
                <ErrorState title={t('audit.load_error.title')} error={qHistory.error} showDetails />
              </td>
            </tr>
          ) : null}

          {!qHistory.isLoading && !qHistory.isError ? (
            visibleHistory.length > 0 ? (
              visibleHistory.map((ev: ObjectHistoryEvent) => {
                const badgeVariant = eventBadgeVariant(ev.event_type);
                const rowVariant = eventVariant(ev.event_type);
                const dotVariant = dotVariantFromBadgeVariant(badgeVariant);
                return (
                <TableRowLink
                  key={ev.id}
                  to={`${basePath}/audit/${ev.id}`}
                  variant={rowVariant}
                  testId={`admin.user.history.row.${ev.id}`}
                >
                  <td className="px-3 py-2">
                    <StatusDot variant={dotVariant} testId={`admin.user.history.row.${ev.id}.dot`} ariaLabel={String(ev.event_type ?? na)} />
                  </td>
                  <td className="px-3 py-2 font-medium tabular-nums">{formatDateTime(ev.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant}>{String(ev.event_type ?? na)}</Badge>
                    </div>
                  </td>
                  {view === 'changes' ? <td className="px-3 py-2 text-xs text-muted">{userLabel(ev, na)}</td> : null}
                  {view === 'actions' ? <td className="px-3 py-2 text-xs text-muted">{trackedObjectLabel(ev, na)}</td> : null}
                  <td className="px-3 py-2 text-xs text-muted">{sessionLabel(ev, na)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{eventDataSummary(ev) || '—'}</td>
                </TableRowLink>
              );
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-6">
                  <EmptyState title={t('audit.empty')} />
                </td>
              </tr>
            )
          ) : null}
        </tbody>
      </TableCard>
    </div>
  );
}
