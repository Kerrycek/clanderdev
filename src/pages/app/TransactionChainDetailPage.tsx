import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionChain, fetchTransactions, type Transaction, type TransactionChain } from '../../lib/api/transactions';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';

import { useChrome } from '../../components/layout/ChromeContext';
import { DetailShell } from '../../components/layout/DetailShell';

import { chainBadgeFromState, transactionBadge } from '../../lib/taskStatus';
import { useTierAIntervalMs } from '../../lib/refreshTiers';
import { formatDateTime } from '../../lib/format';
import { formatErrorMessage } from '../../lib/errors';
import { resourceId, refLabel } from '../../lib/resources';
import { safeContentUrl } from '../../lib/safeUrl';
import { durationSec, safeJson } from '../../lib/txFormat';
import { dotVariantFromRowVariant, tableVariantFromBadgeVariant } from '../../lib/variantMap';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LinkButton } from '../../components/ui/LinkButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { ObjectHeader } from '../../components/ui/ObjectHeader';
import { StatusDot } from '../../components/ui/StatusDot';
import { Table } from '../../components/ui/Table';
import { TableRowLink } from '../../components/ui/TableRowLink';
import { TransactionInlineDetails } from '../../components/ui/TransactionInlineDetails';

import { ChevronDown, ChevronUp, Pin, PinOff } from 'lucide-react';

function txBadge(tx: Transaction) {
  return transactionBadge(tx);
}

function chainProgressLabel(chain: TransactionChain): { label: string; pct: number | null } {
  const size = typeof (chain as any).size === 'number' ? ((chain as any).size as number) : undefined;
  const progress = typeof (chain as any).progress === 'number' ? ((chain as any).progress as number) : undefined;

  if (!size || size <= 0) return { label: '—', pct: null };
  const p = typeof progress === 'number' ? Math.max(0, Math.min(size, progress)) : 0;
  const pct = Math.round((p / size) * 100);
  return { label: `${p}/${size}`, pct };
}

function firstCurrentTransactionId(transactions: Transaction[] | undefined): number | null {
  for (const tx of transactions ?? []) {
    const txId = typeof (tx as any).id === 'number' ? ((tx as any).id as number) : null;
    if (!txId) continue;
    if (String((tx as any).done ?? '') !== 'done') return txId;
  }
  return null;
}

function firstFailedTransactionId(transactions: Transaction[] | undefined): number | null {
  for (const tx of transactions ?? []) {
    const txId = typeof (tx as any).id === 'number' ? ((tx as any).id as number) : null;
    if (!txId) continue;
    const b = transactionBadge(tx);
    if (b.variant === 'danger') return txId;
  }
  return null;
}

