import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { fetchTransactions } from '../../lib/api/transactions';
import { searchUsers } from '../../lib/api/users';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';
import { useObjectScope } from '../../app/objectScope';
import { useToasts } from '../../app/toasts';
import { ListShell } from '../../components/layout/ListShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { LinkButton } from '../../components/ui/LinkButton';
import { KeysetPagination } from '../../components/ui/KeysetPagination';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import { cursorFromDescendingPage } from '../../lib/lockIndex';
import { parsePositiveInt } from '../../lib/parse';
import { useTierAIntervalMs } from '../../lib/refreshTiers';
import { parseNumericToken, splitKeyValueToken, tokenizeSmartInput, unquoteSmartValue } from '../../lib/smartFilter';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';

import { TransactionItemsFilters } from './transactions/TransactionItemsFilters';
import { TransactionItemsTable } from './transactions/TransactionItemsTable';
import {
  buildTransactionItemRow,
  canonicalTransactionItemKey,
  inferDoneToken,
  inferSuccessToken,
  parseDone,
  parseSuccess,
  type DoneValue,
} from './transactions/transactionItemSemantics';
import { buildTransactionItemFilterChips, buildTransactionItemSmartSuggestions } from './transactions/transactionItemSmartFilter';

export function TransactionsListPage() {
  const { basePath } = useAppMode();
  const mode = basePath === '/admin' ? 'admin' : 'app';
  const scope = useObjectScope();
  const { t } = useI18n();
  const toasts = useToasts();
  const navigate = useNavigate();
  const tierARefetchMs = useTierAIntervalMs();
  const [searchParams, setSearchParams] = useSearchParams();

  const [smart, setSmart] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();
  const smartInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const qText = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const qTrim = qText.trim();
  const chainIdNum = useMemo(() => parsePositiveInt(searchParams.get('transaction_chain')), [searchParams]);
  const nodeIdNum = useMemo(() => parsePositiveInt(searchParams.get('node')), [searchParams]);
  const vpsIdNum = useMemo(() => parsePositiveInt(searchParams.get('vps')), [searchParams]);
  const typeNum = useMemo(() => parsePositiveInt(searchParams.get('type')), [searchParams]);
  const done = useMemo(() => parseDone(searchParams.get('done')), [searchParams]);
  const success = useMemo(() => parseSuccess(searchParams.get('success')), [searchParams]);
  const userIdNum = useMemo(() => (mode === 'admin' ? parsePositiveInt(searchParams.get('user')) : undefined), [mode, searchParams]);

  const debouncedSmartNeedle = useDebouncedValue(smartNeedle, 200);

  const pagination = useKeysetPagination({
    id: 'transactions.items.list',
    filterKey: JSON.stringify({
      transaction_chain: chainIdNum,
      node: nodeIdNum,
      vps: vpsIdNum,
      type: typeNum,
      done,
      success,
      q: qTrim,
      user: userIdNum,
      mineUserId: scope.mineUserId,
      scope: basePath,
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 50,
    allowedLimits: [25, 50, 100, 200, 500],
  });

  const txQuery = useQuery({
    queryKey: [
      'transactions',
      'list',
      {
        chainId: chainIdNum,
        nodeId: nodeIdNum,
        userId: scope.mineUserId ?? userIdNum,
        type: typeNum,
        done,
        success,
        q: qTrim,
        limit: pagination.limit,
        fromId: pagination.fromId,
      },
    ],
    queryFn: async () =>
      (
        await fetchTransactions({
          limit: pagination.limit,
          fromId: pagination.fromId,
          transactionChainId: chainIdNum,
          nodeId: nodeIdNum,
          userId: scope.mineUserId ?? userIdNum,
          type: typeNum,
          done: done || undefined,
          success: success === '' ? undefined : success,
          q: qTrim || undefined,
        })
      ).data,
    refetchInterval: done === 'done' ? false : tierARefetchMs,
  });

  const pageData = txQuery.data ?? [];
  const pageCursor = useMemo(() => cursorFromDescendingPage(pageData), [pageData]);
  const hasMore = pageData.length >= pagination.limit;
  const canNext = pagination.hasForward || (hasMore && pageCursor !== null);
  const implicitMineFilter = scope.mineUserId !== undefined;
  const filtersActive = Boolean(qTrim || chainIdNum || nodeIdNum || vpsIdNum || typeNum || done || success !== '' || userIdNum || implicitMineFilter);

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

  const rows = useMemo(() => (txQuery.data ?? []).map((tx) => buildTransactionItemRow(tx, t)), [txQuery.data, t]);
  const primaryLoading = txQuery.isLoading;
  const primaryError = txQuery.isError;
  const primaryErrorObj = txQuery.error;
  const emptyTitle = t('transactions.items.empty.title');
  const emptyBody = filtersActive ? t('transactions.items.empty.body') : t('empty.list.none.body');

  const setParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const v = value.trim();
      if (v) p.set(key, v);
      else p.delete(key);
      return p;
    });
  };

  const removeParam = (key: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete(key);
      return p;
    });
  };

  const setDoneValue = (value: DoneValue | '') => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (value) p.set('done', value);
      else p.delete('done');
      return p;
    });
  };

  const setSuccessValue = (value: '' | 0 | 1) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (value === '') p.delete('success');
      else p.set('success', String(value));
      return p;
    });
  };

  const setNumericParam = (key: 'transaction_chain' | 'node' | 'vps' | 'type' | 'user', value: number) => setParam(key, String(value));

  const clearFilters = () => {
    setSmart('');
    setSmartErrors([]);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('q');
      p.delete('transaction_chain');
      p.delete('node');
      p.delete('vps');
      p.delete('type');
      p.delete('done');
      p.delete('success');
      p.delete('user');
      return p;
    });
  };

  const activeFilterChips = useMemo(
    () =>
      buildTransactionItemFilterChips({
        mode,
        qTrim,
        chainIdNum,
        nodeIdNum,
        vpsIdNum,
        typeNum,
        done,
        success,
        userIdNum,
        implicitMineFilter,
        mineUserId: scope.mineUserId,
        smartErrors,
        onRemoveQuery: () => removeParam('q'),
        onRemoveChain: () => removeParam('transaction_chain'),
        onRemoveNode: () => removeParam('node'),
        onRemoveVps: () => removeParam('vps'),
        onRemoveType: () => removeParam('type'),
        onRemoveDone: () => removeParam('done'),
        onRemoveSuccess: () => removeParam('success'),
        onRemoveUser: () => removeParam('user'),
        onClearSmartErrors: () => setSmartErrors([]),
      }),
    [mode, qTrim, chainIdNum, nodeIdNum, vpsIdNum, typeNum, done, success, userIdNum, implicitMineFilter, scope.mineUserId, smartErrors]
  );

  async function applySmartText(raw: string) {
    const input = raw.trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    const tokens = tokenizeSmartInput(input).map((token) => token.trim()).filter(Boolean);
    const firstToken = tokens[0];
    const numericOnly = tokens.length === 1 && firstToken ? parseNumericToken(firstToken) : null;
    if (numericOnly !== null) {
      setSmart('');
      setSmartErrors([]);
      navigate(`${basePath}/transactions/items/${numericOnly}`);
      return;
    }

    let nextQ = qText;
    let qExplicit = false;
    let nextChain = chainIdNum ? String(chainIdNum) : '';
    let nextNode = nodeIdNum ? String(nodeIdNum) : '';
    let nextVps = vpsIdNum ? String(vpsIdNum) : '';
    let nextType = typeNum ? String(typeNum) : '';
    let nextDone: DoneValue | '' = done;
    let nextSuccess: '' | 0 | 1 = success;
    let nextUser = userIdNum ? String(userIdNum) : '';

    const free: string[] = [];
    const errs: string[] = [];

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (kv) {
        const rawKey = kv.rawKey;
        const rawValue = kv.rawValue;
        const key = canonicalTransactionItemKey(rawKey);
        const value = unquoteSmartValue(rawValue);

        if (!key) {
          errs.push(t('filters.smart.error.unknown_key', { key: rawKey }));
          continue;
        }
        if (!value.trim()) {
          errs.push(t('filters.smart.error.missing_value', { key: rawKey }));
          continue;
        }

        if (key === 'id') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.items.smart.error.id_numeric_only', { value }));
          else {
            setSmart('');
            setSmartErrors([]);
            navigate(`${basePath}/transactions/items/${n}`);
            return;
          }
          continue;
        }
        if (key === 'q') {
          nextQ = value;
          qExplicit = true;
          continue;
        }
        if (key === 'transaction_chain') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.items.smart.error.chain_numeric_only', { value }));
          else nextChain = String(n);
          continue;
        }
        if (key === 'node') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.items.smart.error.node_numeric_only', { value }));
          else nextNode = String(n);
          continue;
        }
        if (key === 'vps') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.items.smart.error.vps_numeric_only', { value }));
          else nextVps = String(n);
          continue;
        }
        if (key === 'type') {
          const n = parseNumericToken(value);
          if (n === null) errs.push(t('transactions.items.smart.error.type_numeric_only', { value }));
          else nextType = String(n);
          continue;
        }
        if (key === 'done') {
          const parsedDone = inferDoneToken(value);
          if (!parsedDone) errs.push(t('transactions.items.smart.error.invalid_done', { value }));
          else nextDone = parsedDone;
          continue;
        }
        if (key === 'success') {
          const parsedSuccess = inferSuccessToken(value);
          if (parsedSuccess === null) errs.push(t('transactions.items.smart.error.invalid_success', { value }));
          else nextSuccess = parsedSuccess;
          continue;
        }
        if (key === 'user') {
          if (mode !== 'admin') {
            errs.push(t('filters.smart.error.user_admin_only'));
            continue;
          }
          const n = parseNumericToken(value);
          if (n !== null) {
            nextUser = String(n);
            continue;
          }
          try {
            const users = (await searchUsers({ q: value, limit: 10 })).data;
            const exact = users.filter((u) => u.login.toLowerCase() === value.toLowerCase());
            const [resolvedUser] = exact;
            if (resolvedUser) {
              nextUser = String(resolvedUser.id);
              continue;
            }
            errs.push(t('filters.smart.error.user_unresolved', { value }));
          } catch {
            errs.push(t('filters.smart.error.user_unresolved', { value }));
          }
        }
        continue;
      }

      const plain = unquoteSmartValue(token);
      const low = plain.trim().toLowerCase();
      const parsedDone = inferDoneToken(low);
      if (parsedDone) {
        nextDone = parsedDone;
        continue;
      }
      const parsedSuccess = inferSuccessToken(low);
      if (parsedSuccess !== null && ['ok', 'success', 'fail', 'failed', 'error'].includes(low)) {
        nextSuccess = parsedSuccess;
        continue;
      }
      free.push(plain);
    }

    if (free.length > 0) {
      const freeText = free.join(' ');
      nextQ = qExplicit ? [nextQ.trim(), freeText].filter(Boolean).join(' ') : freeText;
    }

    if (errs.length > 0) {
      setSmartErrors(errs);
      toasts.pushToast({ variant: 'danger', title: errs[0] ?? t('common.unknown_error') });
      return;
    }

    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (nextQ.trim()) p.set('q', nextQ.trim());
      else p.delete('q');
      if (nextChain.trim()) p.set('transaction_chain', nextChain.trim());
      else p.delete('transaction_chain');
      if (nextNode.trim()) p.set('node', nextNode.trim());
      else p.delete('node');
      if (nextVps.trim()) p.set('vps', nextVps.trim());
      else p.delete('vps');
      if (nextType.trim()) p.set('type', nextType.trim());
      else p.delete('type');
      if (nextDone) p.set('done', nextDone);
      else p.delete('done');
      if (nextSuccess !== '') p.set('success', String(nextSuccess));
      else p.delete('success');
      if (mode === 'admin') {
        if (nextUser.trim()) p.set('user', nextUser.trim());
        else p.delete('user');
      } else {
        p.delete('user');
      }
      return p;
    });

    setSmart('');
    setSmartErrors([]);
  }

  const smartSuggestions = useMemo(
    () =>
      buildTransactionItemSmartSuggestions({
        needle: smartNeedle,
        mode,
        basePath,
        navigate,
        t,
        userSuggestions: userSuggestQuery.data ?? [],
        onOpenHelp: () => setHelpOpen(true),
        onApply: () => void applySmartText(smart),
        onSetDone: setDoneValue,
        onSetSuccess: setSuccessValue,
        onSetQuery: (value) => setParam('q', value),
        onSetChainId: (value) => setNumericParam('transaction_chain', value),
        onSetVpsId: (value) => setNumericParam('vps', value),
        onSetNodeId: (value) => setNumericParam('node', value),
        onSetUserId: (value) => setNumericParam('user', value),
        onResetSmart: () => {
          setSmart('');
          setSmartErrors([]);
        },
      }),
    [basePath, mode, navigate, smart, smartNeedle, t, userSuggestQuery.data]
  );

  const filterHrefArgs = useMemo(
    () => ({
      basePath,
      qTrim,
      chainIdNum,
      nodeIdNum,
      vpsIdNum,
      typeNum,
      done,
      success,
      userIdNum,
      limit: pagination.limit,
    }),
    [basePath, qTrim, chainIdNum, nodeIdNum, vpsIdNum, typeNum, done, success, userIdNum, pagination.limit]
  );

  return (
    <ListShell
      testId="transactions.items.list"
      header={
        <PageHeader
          title={t('transactions.items.title')}
          description={t('transactions.items.description')}
          testId="transactions.items.list.header"
          actions={
            <LinkButton to={`${basePath}/transactions`} variant="secondary" size="sm">
              {t('transactions.chains.title')}
            </LinkButton>
          }
        />
      }
      filters={
        <TransactionItemsFilters
          t={t}
          mode={mode}
          smartInputRef={smartInputRef}
          smart={smart}
          smartNeedle={smartNeedle}
          smartErrorsCount={smartErrors.length}
          onSmartChange={(value) => {
            setSmart(value);
            if (smartErrors.length) setSmartErrors([]);
          }}
          onSmartSubmit={() => void applySmartText(smart)}
          smartSuggestions={smartSuggestions}
          activeFilterChips={activeFilterChips}
          queryId={undefined}
          filtersActive={filtersActive}
          helpOpen={helpOpen}
          onHelpOpen={() => setHelpOpen(true)}
          onHelpClose={() => setHelpOpen(false)}
          advancedOpen={advancedOpen}
          onAdvancedOpen={() => setAdvancedOpen(true)}
          onAdvancedClose={() => setAdvancedOpen(false)}
          clearFilters={clearFilters}
          qText={qText}
          setQueryText={(value) => setParam('q', value)}
          chainIdText={chainIdNum ? String(chainIdNum) : ''}
          setChainIdText={(value) => setParam('transaction_chain', value)}
          nodeIdText={nodeIdNum ? String(nodeIdNum) : ''}
          setNodeIdText={(value) => setParam('node', value)}
          vpsIdText={vpsIdNum ? String(vpsIdNum) : ''}
          setVpsIdText={(value) => setParam('vps', value)}
          typeText={typeNum ? String(typeNum) : ''}
          setTypeText={(value) => setParam('type', value)}
          done={done}
          setDoneValue={setDoneValue}
          success={success}
          setSuccessValue={setSuccessValue}
          userIdText={userIdNum ? String(userIdNum) : ''}
          setUserIdText={(value) => setParam('user', value)}
        />
      }
    >
      {primaryLoading ? (
        <LoadingState testId="transactions.items.loading" title={t('transactions.items.loading')} />
      ) : primaryError ? (
        <ErrorState
          testId="transactions.items.error"
          title={t('transactions.items.load_error.title')}
          error={primaryErrorObj}
          onRetry={() => {
            void txQuery.refetch();
          }}
          showBack={false}
          detailsExtra={{ page: 'transactions.items.list', scope: basePath }}
        />
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            testId="transactions.items.empty"
            title={emptyTitle}
            body={emptyBody}
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
              testId="transactions.items.pagination"
            />
          </Card>
        </>
      ) : (
        <TransactionItemsTable
          rows={rows}
          basePath={basePath}
          t={t}
          mode={mode}
          pagination={pagination}
          canNext={canNext}
          pageCursor={pageCursor}
          filterHrefArgs={filterHrefArgs}
        />
      )}
    </ListShell>
  );
}
