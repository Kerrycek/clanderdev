import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, SlidersHorizontal } from 'lucide-react';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { FilterBar } from '../../../components/layout/FilterBar';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';

import { searchUsers } from '../../../lib/api/users';
import { formatDateTime } from '../../../lib/format';
import { useDebouncedValue } from '../../../lib/hooks/useDebouncedValue';

import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../lib/smartFilter';

import { eventBadgeVariant, eventDataSummary, eventVariant, sessionLabel, trackedObjectLabel, userLabel } from '../../../lib/auditUi';
import { dotVariantFromBadgeVariant } from '../../../lib/variantMap';

import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
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
import { canonicalKey, safeNumber } from './audit/auditFilterSemantics';
import { useAuditListPaging } from './audit/useAuditListPaging';

export function AuditPage() {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const na = t('common.na');

  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const [qText, setQText] = useState(() => searchParams.get('q') ?? '');
  const [user, setUser] = useState(() => searchParams.get('user') ?? '');
  const [userSession, setUserSession] = useState(() => searchParams.get('user_session') ?? '');
  const [object, setObject] = useState(() => searchParams.get('object') ?? '');
  const [objectId, setObjectId] = useState(() => searchParams.get('object_id') ?? '');
  const [eventType, setEventType] = useState(() => searchParams.get('event_type') ?? '');

  // Smart filter input (unapplied text).
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const smartNeedle = smart.trim();
  const debouncedSmartNeedle = useDebouncedValue(smartNeedle, 150);
  const smartInputRef = useRef<HTMLInputElement>(null);

  // Sync local state from browser navigation.
  useEffect(() => {
    const current = new URLSearchParams(searchParamsKey);
    setQText(current.get('q') ?? '');
    setUser(current.get('user') ?? '');
    setUserSession(current.get('user_session') ?? '');
    setObject(current.get('object') ?? '');
    setObjectId(current.get('object_id') ?? '');
    setEventType(current.get('event_type') ?? '');
  }, [searchParamsKey]);

  // Persist filters in URL (shareable).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    const q = qText.trim();
    if (q) next.set('q', q);
    else next.delete('q');

    const userId = safeNumber(user);
    if (userId) next.set('user', String(userId));
    else next.delete('user');

    const sessId = safeNumber(userSession);
    if (sessId) next.set('user_session', String(sessId));
    else next.delete('user_session');

    const obj = object.trim();
    if (obj) next.set('object', obj);
    else next.delete('object');

    const objId = safeNumber(objectId);
    if (objId) next.set('object_id', String(objId));
    else next.delete('object_id');

    const et = eventType.trim();
    if (et) next.set('event_type', et);
    else next.delete('event_type');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [eventType, object, objectId, qText, searchParams, setSearchParams, user, userSession]);

  const qTrim = useMemo(() => qText.trim(), [qText]);
  const userId = useMemo(() => safeNumber(user), [user]);
  const userSessionId = useMemo(() => safeNumber(userSession), [userSession]);
  const objectTrim = useMemo(() => object.trim(), [object]);
  const objectIdNum = useMemo(() => safeNumber(objectId), [objectId]);
  const eventTypeTrim = useMemo(() => eventType.trim(), [eventType]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [searchParams]);

  const filtersActive = Boolean(
    qTrim || userId || userSessionId || objectTrim || objectIdNum || eventTypeTrim || smartErrors.length > 0
  );

  function clearFilters() {
    setQText('');
    setUser('');
    setUserSession('');
    setObject('');
    setObjectId('');
    setEventType('');
    setSmart('');
    setSmartErrors([]);
  }

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const userSuggestQuery = useQuery({
    queryKey: ['users', 'search', { q: debouncedSmartNeedle }],
    enabled:
      debouncedSmartNeedle.length >= 2 &&
      debouncedSmartNeedle !== '?' &&
      !debouncedSmartNeedle.includes(':') &&
      !debouncedSmartNeedle.includes(' ') &&
      parseNumericToken(debouncedSmartNeedle) === null,
    queryFn: async () => (await searchUsers({ q: debouncedSmartNeedle, limit: 6 })).data,
    staleTime: 10_000,
  });

  const {
    pagination,
    eventsQ,
    events,
    rawEvents,
    canPaginate,
    pageCursor,
    pageCount,
    totalPagesKnown,
    canNext: canNextPage,
    goToPage,
    maxDirectPage,
    isJumping,
  } = useAuditListPaging({
    filters: { q: qTrim, userId, userSessionId, object: objectTrim, objectId: objectIdNum, eventType: eventTypeTrim },
    searchParams,
    setSearchParams,
  });

  const openAudit = (historyId: number) => {
    navigate(`${basePath}/audit/${historyId}`);
  };

  async function resolveUser(value: string): Promise<{ id?: number; err?: 'none' | 'ambiguous' }> {
    const needle = String(value ?? '').trim();
    const needleLc = needle.toLowerCase();
    if (!needle) return { err: 'none' };

    try {
      const list = (await searchUsers({ q: needle, limit: 10 })).data;
      if (list.length === 0) return { err: 'none' };
      if (list.length === 1) return { id: Number((list[0] as any).id) };

      const exact = list.filter((u) => String((u as any).login ?? '').trim().toLowerCase() === needleLc);
      if (exact.length === 1) return { id: Number((exact[0] as any).id) };

      return { err: 'ambiguous' };
    } catch {
      return { err: 'none' };
    }
  }

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

    // Pure numeric → open audit event by default.
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

      if (key === 'user') {
        const id = parseNumericToken(value);
        if (id) {
          setUser(String(id));
          continue;
        }

        const r = await resolveUser(value);
        if (r.id) {
          setUser(String(r.id));
          continue;
        }

        if (r.err === 'ambiguous') errs.push(t('audit.smart.error.user_ambiguous', { value }));
        else errs.push(t('audit.smart.error.user_not_found', { value }));
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
        continue;
      }

      if (key === 'event') {
        setEventType(value);
        continue;
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
        testId: 'admin.audit.smart.suggest.help',
      });
      return out;
    }

    const num = parseNumericToken(needle);
    if (num) {
      out.push({
        id: `open.${num}`,
        primary: t('audit.smart.suggest.open', { id: num }),
        secondary: t('audit.smart.suggest.open.secondary'),
        onPick: () => {
          openAudit(num);
          setSmart('');
        },
        testId: 'admin.audit.smart.suggest.open',
      });
    }

    const uList = userSuggestQuery.data ?? [];
    if (needle.length >= 2 && !needle.includes(':') && uList.length > 0) {
      for (const u of uList.slice(0, 5)) {
        const id = Number((u as any).id);
        const login = String((u as any).login ?? '').trim();
        if (!Number.isFinite(id) || id <= 0 || !login) continue;
        out.push({
          id: `user.${id}`,
          primary: `user:${id}`,
          secondary: t('audit.smart.suggest.user', { login }),
          onPick: () => {
            setUser(String(id));
            setSmart('');
          },
          testId: `admin.audit.smart.suggest.user.${id}`,
        });
      }
    }

    out.push({
      id: 'search',
      primary: t('audit.smart.suggest.search', { q: needle }),
      secondary: t('audit.smart.suggest.search.secondary'),
      onPick: () => {
        setQText(needle);
        setSmart('');
      },
      testId: 'admin.audit.smart.suggest.search',
    });

    return out;
  }, [openAudit, smartNeedle, t, userSuggestQuery.data]);

  const activeFilterChips = useMemo(() => {
    const chips: React.ReactNode[] = [];

    if (qTrim) {
      chips.push(
        <FilterChip key="q" label={`q:${qTrim}`} tone="neutral" onRemove={() => setQText('')} testId="admin.audit.chip.q" />
      );
    }

    if (userId) {
      chips.push(
        <FilterChip
          key="user"
          label={`user:${userId}`}
          tone="neutral"
          onRemove={() => setUser('')}
          testId="admin.audit.chip.user"
        />
      );
    }

    if (userSessionId) {
      chips.push(
        <FilterChip
          key="session"
          label={`session:${userSessionId}`}
          tone="neutral"
          onRemove={() => setUserSession('')}
          testId="admin.audit.chip.session"
        />
      );
    }

    if (objectTrim) {
      chips.push(
        <FilterChip
          key="object"
          label={`object:${objectTrim}`}
          tone="neutral"
          onRemove={() => setObject('')}
          testId="admin.audit.chip.object"
        />
      );
    }

    if (objectIdNum) {
      chips.push(
        <FilterChip
          key="object_id"
          label={`object_id:${objectIdNum}`}
          tone="neutral"
          onRemove={() => setObjectId('')}
          testId="admin.audit.chip.object_id"
        />
      );
    }

    if (eventTypeTrim) {
      chips.push(
        <FilterChip
          key="event"
          label={`event:${eventTypeTrim}`}
          tone="neutral"
          onRemove={() => setEventType('')}
          testId="admin.audit.chip.event"
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
          testId={`admin.audit.chip.error.${idx}`}
        />
      );
    });

    return chips;
  }, [eventTypeTrim, objectIdNum, objectTrim, qTrim, setEventType, setObject, setObjectId, setQText, setUser, setUserSession, smartErrors, userId, userSessionId]);

  return (
    <ListShell
      testId="admin.audit.page"
      header={<PageHeader title={t('audit.title')} description={t('audit.subtitle')} />}
      filters={
        <>
          <FilterBar testId="admin.audit.filters">
            <SmartFilterInput
              ref={smartInputRef}
              value={smart}
              onChange={setSmart}
              placeholder={t('audit.smart.placeholder')}
              ariaLabel={t('audit.smart.aria')}
              testId="admin.audit.smart_filter.input"
              suggestions={smartSuggestions}
              onSubmit={() => void applySmartText(smart)}
              suffix={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  ariaLabel={t('filters.help.open')}
                  testId="admin.audit.smart_filter.help_btn"
                >
                  <CircleHelp className="h-4 w-4" />
                </Button>
              }
            />

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedOpen(true)}
              ariaLabel={t('filters.advanced.open')}
              testId="admin.audit.filters.advanced"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void eventsQ.refetch()}
              disabled={eventsQ.isFetching}
              testId="admin.audit.refresh"
            >
              {t('common.refresh')}
            </Button>

            <CopyButton
              text={shareUrl}
              label={t('common.copy_link')}
              size="sm"
              variant="secondary"
              testId="admin.audit.filters.copy_link"
            />

            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters} testId="admin.audit.clear">
                {t('common.clear_filters')}
              </Button>
            ) : null}
          </FilterBar>

          {activeFilterChips.length ? <div className="flex flex-wrap gap-2">{activeFilterChips}</div> : null}

          {qTrim ? <div className="text-xs text-faint">{t('list.meta.filters_progressive')}</div> : null}

          <SmartInputHelp
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            title={t('filters.help.title')}
            intro={t('audit.smart_help.intro')}
            examples={[
              { label: t('filters.help.examples.help'), value: '?' },
              { label: t('audit.smart_help.examples.search'), value: 'delete' },
              { label: t('audit.smart_help.examples.user'), value: 'user:alice' },
              { label: t('audit.smart_help.examples.object'), value: 'object:Vps object_id:123' },
              { label: t('audit.smart_help.examples.open'), value: '200' },
            ]}
            topKeys={[
              { key: 'q', description: t('audit.smart_help.keys.q'), example: 'q:delete' },
              { key: 'user', description: t('audit.smart_help.keys.user'), example: 'user:123' },
              { key: 'session', description: t('audit.smart_help.keys.session'), example: 'session:55' },
              { key: 'event', description: t('audit.smart_help.keys.event'), example: 'event:update' },
            ]}
            moreKeys={[
              { key: 'object', description: t('audit.smart_help.keys.object'), example: 'object:Vps' },
              { key: 'object_id', description: t('audit.smart_help.keys.object_id'), example: 'object_id:123' },
              { key: 'id', description: t('audit.smart_help.keys.id'), example: 'id:200' },
            ]}
            inference={[t('audit.smart_help.inference.enter_applies'), t('audit.smart_help.inference.number_opens'), t('audit.smart_help.inference.key_value')]}
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
            testId="admin.audit.smart_filter.help"
            keyRowTestIdPrefix="admin.audit.smart_filter.help.key"
          />

          <Drawer
            open={advancedOpen}
            onClose={() => setAdvancedOpen(false)}
            title={t('filters.advanced.title')}
            width="lg"
            testId="admin.audit.advanced_filters"
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
                    placeholder={t('audit.smart_help.drawer.q_placeholder')}
                    testId="admin.audit.filter.q"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('audit.filter.user')}</div>
                <div className="mt-1">
                  <UserLookupInput
                    value={user}
                    onChange={setUser}
                    placeholder={t('audit.filter.user_placeholder')}
                    testId="admin.audit.filter.user"
                    loadingLabel={t('common.loading')}
                    noResultsLabel={t('common.no_results')}
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
                    testId="admin.audit.filter.session"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium">{t('audit.filter.object')}</div>
                  <div className="mt-1">
                    <Input
                      value={object}
                      onChange={(e) => setObject(e.target.value)}
                      placeholder={t('audit.filter.object_placeholder')}
                      testId="admin.audit.filter.object"
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
                      testId="admin.audit.filter.object_id"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">{t('audit.filter.event_type')}</div>
                <div className="mt-1">
                  <Input
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    placeholder={t('audit.filter.event_type_placeholder')}
                    testId="admin.audit.filter.event_type"
                  />
                </div>
              </div>

              <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                {t('audit.smart_help.drawer.hint')}
              </div>
            </div>
          </Drawer>
        </>
      }
    >
      {eventsQ.isLoading ? (
        <LoadingState testId="admin.audit.loading" />
      ) : eventsQ.isError ? (
        <ErrorState
          testId="admin.audit.error"
          title={t('audit.load_failed')}
          error={eventsQ.error}
          onRetry={() => void eventsQ.refetch()}
          detailsExtra={{ page: 'admin.audit' }}
        />
      ) : events.length === 0 ? (
        <div className="space-y-2">
          <EmptyState
            testId="admin.audit.empty"
            title={t('audit.empty.title')}
            body={t('audit.empty.body')}
            actionLabel={t('common.clear_filters')}
            onAction={clearFilters}
          />
          {canPaginate && (rawEvents.length > 0 || pagination.canPrev || canNextPage) ? (
            <KeysetPagination
              page={pagination.page}
              pageCount={pageCount}
              totalPagesKnown={totalPagesKnown}
              maxDirectPage={maxDirectPage}
              jumpPending={isJumping}
              canPrev={pagination.canPrev}
              canNext={canNextPage}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              testId="admin.audit.pagination"
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-lg border border-border bg-surface shadow-sm">
            <KeysetPagination
              page={pagination.page}
              pageCount={pageCount}
              totalPagesKnown={totalPagesKnown}
              maxDirectPage={maxDirectPage}
              jumpPending={isJumping}
              canPrev={pagination.canPrev}
              canNext={canNextPage}
              onPrev={pagination.goPrev}
              onNext={() => pagination.goNext(pageCursor)}
              onGoToPage={goToPage}
              limit={pagination.limit}
              allowedLimits={pagination.allowedLimits}
              onLimitChange={pagination.setLimit}
              className="border-t-0"
              testId="admin.audit.pagination.top"
            />
          </div>

          <TableCard
            testId="admin.audit.table"
            minWidth="lg"
            footer={
              <KeysetPagination
                page={pagination.page}
                pageCount={pageCount}
                totalPagesKnown={totalPagesKnown}
                maxDirectPage={maxDirectPage}
                jumpPending={isJumping}
                canPrev={pagination.canPrev}
                canNext={canNextPage}
                onPrev={pagination.goPrev}
                onNext={() => pagination.goNext(pageCursor)}
                onGoToPage={goToPage}
                limit={pagination.limit}
                allowedLimits={pagination.allowedLimits}
                onLimitChange={pagination.setLimit}
                testId="admin.audit.pagination"
              />
            }
          >
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-8 px-2 py-2" aria-label={t('common.state')} />
                <th className="px-3 py-2">{t('audit.table.time')}</th>
                <th className="px-3 py-2">{t('audit.table.user')}</th>
                <th className="px-3 py-2">{t('audit.table.session')}</th>
                <th className="px-3 py-2">{t('audit.table.object')}</th>
                <th className="px-3 py-2">{t('audit.table.event')}</th>
                <th className="px-3 py-2">{t('audit.table.data')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const label = ev.event_type ? String(ev.event_type) : na;
                const variant = eventVariant(ev.event_type);
                const badgeVariant = eventBadgeVariant(ev.event_type);
                const dotVariant = dotVariantFromBadgeVariant(badgeVariant);
                const summary = eventDataSummary(ev);

                return (
                  <TableRowLink
                    key={ev.id}
                    to={`${basePath}/audit/${ev.id}`}
                    variant={variant}
                    testId={`admin.audit.row.${ev.id}`}
                  >
                    <td className="px-2 py-2">
                      <StatusDot variant={dotVariant} testId={`admin.audit.row.${ev.id}.dot`} ariaLabel={label} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted tabular-nums">
                      {ev.created_at ? formatDateTime(ev.created_at) : na}
                    </td>
                    <td className="px-3 py-2 text-sm text-fg">{userLabel(ev, na)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{sessionLabel(ev, na)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{trackedObjectLabel(ev, na)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={eventBadgeVariant(ev.event_type)}>{label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-faint">{summary || na}</td>
                  </TableRowLink>
                );
              })}
            </tbody>
          </TableCard>
        </>
      )}
    </ListShell>
  );
}