export function TransactionChainDetailPage() {
  const { basePath } = useAppMode();
  const chrome = useChrome();
  const i18n = useI18n();
  const t = i18n.t;

  const tierARefetchMs = useTierAIntervalMs();
  const { chainId } = useParams();
  const chainIdNum = chainId ? Number(chainId) : NaN;
  const chainIdValid = Number.isFinite(chainIdNum) && chainIdNum > 0;

  const chainQ = useQuery({
    queryKey: ['transaction_chain', chainIdNum],
    enabled: chainIdValid,
    queryFn: async () => (await fetchTransactionChain(chainIdNum)).data,
    refetchInterval: (data) => {
      const done = String((data as any)?.state ?? '') === 'done';
      return done ? false : tierARefetchMs;
    },
  });

  const chainDone = chainQ.data ? String((chainQ.data as any).state ?? '') === 'done' : false;

  const txQ = useQuery({
    queryKey: ['transactions_for_chain', chainIdNum],
    enabled: chainIdValid && chainQ.isSuccess,
    queryFn: async () => (await fetchTransactions({ transactionChainId: chainIdNum, limit: 500 })).data,
    refetchInterval: chainDone ? false : tierARefetchMs,
  });

  const isPinned = chainIdValid && chrome.pinnedTransactionChains.includes(chainIdNum);

  const [expandedTx, setExpandedTx] = useState<Set<number>>(() => new Set());

  const togglePinned = () => {
    if (!chainIdValid) return;
    chrome.togglePinnedTransactionChain(chainIdNum);
  };

  const title = useMemo(() => {
    if (!chainIdValid) return t('transactions.chain.detail.invalid_title');
    const label = (chainQ.data as any)?.label ? String((chainQ.data as any).label) : '';
    return label || t('transactions.chain.detail.fallback_title', { id: chainIdNum });
  }, [chainIdNum, chainIdValid, chainQ.data, t]);

  const stateBadge = useMemo(() => {
    const state = chainQ.data ? String((chainQ.data as any).state ?? '') : '';
    if (!state) return null;
    const b = chainBadgeFromState(state as any);
    return <Badge variant={b.variant}>{b.label}</Badge>;
  }, [chainQ.data]);

  const progress = useMemo(() => (chainQ.data ? chainProgressLabel(chainQ.data) : { label: '—', pct: null }), [chainQ.data]);
  const transactionIds = useMemo(
    () =>
      (txQ.data ?? [])
        .map((tx) => Number((tx as any).id))
        .filter((txId) => Number.isFinite(txId) && txId > 0),
    [txQ.data]
  );
  const currentTxId = useMemo(() => firstCurrentTransactionId(txQ.data), [txQ.data]);
  const failedTxId = useMemo(() => firstFailedTransactionId(txQ.data), [txQ.data]);

  const toggleExpanded = (txId: number) => {
    setExpandedTx((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  const expandAllTransactions = () => setExpandedTx(new Set(transactionIds));
  const collapseAllTransactions = () => setExpandedTx(new Set());

  return (
    <DetailShell testId="transactions.chain.detail" variant="wide">
      <ObjectHeader
        boxed
        testId="transactions.chain.detail.header"
        title={title}
        kicker={
          <Link className="text-accent hover:underline" to={`${basePath}/transactions`}>
            {t('transactions.chains.title')}
          </Link>
        }
        titleAfter={
          <span className="inline-flex items-center gap-2">
            {stateBadge}
            {chainQ.data && progress.pct !== null ? <Badge variant="neutral">{progress.pct}%</Badge> : null}
          </span>
        }
        meta={chainIdValid ? `#${chainIdNum}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={togglePinned}
              testId="transactions.chain.detail.pin"
              aria-label={isPinned ? t('transactions.chains.unpin.aria') : t('transactions.chains.pin.aria')}
              title={isPinned ? t('transactions.chains.unpin.title') : t('transactions.chains.pin.title')}
            >
              {isPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
              {isPinned ? t('tasks.action.unpin') : t('tasks.action.pin')}
            </Button>

            {chainIdValid ? (
              <LinkButton
                to={`${basePath}/transactions/items?transaction_chain=${chainIdNum}`}
                variant="secondary"
                size="sm"
                testId="transactions.chain.detail.open_items"
              >
                {t('transactions.items.short')}
              </LinkButton>
            ) : null}

            <Button size="sm" variant="secondary" onClick={chrome.openTasks} testId="transactions.chain.detail.open_tasks">
              {t('common.open_tasks')}
            </Button>
          </div>
        }
      />

      {!chainIdValid ? (
        <ErrorState
          testId="transactions.chain.detail.invalid_id"
          kindOverride="not_found"
          title={t('transactions.chain.detail.invalid_title')}
          body={t('transactions.chain.detail.invalid_body')}
          backTo={`${basePath}/transactions`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'transactions.chain.detail', chainId }}
        />
      ) : chainQ.isLoading ? (
        <LoadingState testId="transactions.chain.detail.loading" />
      ) : chainQ.isError ? (
        <ErrorState
          testId="transactions.chain.detail.error"
          title={t('transactions.chain.detail.load_error.title')}
          error={chainQ.error}
          onRetry={() => void chainQ.refetch()}
          backTo={`${basePath}/transactions`}
          detailsExtra={{ page: 'transactions.chain.detail', chainId: chainIdNum }}
        />
      ) : chainQ.data ? (
        <>
          <Card testId="transactions.chain.detail.info">
            <CardHeader title={t('transactions.chain.detail.section.info')} />
            <CardBody>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <DebugSummaryTile label={t('common.state')} value={stateBadge ?? t('common.na')} />
                <DebugSummaryTile
                  label={t('common.progress')}
                  value={progress.pct !== null ? `${progress.label} · ${progress.pct}%` : t('common.na')}
                />
                <DebugSummaryTile
                  label={failedTxId ? t('transactions.tx.failed_here') : t('transactions.tx.current_step')}
                  value={
                    failedTxId ? (
                      <Link className="text-danger hover:underline" to={`${basePath}/transactions/items/${failedTxId}`}>
                        #{failedTxId}
                      </Link>
                    ) : currentTxId ? (
                      <Link className="text-accent hover:underline" to={`${basePath}/transactions/items/${currentTxId}`}>
                        #{currentTxId}
                      </Link>
                    ) : (
                      t('common.na')
                    )
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs text-muted">{t('common.label')}</div>
                  <div className="mt-1 text-sm font-medium">{(chainQ.data as any).label ? String((chainQ.data as any).label) : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.state')}</div>
                  <div className="mt-1">{stateBadge ?? <span className="text-sm text-muted">{t('common.na')}</span>}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.progress')}</div>
                  <div className="mt-1 text-sm font-medium">
                    {progress.pct !== null ? `${progress.label} · ${progress.pct}%` : t('common.na')}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.created')}</div>
                  <div className="mt-1 text-sm">{formatDateTime(chainQ.data.created_at)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.updated')}</div>
                  <div className="mt-1 text-sm">{formatDateTime((chainQ.data as any).updated_at)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.size')}</div>
                  <div className="mt-1 text-sm">{typeof (chainQ.data as any).size === 'number' ? String((chainQ.data as any).size) : t('common.na')}</div>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="text-xs text-muted">{t('common.concerns')}</div>
                  <div className="mt-2">
                    <ChainConcerns basePath={basePath} concerns={(chainQ.data as any).concerns} t={t} />
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <details className="rounded-md border border-border bg-surface-2 p-3">
                    <summary className="cursor-pointer select-none text-sm font-medium">{t('transactions.chain.detail.section.concerns_raw')}</summary>
                    <pre className="mt-2 overflow-x-auto text-xs text-muted">{safeJson((chainQ.data as any).concerns)}</pre>
                  </details>
                </div>

                {resourceId((chainQ.data as any).action_state) ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-xs text-muted">{t('transactions.chain.detail.section.action_state')}</div>
                    <div className="mt-1 text-sm">
                      <Link
                        className="text-accent hover:underline"
                        to={`${basePath}/action-states/${resourceId((chainQ.data as any).action_state)}`}
                      >
                        {refLabel((chainQ.data as any).action_state) || `#${resourceId((chainQ.data as any).action_state)}`}
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card testId="transactions.chain.detail.transactions">
            <CardHeader
              title={t('transactions.chain.detail.section.transactions')}
              subtitle={
                chainDone
                  ? t('transactions.chain.detail.section.transactions_subtitle_done')
                  : t('transactions.chain.detail.section.transactions_subtitle_live')
              }
              actions={
                transactionIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={expandAllTransactions}>
                      {t('transactions.chain.detail.expand_all')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={collapseAllTransactions}>
                      {t('transactions.chain.detail.collapse_all')}
                    </Button>
                  </div>
                ) : null
              }
            />
            <CardBody>
              {txQ.isLoading ? (
                <LoadingState testId="transactions.chain.detail.transactions.loading" />
              ) : txQ.isError ? (
                <div className="text-sm text-danger">{formatErrorMessage(txQ.error)}</div>
              ) : (txQ.data ?? []).length === 0 ? (
                <div>
                  <div className="text-sm font-medium">{t('transactions.chain.detail.empty.title')}</div>
                  <div className="mt-1 text-sm text-muted">{t('transactions.chain.detail.empty.body')}</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table testId="transactions.chain.detail.transactions.table" minWidth="lg" variant="list">
                    <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="w-10 px-4 py-2">
                        <span className="sr-only">{t('common.state')}</span>
                      </th>
                      <th className="px-4 py-2">{t('common.id')}</th>
                      <th className="px-4 py-2">{t('common.state')}</th>
                      <th className="px-4 py-2">{t('common.name')}</th>
                      <th className="px-4 py-2">{t('common.node')}</th>
                      <th className="px-4 py-2">{t('common.vps')}</th>
                      <th className="px-4 py-2">{t('common.started')}</th>
                      <th className="px-4 py-2">{t('transactions.tx.duration_label')}</th>
                      <th className="px-4 py-2">
                        <span className="sr-only">{t('transactions.tx.details')}</span>
                      </th>
                      <th className="px-4 py-2">
                        <span className="sr-only">{t('common.open')}</span>
                      </th>
                    </tr>
                    </thead>
                    <tbody>
                    {(txQ.data ?? []).map((tx) => {
                      const b = txBadge(tx);
                      const rowVariant = tableVariantFromBadgeVariant(b.variant);

                      const txId = typeof (tx as any).id === 'number' ? ((tx as any).id as number) : undefined;
                      const name = (tx as any).name ? String((tx as any).name) : t('transactions.items.row.fallback_name');

                      const urgent = Boolean((tx as any).urgent);
                      const prio = typeof (tx as any).priority === 'number' ? ((tx as any).priority as number) : undefined;
                      const type = typeof (tx as any).type === 'number' ? ((tx as any).type as number) : undefined;

                      const vId = resourceId((tx as any).vps);
                      const nodeId = resourceId((tx as any).node);

                      const started = (tx as any).started_at as string | null | undefined;
                      const finished = (tx as any).finished_at as string | null | undefined;
                      const sec = durationSec(started, finished);

                      const expanded = Boolean(txId && expandedTx.has(txId));
                      const isCurrent = Boolean(txId && currentTxId === txId);
                      const isFailed = Boolean(txId && failedTxId === txId);

                      return (
                        <React.Fragment key={txId ?? name}>
                          <TableRowLink
                            testId={txId ? `transactions.chain.detail.tx.${txId}` : undefined}
                            to={txId ? `${basePath}/transactions/items/${txId}` : undefined}
                            variant={rowVariant}
                            className="border-b border-border"
                          >
                            <td className="px-4 py-2">
                              <StatusDot
                                variant={dotVariantFromRowVariant(rowVariant)}
                                ariaLabel={t('common.state')}
                                title={b.label}
                              />
                            </td>

                            <td className="px-4 py-2 text-xs text-muted">{txId ? txId : t('common.na')}</td>

                            <td className="px-4 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={b.variant}>{b.label}</Badge>
                                {isFailed ? <Badge variant="danger">{t('transactions.tx.failed_here')}</Badge> : null}
                                {!isFailed && isCurrent ? <Badge variant="warn">{t('transactions.tx.current_step')}</Badge> : null}
                                {urgent ? <Badge variant="warn">{t('transactions.tx.urgent')}</Badge> : null}
                                {type !== undefined ? (
                                  <Badge variant="neutral">{t('transactions.items.row.type_chip', { type })}</Badge>
                                ) : null}
                              </div>
                            </td>

                            <td className="px-4 py-2">
                              <div className="min-w-0">
                                {txId ? (
                                  <Link className="font-medium text-accent hover:underline" to={`${basePath}/transactions/items/${txId}`}>
                                    {name}
                                  </Link>
                                ) : (
                                  <span className="font-medium">{name}</span>
                                )}
                                <div className="mt-1 text-xs text-muted">
                                  {prio !== undefined ? <span>{t('transactions.tx.prio', { prio })}</span> : null}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-2 text-xs">
                              {nodeId ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-muted">{refLabel((tx as any).node) || `#${nodeId}`}</span>
                                  {basePath === '/admin' ? (
                                    <Link className="text-accent hover:underline" to={`${basePath}/nodes/${nodeId}`}>
                                      {t('common.open')}
                                    </Link>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-faint">{t('common.na')}</span>
                              )}
                            </td>

                            <td className="px-4 py-2 text-xs">
                              {vId ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-muted">#{vId}</span>
                                  <Link className="text-accent hover:underline" to={`${basePath}/vps/${vId}`}>
                                    {t('common.open')}
                                  </Link>
                                </span>
                              ) : (
                                <span className="text-faint">{t('common.na')}</span>
                              )}
                            </td>

                            <td className="px-4 py-2 text-xs text-muted">{formatDateTime(started)}</td>

                            <td className="px-4 py-2 text-xs text-muted">
                              {sec !== null ? t('transactions.tx.duration', { sec }) : t('common.na')}
                            </td>

                            <td className="px-4 py-2">
                              {txId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 px-0"
                                  ariaLabel={expanded ? t('common.collapse') : t('common.expand')}
                                  title={t('transactions.tx.details')}
                                  testId={txId ? `transactions.chain.detail.tx.toggle.${txId}` : undefined}
                                  onClick={() => toggleExpanded(txId)}
                                >
                                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              ) : null}
                            </td>

                            <td className="px-4 py-2">
                              {txId ? (
                                <LinkButton
                                  size="sm"
                                  variant="secondary"
                                  to={`${basePath}/transactions/items/${txId}`}
                                  testId={txId ? `transactions.chain.detail.tx.open.${txId}` : undefined}
                                >
                                  {t('common.open')}
                                </LinkButton>
                              ) : null}
                            </td>
                          </TableRowLink>

                          {expanded && txId ? (
                            <tr
                              data-testid={txId ? `transactions.chain.detail.tx.expanded.${txId}` : undefined}
                              data-row-variant={rowVariant}
                              className="border-b border-border"
                            >
                              <td colSpan={10} className="px-4 pb-4">
                                <div className="mt-2">
                                  <TransactionInlineDetails
                                    tx={tx}
                                    t={t}
                                    basePath={basePath}
                                    raw={tx}
                                    maxHeightClass="max-h-80"
                                  />
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}
    </DetailShell>
  );
}

function DebugSummaryTile(props: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="text-xs text-muted">{props.label}</div>
      <div className="mt-1 text-sm font-medium">{props.value}</div>
    </div>
  );
}

function ChainConcerns(props: { basePath: string; concerns: unknown; t: (k: any, vars?: any) => string }) {
  const { basePath, concerns, t } = props;

  const list = Array.isArray(concerns) ? (concerns as any[]) : [];

  if (!list.length) {
    return <div className="text-sm text-muted">{t('common.na')}</div>;
  }

  return (
    <div className="space-y-2">
      {list.map((c, idx) => {
        if (!c || typeof c !== 'object') return null;
        const cls = String((c as any).class_name ?? '');
        const rowId = typeof (c as any).row_id === 'number' ? ((c as any).row_id as number) : undefined;
        const label = (c as any).label ? String((c as any).label) : '';

        const hasObject = Boolean((c as any).object);
        const directHref = hasObject ? safeContentUrl(String((c as any).object)) : null;

        // For common objects we can link to native pages.
        const internalHref = (() => {
          if (!rowId) return null;
          if (cls === 'Vps') return `${basePath}/vps/${rowId}`;
          if (cls === 'User') return basePath === '/admin' ? `${basePath}/users/${rowId}` : null;
          return null;
        })();

        const text = rowId ? `${cls} #${rowId}` : cls;

        return (
          <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs text-muted">{text}</span>
            {label ? <span className="text-sm text-muted">{label}</span> : null}

            {internalHref ? (
              <Link className="text-xs text-accent hover:underline" to={internalHref}>
                {t('common.open')}
              </Link>
            ) : null}
            {directHref ? (
              <a className="text-xs text-accent hover:underline" href={directHref} target="_blank" rel="noreferrer">
                {t('transactions.link.open_object')}
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
