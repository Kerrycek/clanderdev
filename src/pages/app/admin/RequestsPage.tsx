import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { useChrome } from '../../../components/layout/ChromeContext';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { searchUsers } from '../../../lib/api/users';
import {
  fetchChangeRequest, fetchChangeRequests, fetchRegistrationRequest,
  fetchRegistrationRequests, resolveChangeRequest, resolveRegistrationRequest,
  type ResolveUserRequestAction,
} from '../../../lib/api/requests';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { useDebouncedValue } from '../../../lib/hooks/useDebouncedValue';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';
import { useTierSlowIntervalMs } from '../../../lib/refreshTiers';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../../lib/smartFilter';
import { requestStateLabelKey, requestTypeLabelKey } from '../../../lib/requestsBadges';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import type { SmartFilterSuggestion } from '../../../components/ui/SmartFilterInput';
import { RequestsBulkActions } from './RequestsBulkActions';
import { RequestsExpandedContent } from './RequestsExpandedContent';
import { RequestsFilters } from './RequestsFilters';
import { RequestsListContent } from './RequestsListContent';
import { RequestsListStatus } from './RequestsListStatus';
import {
  ALL_ADMIN_REQUEST_STATES, DEFAULT_ADMIN_REQUEST_STATE, adminRequestApiState, adminRequestStateFilterFromUrl,
  canonicalKey,
  changeRows,
  defaultStateOptions,
  mergeByIdDesc,
  parseTypeValue,
  registrationRows, resetAdminRequestPaginationOnFilterChange,
  requestId,
  requestKey,
  requestType,
  requestTypeFilterFromUrl,
  resolveStateValue,
  safeNumber,
  type RequestTypeFilter,
  type UnifiedRequestRow,
  visibleRequestRows,
} from './RequestsModel';

