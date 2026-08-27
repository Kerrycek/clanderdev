import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';

import { ListShell } from '../../components/layout/ListShell';
import { PageHeader } from '../../components/layout/PageHeader';

import { fetchTransactionChain, fetchTransactionChains, type TransactionChain } from '../../lib/api/transactions';
import { searchUsers } from '../../lib/api/users';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';
import { useObjectScope } from '../../app/objectScope';
import { useToasts } from '../../app/toasts';
import { LinkButton } from '../../components/ui/LinkButton';
import {
  chainMatchesConcern,
  chainMatchesUser,
  chainMatchesUserSession,
  getChainId,
  getChainState,
  inferChainState,
  looksLikeConcernClass,
  normalizeIds,
  parseBool,
  parseBoolToken,
  parseChainIdSearch,
  parseChainState,
  safePositiveNumber,
  canonicalKey,
  type ChainState,
  type TransactionChainRow,
} from './transactions/transactionChainSemantics';
import { TransactionChainsFilters } from './transactions/TransactionChainsFilters';
import { TransactionChainsListContent } from './transactions/TransactionChainsListContent';
import { buildTransactionChainActiveFilterChips, buildTransactionChainSmartSuggestions } from './transactions/transactionChainSmartFilter';
import { splitTransactionActivityRows } from './transactions/transactionActivityVisibility';
import { useChrome } from '../../components/layout/ChromeContext';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../lib/lockIndex';
import { useTierAIntervalMs, useTierBIntervalMs } from '../../lib/refreshTiers';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../lib/smartFilter';
import { isFailedChainState, isFinishedChainState } from '../../lib/taskStatus';