export function RequestsPage() {
  const { basePath, mode } = useAppMode();
  const isAdmin = mode === 'admin';
  const { t } = useI18n();
  const toasts = useToasts();
  const chrome = useChrome();
  const navigate = useNavigate();
  const tierSlowRefetchMs = useTierSlowIntervalMs();
  const [sp, setSp] = useSearchParams();

  const [type, setType] = useState<RequestTypeFilter>(() => requestTypeFilterFromUrl(sp.get('type')));
  const [state, setState] = useState(() => adminRequestStateFilterFromUrl(sp.get('state')));
  const [qText, setQText] = useState(() => sp.get('q') ?? '');
  const [userId, setUserId] = useState(() => sp.get('user') ?? '');
  const [adminId, setAdminId] = useState(() => sp.get('admin') ?? '');
  const [apiIp, setApiIp] = useState(() => sp.get('api_ip') ?? '');
  const [clientIp, setClientIp] = useState(() => sp.get('client_ip') ?? '');
  const [clientPtr, setClientPtr] = useState(() => sp.get('client_ptr') ?? '');

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<ResolveUserRequestAction>('approve');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const smartInputRef = useRef<HTMLInputElement>(null);
  // Sync from URL on navigation.
  useEffect(() => {
    setType(requestTypeFilterFromUrl(sp.get('type')));
    setState(adminRequestStateFilterFromUrl(sp.get('state')));
    setQText(sp.get('q') ?? '');
    setUserId(isAdmin ? sp.get('user') ?? '' : '');
    setAdminId(isAdmin ? sp.get('admin') ?? '' : '');
    setApiIp(sp.get('api_ip') ?? '');
    setClientIp(sp.get('client_ip') ?? '');
    setClientPtr(sp.get('client_ptr') ?? '');
  }, [isAdmin, sp]);

  // Keep filters in the URL.
  useEffect(() => {
    const next = new URLSearchParams(sp);

    if (type && type !== 'all') next.set('type', type);
    else next.delete('type');

    const st = adminRequestStateFilterFromUrl(state);
    if (st !== DEFAULT_ADMIN_REQUEST_STATE && (st === ALL_ADMIN_REQUEST_STATES || defaultStateOptions().includes(st))) next.set('state', st);
    else next.delete('state');

    const q = qText.trim();
    if (q) next.set('q', q);
    else next.delete('q');

    if (isAdmin && userId.trim()) next.set('user', userId.trim());
    else next.delete('user');

    if (isAdmin && adminId.trim()) next.set('admin', adminId.trim());
    else next.delete('admin');

    if (apiIp.trim()) next.set('api_ip', apiIp.trim());
    else next.delete('api_ip');

    if (clientIp.trim()) next.set('client_ip', clientIp.trim());
    else next.delete('client_ip');

    if (clientPtr.trim()) next.set('client_ptr', clientPtr.trim());
    else next.delete('client_ptr');

    resetAdminRequestPaginationOnFilterChange(next, sp);
    if (next.toString() !== sp.toString()) setSp(next, { replace: true });
  }, [adminId, apiIp, clientIp, clientPtr, isAdmin, qText, setSp, sp, state, type, userId]);

  const stateFilter = adminRequestStateFilterFromUrl(state);
  const apiState = adminRequestApiState(stateFilter);
  const qTrim = qText.trim() || undefined;
  const userIdNum = safeNumber(userId);
  const adminIdNum = safeNumber(adminId);

  const filtersActive = Boolean(
    qTrim ||
      (type && type !== 'all') ||
      stateFilter !== DEFAULT_ADMIN_REQUEST_STATE ||
      (isAdmin && userIdNum !== undefined) ||
      (isAdmin && adminIdNum !== undefined) ||
      apiIp.trim() ||
      clientIp.trim() ||
      clientPtr.trim()
  );

  function clearFilters() {
    setType('all');
    setState(DEFAULT_ADMIN_REQUEST_STATE);
    setQText('');
    setUserId('');
    setAdminId('');
    setApiIp('');
    setClientIp('');
    setClientPtr('');
    setSmart('');
    setSmartErrors([]);
  }

  const pagination = useKeysetPagination({
    id: 'admin.requests.list',
    filterKey: JSON.stringify({
      scope: basePath,
      type,
      state: stateFilter,
      q: qTrim,
      user: isAdmin ? userIdNum : undefined,
      admin: isAdmin ? adminIdNum : undefined,
      api_ip: apiIp.trim() || undefined,
      client_ip: clientIp.trim() || undefined,
      client_ptr: clientPtr.trim() || undefined,
    }),
    searchParams: sp,
    setSearchParams: setSp,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200],
  });

  const needRegs = isAdmin && (type === 'all' || type === 'registration');
  const needChanges = isAdmin && (type === 'all' || type === 'change');

  const regQ = useQuery({
    queryKey: [
      'user_request',
      'registrations',
      'index',
      {
        enabled: needRegs,
        limit: pagination.limit,
        fromId: pagination.fromId,
        state: apiState,
        q: qTrim,
        userId: isAdmin ? userIdNum : undefined,
        adminId: isAdmin ? adminIdNum : undefined,
        apiIp: apiIp.trim(),
        clientIp: clientIp.trim(),
        clientPtr: clientPtr.trim(),
      },
    ],
    enabled: needRegs,
    queryFn: async () =>
      await fetchRegistrationRequests({
        limit: pagination.limit,
        fromId: pagination.fromId,
        state: apiState,
        q: qTrim,
        userId: isAdmin ? userIdNum : undefined,
        adminId: isAdmin ? adminIdNum : undefined,
        apiIpAddr: apiIp.trim() || undefined,
        clientIpAddr: clientIp.trim() || undefined,
        clientIpPtr: clientPtr.trim() || undefined,
      }),
    staleTime: 15000,
    refetchInterval: tierSlowRefetchMs,
  });

  const changeQ = useQuery({
    queryKey: [
      'user_request',
      'changes',
      'index',
      {
        enabled: needChanges,
        limit: pagination.limit,
        fromId: pagination.fromId,
        state: apiState,
        q: qTrim,
        userId: isAdmin ? userIdNum : undefined,
        adminId: isAdmin ? adminIdNum : undefined,
        apiIp: apiIp.trim(),
        clientIp: clientIp.trim(),
        clientPtr: clientPtr.trim(),
      },
    ],
    enabled: needChanges,
    queryFn: async () =>
      await fetchChangeRequests({
        limit: pagination.limit,
        fromId: pagination.fromId,
        state: apiState,
        q: qTrim,
        userId: isAdmin ? userIdNum : undefined,
        adminId: isAdmin ? adminIdNum : undefined,
        apiIpAddr: apiIp.trim() || undefined,
        clientIpAddr: clientIp.trim() || undefined,
        clientIpPtr: clientPtr.trim() || undefined,
      }),
    staleTime: 15000,
    refetchInterval: tierSlowRefetchMs,
  });

  const reg = regQ.data?.data ?? [];
  const ch = changeQ.data?.data ?? [];

  const rows = useMemo(() => {
    const raw =
      type === 'registration'
        ? registrationRows(reg)
        : type === 'change'
          ? changeRows(ch)
          : mergeByIdDesc(reg, ch, pagination.limit);

    return visibleRequestRows(raw, stateFilter);
  }, [ch, pagination.limit, reg, stateFilter, type]);

  const visibleKeys = useMemo(() => new Set(rows.map((r) => requestKey(r))), [rows]);
  const allVisibleExpanded = rows.length > 0 && rows.every((r) => expandedKeys.has(requestKey(r)));

  useEffect(() => {
    setExpandedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (visibleKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleKeys]);

  useEffect(() => {
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (visibleKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleKeys]);

  const refreshRequests = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (needRegs) tasks.push(regQ.refetch());
    if (needChanges) tasks.push(changeQ.refetch());
    await Promise.all(tasks);
  }, [changeQ, needChanges, needRegs, regQ]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAllVisible() {
    setExpandedKeys(new Set(rows.map((r) => requestKey(r))));
  }

  function collapseAllVisible() {
    setExpandedKeys(new Set());
  }

  function toggleSelected(key: string, selected: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAllVisible(selected: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        const key = requestKey(row);
        if (selected) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  const selectedRows = useMemo(() => rows.filter((row) => selectedKeys.has(requestKey(row))), [rows, selectedKeys]);
  const bulkCorrectionAllowed = selectedRows.length > 0 && selectedRows.every((row) => requestType(row) === 'registration' && row.state !== 'pending_correction');
  const bulkNeedsReason = bulkAction === 'deny' || bulkAction === 'request_correction';

  async function applyBulkAction() {
    if (selectedRows.length === 0 || bulkSubmitting || (bulkAction === 'request_correction' && !bulkCorrectionAllowed)) return;
    const reason = bulkReason.trim();
    if (bulkNeedsReason && !reason) {
      toasts.pushToast({ variant: 'danger', title: t('requests.bulk.reason_required') });
      return;
    }

    setBulkSubmitting(true);
    let ok = 0;
    const failures: string[] = [];

    for (const row of selectedRows) {
      const id = requestId(row);
      try {
        const payload = { action: bulkAction, reason: reason || undefined };
        const res =
          requestType(row) === 'registration'
            ? await resolveRegistrationRequest(id, {
                ...payload,
                ...(bulkAction === 'approve' ? { create_vps: true, activate: true } : {}),
              })
            : await resolveChangeRequest(id, payload);
        const asId = getMetaActionStateId(res.meta);
        if (asId) chrome.trackActionState(asId);
        ok += 1;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        failures.push(`#${id}: ${message}`);
      }
    }

    setBulkSubmitting(false);
    if (ok > 0) {
      toasts.pushToast({
        variant: 'ok',
        title: t('requests.bulk.toast.title', { count: String(ok) }),
        body: failures.length ? t('requests.bulk.toast.partial', { count: String(failures.length) }) : undefined,
      });
      setSelectedKeys(new Set());
      setBulkReason('');
      await refreshRequests();
    }

    if (failures.length > 0) {
      toasts.pushToast({
        variant: 'danger',
        title: t('requests.bulk.toast.error.title'),
        body: failures.slice(0, 3).join('\n'),
        autoDismissMs: false,
      });
    }
  }

  const pageCursor = useMemo(() => cursorFromDescendingPage(rows, requestId) ?? undefined, [rows]);

  const fetchedCount = reg.length + ch.length;
  const canNext = useMemo(() => {
    if (type === 'registration') return reg.length === pagination.limit;
    if (type === 'change') return ch.length === pagination.limit;

    // Unified: if we fetched more than we display, we definitely have a next page.
    if (fetchedCount > rows.length) return true;
    // Otherwise, if any source hit its limit, there might be more beyond.
    if (reg.length === pagination.limit) return true;
    if (ch.length === pagination.limit) return true;
    return false;
  }, [ch.length, fetchedCount, pagination.limit, reg.length, rows.length, type]);

  const isLoading = (needRegs && regQ.isLoading) || (needChanges && changeQ.isLoading);
  const error = (needRegs && regQ.isError ? regQ.error : null) || (needChanges && changeQ.isError ? changeQ.error : null);

  const smartNeedle = useMemo(() => smart.trim(), [smart]);
  const debouncedNeedle = useDebouncedValue(smartNeedle, 200);

  const userSuggestEnabled =
    isAdmin && smartNeedle.length >= 2 && debouncedNeedle === smartNeedle && !smartNeedle.includes(':') && parseNumericToken(smartNeedle) === null;

  const userSuggestQuery = useQuery({
    queryKey: ['users', 'search', { q: debouncedNeedle, limit: 8 }],
    enabled: userSuggestEnabled,
    queryFn: async () => (await searchUsers({ q: debouncedNeedle, limit: 8 })).data,
    staleTime: 10_000,
  });

  const openRequestById = useCallback(
    async (id: number) => {
      // If the id is already on the page, we know the type and can open directly.
      const onPage = rows.find((request) => requestId(request) === id);
      if (onPage) {
        navigate(`${basePath}/requests/${requestType(onPage)}/${id}`);
        return;
      }

      try {
        await fetchRegistrationRequest(id);
        navigate(`${basePath}/requests/registration/${id}`);
        return;
      } catch {
        // ignore and try change
      }

      try {
        await fetchChangeRequest(id);
        navigate(`${basePath}/requests/change/${id}`);
        return;
      } catch {
        // ignore
      }

      toasts.pushToast({ variant: 'danger', title: t('requests.smart.error.not_found', { id: String(id) }) });
    },
    [basePath, navigate, rows, t, toasts]
  );

  async function applySmartText(raw: string) {
    const input = raw.trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input).map((x) => x.trim()).filter(Boolean);

    // Pure numeric → open request by id.
    const firstToken = tokens[0];
    const numericOnly = tokens.length === 1 && firstToken ? parseNumericToken(firstToken) : null;
    if (numericOnly !== null) {
      setSmart('');
      setSmartErrors([]);
      void openRequestById(numericOnly);
      return;
    }

    let nextType = type;
    let nextState = state;
    let nextQ = qText;
    let nextUser = userId;
    let nextAdmin = adminId;
    let nextApiIp = apiIp;
    let nextClientIp = clientIp;
    let nextClientPtr = clientPtr;

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
          nextQ = value;
          continue;
        }

        if (key === 'type') {
          const tv = parseTypeValue(value);
          if (!tv) {
            errors.push(t('requests.smart.error.type_unresolved', { value }));
            continue;
          }
          nextType = tv;
          continue;
        }

        if (key === 'state') {
          const sv = resolveStateValue(value);
          if (!sv) {
            errors.push(t('requests.smart.error.state_unresolved', { value }));
            continue;
          }
          nextState = sv;
          continue;
        }

        if (key === 'user') {
          if (!isAdmin) {
            errors.push(t('filters.smart.error.admin_only', { key: kv.rawKey }));
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

        if (key === 'admin') {
          if (!isAdmin) {
            errors.push(t('filters.smart.error.admin_only', { key: kv.rawKey }));
            continue;
          }
          const n = parseNumericToken(value);
          if (n !== null) {
            nextAdmin = String(n);
            continue;
          }

          const users = (await searchUsers({ q: value, limit: 10 })).data;
          const exact = users.filter((u) => u.login.toLowerCase() === value.toLowerCase());
          const [resolvedAdmin] = exact;
          if (resolvedAdmin) {
            nextAdmin = String(resolvedAdmin.id);
            continue;
          }

          errors.push(t('requests.smart.error.admin_unresolved', { value }));
          continue;
        }

        if (key === 'api_ip') {
          nextApiIp = value;
          continue;
        }

        if (key === 'client_ip') {
          nextClientIp = value;
          continue;
        }

        if (key === 'client_ptr') {
          nextClientPtr = value;
          continue;
        }

        if (key === 'id') {
          const n = parseNumericToken(value);
          if (n !== null) {
            setSmart('');
            setSmartErrors([]);
            void openRequestById(n);
            return;
          }

          errors.push(t('requests.smart.error.id_numeric_only', { value }));
          continue;
        }

        errors.push(t('filters.smart.error.unknown_key', { key: kv.rawKey }));
      } else {
        free.push(unquoteSmartValue(token));
      }
    }

    if (free.length > 0) {
      nextQ = free.join(' ');
    }

    if (errors.length > 0) {
      setSmartErrors(errors);
      toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.unknown_error') });
      return;
    }

    setType(nextType);
    setState(nextState);
    setQText(nextQ);
    setUserId(nextUser);
    setAdminId(nextAdmin);
    setApiIp(nextApiIp);
    setClientIp(nextClientIp);
    setClientPtr(nextClientPtr);
    setSmart('');
    setSmartErrors([]);
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
          testId: 'admin.requests.smart.suggest.help',
        },
      ];
    }

    const suggestions: SmartFilterSuggestion[] = [];

    const numeric = parseNumericToken(needle);
    if (numeric !== null) {
      const id = String(numeric);

      suggestions.push({
        id: 'open',
        primary: t('requests.smart.suggest.open', { id }),
        secondary: t('requests.smart.suggest.open.secondary'),
        onPick: () => {
          setSmart('');
          setSmartErrors([]);
          void openRequestById(numeric);
        },
        testId: 'admin.requests.smart.suggest.open',
      });

      suggestions.push({
        id: 'q',
        primary: t('requests.smart.suggest.q', { value: id }),
        secondary: t('requests.smart.suggest.q.secondary'),
        onPick: () => {
          setQText(id);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.requests.smart.suggest.q',
      });

      if (isAdmin) suggestions.push({
        id: 'user',
        primary: t('requests.smart.suggest.user_id', { id }),
        secondary: t('requests.smart.suggest.user_id.secondary'),
        onPick: () => {
          setUserId(id);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.requests.smart.suggest.user',
      });

      if (isAdmin) suggestions.push({
        id: 'admin',
        primary: t('requests.smart.suggest.admin_id', { id }),
        secondary: t('requests.smart.suggest.admin_id.secondary'),
        onPick: () => {
          setAdminId(id);
          setSmart('');
          setSmartErrors([]);
        },
        testId: 'admin.requests.smart.suggest.admin',
      });

      return suggestions;
    }

    if (needle.includes(':')) {
      suggestions.push({
        id: 'apply',
        primary: t('filters.smart.suggest.apply.primary'),
        secondary: t('filters.smart.suggest.apply.secondary'),
        onPick: () => void applySmartText(needle),
        testId: 'admin.requests.smart.suggest.apply',
      });
      return suggestions;
    }

    // Default free text: server-side search.
    suggestions.push({
      id: 'q',
      primary: t('requests.smart.suggest.q', { value: needle }),
      secondary: t('requests.smart.suggest.q.secondary'),
      onPick: () => {
        setQText(needle);
        setSmart('');
        setSmartErrors([]);
      },
      testId: 'admin.requests.smart.suggest.q',
    });

    // State quick pick.
    const st = resolveStateValue(needle);
    if (st) {
      suggestions.push({
        id: `state.${st}`,
        primary: t('requests.smart.suggest.state', { state: st === ALL_ADMIN_REQUEST_STATES ? t('requests.list.filter.state.all') : t(requestStateLabelKey(st)) }),
        secondary: `state:${st}`,
        onPick: () => {
          setState(st);
          setSmart('');
          setSmartErrors([]);
        },
        testId: `admin.requests.smart.suggest.state.${st}`,
      });
    }

    // Type quick pick.
    const tv = parseTypeValue(needle);
    if (tv && tv !== 'all') {
      suggestions.push({
        id: `type.${tv}`,
        primary: t('requests.smart.suggest.type', { type: t(requestTypeLabelKey(tv)) }),
        secondary: `type:${tv}`,
        onPick: () => {
          setType(tv);
          setSmart('');
          setSmartErrors([]);
        },
        testId: `admin.requests.smart.suggest.type.${tv}`,
      });
    }

    // User login suggestions (admin only).
    if (isAdmin) {
      const users = userSuggestQuery.data ?? [];
      for (const u of users.slice(0, 5)) {
        suggestions.push({
          id: `user.${u.id}`,
          primary: t('requests.smart.suggest.user_login', { login: u.login }),
          secondary: `#${u.id}`,
          onPick: () => {
            setUserId(String(u.id));
            setSmart('');
            setSmartErrors([]);
          },
          testId: `admin.requests.smart.suggest.user.${u.id}`,
        });
      }
    }

    return suggestions;
  }, [applySmartText, isAdmin, openRequestById, smartNeedle, t, userSuggestQuery.data]);

  const shareUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.href : ''), [sp]);

  if (!isAdmin) return <Navigate to="/app" replace />;

  function renderExpandedContent(request: UnifiedRequestRow, compact = false) {
    return (
      <RequestsExpandedContent
        request={request}
        isAdmin={isAdmin}
        basePath={basePath}
        compact={compact}
        onResolved={refreshRequests}
      />
    );
  }
  return (
    <ListShell
      testId="admin.requests.list"
      header={<PageHeader title={isAdmin ? t('requests.list.title') : t('requests.my.title')} description={isAdmin ? t('requests.list.description') : t('requests.my.description')} />}
      filters={
        <RequestsFilters
          isAdmin={isAdmin}
          type={type}
          state={state}
          qText={qText}
          userId={userId}
          adminId={adminId}
          apiIp={apiIp}
          clientIp={clientIp}
          clientPtr={clientPtr}
          smart={smart}
          smartNeedle={smartNeedle}
          smartErrors={smartErrors}
          smartSuggestions={smartSuggestions}
          helpOpen={helpOpen}
          advancedOpen={advancedOpen}
          filtersActive={filtersActive}
          shareUrl={shareUrl}
          rowsLength={rows.length}
          allVisibleExpanded={allVisibleExpanded}
          smartInputRef={smartInputRef}
          setType={setType}
          setState={setState}
          setQText={setQText}
          setUserId={setUserId}
          setAdminId={setAdminId}
          setApiIp={setApiIp}
          setClientIp={setClientIp}
          setClientPtr={setClientPtr}
          setSmart={setSmart}
          setSmartErrors={setSmartErrors}
          setHelpOpen={setHelpOpen}
          setAdvancedOpen={setAdvancedOpen}
          applySmartText={applySmartText}
          clearFilters={clearFilters}
          expandAllVisible={expandAllVisible}
          collapseAllVisible={collapseAllVisible}
        />
      }
    >
      {isAdmin && rows.length > 0 ? (
        <RequestsBulkActions
          rowsLength={rows.length}
          selectedRowsLength={selectedRows.length}
          action={bulkAction}
          reason={bulkReason}
          needsReason={bulkNeedsReason}
          correctionAllowed={bulkCorrectionAllowed}
          submitting={bulkSubmitting}
          onActionChange={setBulkAction}
          onReasonChange={setBulkReason}
          onSelectAll={() => toggleAllVisible(true)}
          onDeselectAll={() => toggleAllVisible(false)}
          onClear={() => setSelectedKeys(new Set())}
          onApply={applyBulkAction}
        />
      ) : null}

      <RequestsListStatus
        loading={isLoading}
        error={error}
        empty={rows.length === 0}
        filtersActive={filtersActive}
        scope={basePath}
        onRetry={() => {
          if (needRegs) void regQ.refetch();
          if (needChanges) void changeQ.refetch();
        }}
        onClear={clearFilters}
      >
        <RequestsListContent
          rows={rows}
          isAdmin={isAdmin}
          basePath={basePath}
          expandedKeys={expandedKeys}
          canNext={canNext}
          pageCursor={pageCursor}
          pagination={pagination}
          onToggleExpanded={toggleExpanded}
          selectedKeys={selectedKeys}
          onToggleSelected={toggleSelected}
          onToggleAllVisible={toggleAllVisible}
          renderExpandedContent={renderExpandedContent}
        />
      </RequestsListStatus>
    </ListShell>
  );
}