export function TransactionChainsPage() {
  const { basePath, mode } = useAppMode();
  const uiMode = mode === 'admin' ? 'admin' : 'app';
  const scope = useObjectScope();
  const chrome = useChrome();
  const navigate = useNavigate();
  const toasts = useToasts();

  const i18n = useI18n();
  const t = i18n.t;

  const tierARefetchMs = useTierAIntervalMs();
  const tierBRefetchMs = useTierBIntervalMs();
  const [searchParams, setSearchParams] = useSearchParams();

  // Smart filter input (unapplied text).
  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [systemActivityOpen, setSystemActivityOpen] = useState(false);

  const smartInputRef = useRef<HTMLInputElement>(null);
  const smartNeedle = smart.trim();
  const debouncedSmartNeedle = useDebouncedValue(smartNeedle, 150);

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const initialState = useMemo(() => parseChainState(searchParams.get('state')), [searchParams]);
  const initialClass = useMemo(() => searchParams.get('class_name') ?? '', [searchParams]);
  const initialRowId = useMemo(() => searchParams.get('row_id') ?? '', [searchParams]);
  const initialErrors = useMemo(() => parseBool(searchParams.get('errors')), [searchParams]);

  const initialUser = useMemo(() => (mode === 'admin' ? (searchParams.get('user') ?? '') : ''), [mode, searchParams]);
  const initialUserSession = useMemo(
    () => (mode === 'admin' ? (searchParams.get('user_session') ?? '') : ''),
    [mode, searchParams]
  );
  const initialQ = useMemo(() => searchParams.get('q') ?? '', [searchParams]);

  const [state, setState] = useState<ChainState | ''>(initialState);
  const [className, setClassName] = useState<string>(initialClass);
  const [rowId, setRowId] = useState<string>(initialRowId);
  const [userId, setUserId] = useState<string>(initialUser);
  const [userSessionId, setUserSessionId] = useState<string>(initialUserSession);
  const [errorsOnly, setErrorsOnly] = useState<boolean>(initialErrors);
  const [query, setQuery] = useState<string>(initialQ);

  // Sync state from the URL (e.g. when navigating to the same route with different query params).
  useEffect(() => {
    setState(parseChainState(searchParams.get('state')));
    setClassName(searchParams.get('class_name') ?? '');
    setRowId(searchParams.get('row_id') ?? '');
    if (mode === 'admin') {
      setUserId(searchParams.get('user') ?? '');
      setUserSessionId(searchParams.get('user_session') ?? '');
    } else {
      setUserId('');
      setUserSessionId('');
    }
    setErrorsOnly(parseBool(searchParams.get('errors')));
    setQuery(searchParams.get('q') ?? '');
  }, [mode, searchParams]);

  // Keep the URL query string in sync so the filters are shareable.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (state) next.set('state', state);
    else next.delete('state');

    if (className.trim()) next.set('class_name', className.trim());
    else next.delete('class_name');

    if (rowId.trim()) next.set('row_id', rowId.trim());
    else next.delete('row_id');

    // Admin-only filters.
    if (mode === 'admin') {
      if (userId.trim()) next.set('user', userId.trim());
      else next.delete('user');
      if (userSessionId.trim()) next.set('user_session', userSessionId.trim());
      else next.delete('user_session');
    } else {
      next.delete('user');
      next.delete('user_session');
    }

    if (errorsOnly) next.set('errors', '1');
    else next.delete('errors');

    if (query.trim()) next.set('q', query.trim());
    else next.delete('q');

    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [className, errorsOnly, mode, query, rowId, searchParams, setSearchParams, state, userId, userSessionId]);

  const rowIdNum = safePositiveNumber(rowId);
  const userIdNum = mode === 'admin' ? safePositiveNumber(userId) : undefined;
  const userSessionNum = mode === 'admin' ? safePositiveNumber(userSessionId) : undefined;
  const effectiveUserId = mode === 'admin' ? userIdNum : scope.mineUserId;
  const classNameNorm = className.trim() || undefined;
  const queryTrim = query.trim();
  const queryLower = queryTrim.toLowerCase();
  const queryId = parseChainIdSearch(queryTrim);
  const nameQuery = queryId ? undefined : queryTrim || undefined;

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

  const pagination = useKeysetPagination({
    id: 'transactions.chains',
    filterKey: JSON.stringify({
      q: nameQuery ?? '',
      state: state || '',
      errorsOnly: Boolean(errorsOnly),
      className: classNameNorm ?? '',
      rowId: rowIdNum ?? null,
      userId: effectiveUserId ?? null,
      userSession: userSessionNum ?? null,
      scope: scope.scope,
      mineUserId: scope.mineUserId ?? null,
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100],
  });

  const pinnedIds = useMemo(() => normalizeIds(chrome.pinnedTransactionChains, 50), [chrome.pinnedTransactionChains]);
  const pinnedSet = useMemo(() => new Set<number>(pinnedIds), [pinnedIds]);

  const pinnedQs = useQueries({
    queries: pinnedIds.map((id) => ({
      queryKey: ['transaction_chains', 'show', { id }],
      queryFn: async () => (await fetchTransactionChain(id)).data,
      enabled: Number.isFinite(id) && id > 0,
      refetchInterval: (query: { state: { data?: TransactionChain } }) => {
        const data = query.state.data as TransactionChain | undefined;
        if (!data) return tierBRefetchMs;
        return isFinishedChainState(getChainState(data)) ? false : tierBRefetchMs;
      },
    })),
  });

  const pinnedMissing = useMemo(() => {
    const missing: number[] = [];
    for (let i = 0; i < pinnedIds.length; i++) {
      const id = pinnedIds[i];
      const q2 = pinnedQs[i];
      if (!id || !q2) continue;
      if (q2.isError && !q2.data) missing.push(id);
    }
    return missing;
  }, [pinnedIds, pinnedQs]);

  const idQ = useQuery({
    queryKey: ['transaction_chains', 'show', { id: queryId }],
    queryFn: async () => {
      if (!queryId) throw new Error('missing chain id');
      return (await fetchTransactionChain(queryId)).data;
    },
    enabled: Boolean(queryId),
    refetchInterval: (query) => {
      const data = query.state.data as TransactionChain | undefined;
      if (!data) return tierARefetchMs;
      return isFinishedChainState(getChainState(data)) ? false : tierARefetchMs;
    },
  });

  const q = useQuery({
    queryKey: [
      'transaction_chains',
      'list',
      {
        limit: pagination.limit,
        fromId: pagination.fromId,
        state,
        errorsOnly,
        className: classNameNorm,
        rowId: rowIdNum,
        userId: effectiveUserId,
        userSessionId: userSessionNum,
        name: nameQuery,
      },
    ],
    queryFn: async () => {
      if (errorsOnly) {
        const [failedRes, fatalRes] = await Promise.all([
          fetchTransactionChains({
            limit: pagination.limit,
            fromId: pagination.fromId,
            state: 'failed',
            name: nameQuery,
            className: classNameNorm,
            rowId: rowIdNum,
            userId: effectiveUserId,
            userSessionId: userSessionNum,
          }),
          fetchTransactionChains({
            limit: pagination.limit,
            fromId: pagination.fromId,
            state: 'fatal',
            name: nameQuery,
            className: classNameNorm,
            rowId: rowIdNum,
            userId: effectiveUserId,
            userSessionId: userSessionNum,
          }),
        ]);

        const combined = [...(failedRes.data ?? []), ...(fatalRes.data ?? [])];
        const byId = new Map<number, TransactionChain>();
        for (const chain of combined) {
          const id = getChainId(chain);
          if (id > 0) byId.set(id, chain);
        }

        return [...byId.values()]
          .sort((a, b) => getChainId(b) - getChainId(a))
          .slice(0, pagination.limit);
      }

      return (
        await fetchTransactionChains({
          limit: pagination.limit,
          fromId: pagination.fromId,
          state: state || undefined,
          name: nameQuery,
          className: classNameNorm,
          rowId: rowIdNum,
          userId: effectiveUserId,
          userSessionId: userSessionNum,
        })
      ).data;
    },
    refetchInterval: tierARefetchMs,
    enabled: !queryId,
  });

  const filtersActive =
    Boolean(queryTrim) ||
    Boolean(errorsOnly) ||
    Boolean(state) ||
    Boolean(classNameNorm) ||
    Boolean(rowIdNum !== undefined) ||
    Boolean(userIdNum !== undefined) ||
    Boolean(userSessionNum !== undefined);

  function clearFilters() {
    setState('');
    setClassName('');
    setRowId('');
    setErrorsOnly(false);
    setUserId('');
    setUserSessionId('');
    setQuery('');
    setSmart('');
    setSmartErrors([]);
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
      navigate(`${basePath}/transactions/${numericOnly}`);
      return;
    }

    let nextQuery = query;
    let nextState: ChainState | '' = state;
    let nextErrorsOnly = errorsOnly;
    let nextClassName = className;
    let nextRowId = rowId;
    let nextUserId = userId;
    let nextUserSessionId = userSessionId;

    const free: string[] = [];
    const errs: string[] = [];

    const applyConcern = (cls: string, rid: number) => {
      nextClassName = cls;
      nextRowId = String(rid);
    };

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (kv) {
        const rawKey = kv.rawKey;
        const rawValue = kv.rawValue;
        const value = unquoteSmartValue(rawValue);

        const key = canonicalKey(rawKey);

        // Shorthand: `Vps:123` (class_name + row_id)
        if (!key && looksLikeConcernClass(rawKey)) {
          const n = parseNumericToken(value);
          if (n !== null) {
            applyConcern(rawKey.trim(), n);
            continue;
          }
        }

        if (!key) {
          errs.push(t('filters.smart.error.unknown_key', { key: rawKey }));
          continue;
        }

        if (!value.trim() && key !== 'errors') {
          errs.push(t('filters.smart.error.missing_value', { key: rawKey.trim() }));
          continue;
        }

        if (key === 'id') {
          const n = parseNumericToken(value);
          if (n === null) {
            errs.push(t('transactions.chains.smart.error.chain_id_numeric_only', { value }));
          } else {
            setSmart('');
            setSmartErrors([]);
            navigate(`${basePath}/transactions/${n}`);
            return;
          }
          continue;
        }

        if (key === 'q') {
          nextQuery = value;
          continue;
        }

        if (key === 'state') {
          const st = inferChainState(value);
          if (!st) errs.push(t('transactions.chains.smart.error.invalid_state', { value }));
          else {
            nextState = st;
            nextErrorsOnly = false;
          }
          continue;
        }

        if (key === 'errors') {
          if (!value.trim()) {
            nextErrorsOnly = true;
            nextState = '';
            continue;
          }
          const b = parseBoolToken(value);
          if (b === null) {
            errs.push(t('transactions.chains.smart.error.invalid_bool', { value }));
          } else {
            nextErrorsOnly = b;
            if (b) nextState = '';
          }
          continue;
        }

        if (key === 'class_name') {
          nextClassName = value;
          continue;
        }

        if (key === 'row_id') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.chains.smart.error.row_id_numeric_only', { value }));
          else nextRowId = String(n);
          continue;
        }

        if (key === 'user') {
          if (mode !== 'admin') {
            errs.push(t('transactions.chains.smart.error.admin_only', { key: 'user' }));
            continue;
          }

          const n = parseNumericToken(value);
          if (n !== null) {
            nextUserId = String(n);
            continue;
          }

          try {
            const users = (await searchUsers({ q: value, limit: 10 })).data;
            const exact = users.filter((u) => u.login.toLowerCase() === value.trim().toLowerCase());
            const [resolvedUser] = exact;
            if (resolvedUser) {
              nextUserId = String(resolvedUser.id);
            } else {
              errs.push(t('filters.smart.error.user_unresolved', { value }));
            }
          } catch {
            errs.push(t('filters.smart.error.user_unresolved', { value }));
          }
          continue;
        }

        if (key === 'user_session') {
          if (mode !== 'admin') {
            errs.push(t('transactions.chains.smart.error.admin_only', { key: 'session' }));
            continue;
          }

          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.chains.smart.error.session_id_numeric_only', { value }));
          else nextUserSessionId = String(n);
          continue;
        }

        errs.push(t('filters.smart.error.unknown_key', { key: rawKey }));
        continue;
      }

      const plain = unquoteSmartValue(token);
      if (plain.trim().toLowerCase() === 'errors') {
        nextErrorsOnly = true;
        nextState = '';
        continue;
      }

      const m = plain.trim().match(/^([A-Z][A-Za-z0-9_:]*)#(\d+)$/);
      if (m) {
        const cls = m[1] ?? '';
        const rid = Number(m[2]);
        if (looksLikeConcernClass(cls) && Number.isFinite(rid) && rid > 0) {
          applyConcern(cls, Math.floor(rid));
          continue;
        }
      }

      free.push(plain);
    }

    if (free.length > 0) nextQuery = free.join(' ');

    if (errs.length > 0) {
      setSmartErrors(errs);
      toasts.pushToast({ variant: 'danger', title: errs[0] ?? t('common.unknown_error') });
      return;
    }

    setQuery(nextQuery);
    setState(nextState);
    setErrorsOnly(nextErrorsOnly);
    setClassName(nextClassName);
    setRowId(nextRowId);
    if (mode === 'admin') {
      setUserId(nextUserId);
      setUserSessionId(nextUserSessionId);
    } else {
      setUserId('');
      setUserSessionId('');
    }
    setSmart('');
    setSmartErrors([]);
  }

  const smartSuggestions = useMemo(
    () =>
      buildTransactionChainSmartSuggestions({
        needle: smartNeedle,
        mode: uiMode,
        basePath,
        navigate,
        t,
        userSuggestions: userSuggestQuery.data,
        onOpenHelp: () => setHelpOpen(true),
        onApply: () => void applySmartText(smart),
        onSetClassName: setClassName,
        onSetRowId: setRowId,
        onSetState: setState,
        onSetErrorsOnly: setErrorsOnly,
        onSetUserId: setUserId,
        onResetSmart: () => {
          setSmart('');
          setSmartErrors([]);
        },
      }),
    [applySmartText, basePath, navigate, smart, smartNeedle, t, uiMode, userSuggestQuery.data]
  );

  const activeFilterChips = useMemo(
    () =>
      buildTransactionChainActiveFilterChips({
        t,
        mode: uiMode,
        smartErrors,
        queryTrim,
        errorsOnly,
        state,
        classNameNorm,
        rowIdNum,
        userIdNum,
        userSessionNum,
        clearSmartErrors: () => setSmartErrors([]),
        clearQuery: () => setQuery(''),
        clearErrorsOnly: () => setErrorsOnly(false),
        clearState: () => setState(''),
        clearClassName: () => setClassName(''),
        clearRowId: () => setRowId(''),
        clearUserId: () => setUserId(''),
        clearUserSessionId: () => setUserSessionId(''),
      }),
    [classNameNorm, errorsOnly, queryTrim, rowIdNum, smartErrors, state, t, uiMode, userIdNum, userSessionNum]
  );

  const rows = useMemo(() => {
    const map = new Map<number, TransactionChainRow>();

    // Pinned first (always included)
    for (let i = 0; i < pinnedIds.length; i++) {
      const requestedId = pinnedIds[i];
      const q2 = pinnedQs[i];
      if (!requestedId || !q2?.data) continue;
      const c = q2.data as TransactionChain;
      const id = getChainId(c) || requestedId;
      if (!Number.isFinite(id) || id <= 0) continue;
      map.set(id, { c, pinned: true });
    }

    // If searching by ID, include that chain even if it is not pinned.
    if (queryId && idQ.data) {
      const c = idQ.data as TransactionChain;
      const id = getChainId(c) || queryId;
      if (Number.isFinite(id) && id > 0 && !map.has(id)) {
        map.set(id, { c, pinned: pinnedSet.has(id) });
      }
    }

    for (const c of q.data ?? []) {
      const id = getChainId(c);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (map.has(id)) continue;
      map.set(id, { c, pinned: pinnedSet.has(id) });
    }

    const matchesFilters = (c: TransactionChain): boolean => {
      const id = getChainId(c);

      if (queryId) {
        if (id !== queryId) return false;
      } else if (queryTrim) {
        const label = String(c.label ?? '').toLowerCase();
        if (!label.includes(queryLower) && !String(id).includes(queryTrim)) return false;
      }

      if (errorsOnly) {
        if (!isFailedChainState(getChainState(c))) return false;
      } else if (state) {
        if (getChainState(c) !== state) return false;
      }

      if (!chainMatchesConcern(c, classNameNorm, rowIdNum)) return false;
      if (!chainMatchesUser(c, userIdNum)) return false;
      if (!chainMatchesUserSession(c, userSessionNum)) return false;

      return true;
    };

    const arr = Array.from(map.values()).filter((x) => matchesFilters(x.c));

    arr.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return getChainId(b.c) - getChainId(a.c);
    });

    return arr;
  }, [classNameNorm, errorsOnly, idQ.data, pinnedIds, pinnedQs, pinnedSet, q.data, queryId, queryLower, queryTrim, rowIdNum, state, userIdNum, userSessionNum]);

  const collapseSystemActivity = uiMode !== 'admin' && !filtersActive;
  const { visibleRows, systemRows } = useMemo(
    () => splitTransactionActivityRows(rows, collapseSystemActivity),
    [collapseSystemActivity, rows]
  );

  const pageCursor = useMemo(() => cursorFromDescendingPage(q.data as TransactionChain[] | undefined), [q.data]);
  const hasMore = (q.data ?? []).length >= pagination.limit;

  const anyLoading = q.isLoading || pinnedQs.some((x) => x.isLoading) || idQ.isLoading;
  const anyError = q.isError || idQ.isError;


  return (
    <ListShell
      testId="transactions.list"
      header={
        <PageHeader
          title={t('transactions.chains.title')}
          description={t('transactions.chains.description')}
          testId="transactions.list.header"
          actions={
            <LinkButton to={`${basePath}/transactions/items`} variant="secondary" size="sm">
              {t('transactions.items.title')}
            </LinkButton>
          }
        />
      }
      filters={
        <TransactionChainsFilters
          t={t}
          mode={uiMode}
          smartInputRef={smartInputRef}
          smart={smart}
          smartErrorsCount={smartErrors.length}
          onSmartChange={(value) => {
            setSmart(value);
            if (smartErrors.length) setSmartErrors([]);
          }}
          onSmartSubmit={() => void applySmartText(smart)}
          smartSuggestions={smartSuggestions}
          activeFilterChips={activeFilterChips}
          queryId={queryId}
          filtersActive={filtersActive}
          helpOpen={helpOpen}
          onHelpOpen={() => setHelpOpen(true)}
          onHelpClose={() => {
            setHelpOpen(false);
            if (smartNeedle === '?') setSmart('');
          }}
          advancedOpen={advancedOpen}
          onAdvancedOpen={() => setAdvancedOpen(true)}
          onAdvancedClose={() => setAdvancedOpen(false)}
          clearFilters={clearFilters}
          query={query}
          setQuery={setQuery}
          state={state}
          setState={setState}
          errorsOnly={errorsOnly}
          setErrorsOnly={setErrorsOnly}
          className={className}
          setClassName={setClassName}
          rowId={rowId}
          setRowId={setRowId}
          userId={userId}
          setUserId={setUserId}
          userSessionId={userSessionId}
          setUserSessionId={setUserSessionId}
        />
      }
    >
      <TransactionChainsListContent
        t={t}
        basePath={basePath}
        pinnedMissing={pinnedMissing}
        onUnpin={(id) => chrome.togglePinnedTransactionChain(id)}
        refreshWarning={q.isError}
        anyLoading={anyLoading}
        anyError={anyError}
        rows={rows}
        visibleRows={visibleRows}
        systemRows={systemRows}
        filtersActive={filtersActive}
        clearFilters={clearFilters}
        queryId={queryId}
        queryTrim={queryTrim}
        errorsOnly={errorsOnly}
        state={state}
        userId={userId}
        userSessionId={userSessionId}
        pagination={pagination}
        hasMore={hasMore}
        pageCursor={pageCursor}
        idError={idQ.error}
        listError={q.error}
        onRetry={() => {
          if (queryId) void idQ.refetch();
          else void q.refetch();
        }}
        systemActivityOpen={systemActivityOpen}
        onToggleSystemActivity={() => setSystemActivityOpen((open) => !open)}
        onTogglePinned={(id) => chrome.togglePinnedTransactionChain(id)}
      />
    </ListShell>
  );
}
