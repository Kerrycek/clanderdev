import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { fetchTransaction, type Transaction } from '../../lib/api/transactions';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';

import { useChrome } from '../../components/layout/ChromeContext';
import { DetailShell } from '../../components/layout/DetailShell';

import { transactionBadge } from '../../lib/taskStatus';
import {
  classifyTransaction,
  operationBadgeVariant,
  operationCategoryLabel,
  operationLabel,
  operationSeverityLabel,
  operationVisibilityLabel,
} from '../../lib/operationTaxonomy';
import { useTierAIntervalMs } from '../../lib/refreshTiers';
import { formatDateTime } from '../../lib/format';
import { resourceId, refLabel } from '../../lib/resources';
import { durationSec, formatPayload, transactionErrorText } from '../../lib/txFormat';

import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LinkButton } from '../../components/ui/LinkButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { ObjectHeader } from '../../components/ui/ObjectHeader';
import { TransactionDebugSections } from '../../components/ui/TransactionPayloadPanels';

function txBadge(tx: Transaction) {
  return transactionBadge(tx);
}

export function TransactionDetailPage() {
  const { basePath } = useAppMode();
  const chrome = useChrome();
  const i18n = useI18n();
  const t = i18n.t;

  const tierARefetchMs = useTierAIntervalMs();
  const { transactionId } = useParams();
  const txIdNum = transactionId ? Number(transactionId) : NaN;
  const txIdValid = Number.isFinite(txIdNum) && txIdNum > 0;

  const txQ = useQuery({
    queryKey: ['transaction', txIdNum],
    enabled: txIdValid,
    queryFn: async () => (await fetchTransaction(txIdNum)).data,
    refetchInterval: (query) => {
      const data = query.state.data as Transaction | undefined;
      const done = String(data?.done ?? '') === 'done';
      return done ? false : tierARefetchMs;
    },
  });

  const tx = txQ.data;
  const txDone = tx ? String((tx as any).done ?? '') === 'done' : false;
  const operation = useMemo(() => (tx ? classifyTransaction(tx) : null), [tx]);
  const rawName = tx?.name ? String(tx.name) : '';

  const title = useMemo(() => {
    if (!txIdValid) return t('transactions.items.detail.invalid_title');
    return operation ? operationLabel(operation, t) : t('transactions.items.row.fallback_name');
  }, [operation, txIdValid, t]);

  const badge = useMemo(() => {
    if (!tx) return null;
    const b = txBadge(tx);
    return <Badge variant={b.variant}>{b.label}</Badge>;
  }, [tx]);

  const chainId = resourceId(tx?.transaction_chain);
  const vpsId = resourceId(tx?.vps);
  const nodeId = resourceId(tx?.node);
  const userId = resourceId((tx as any)?.user);

  const urgent = Boolean((tx as any)?.urgent);
  const prio = typeof (tx as any)?.priority === 'number' ? ((tx as any).priority as number) : undefined;
  const type = typeof (tx as any)?.type === 'number' ? ((tx as any).type as number) : undefined;
  const progress = typeof (tx as any)?.progress === 'number' ? String((tx as any).progress) : undefined;
  const done = (tx as any)?.done ? String((tx as any).done) : undefined;

  const created = (tx as any)?.created_at as string | null | undefined;
  const started = (tx as any)?.started_at as string | null | undefined;
  const finished = (tx as any)?.finished_at as string | null | undefined;
  const sec = durationSec(started, finished);

  const input = formatPayload((tx as any)?.input);
  const output = formatPayload((tx as any)?.output);
  const errorText = transactionErrorText(tx);
  const objectValue = (tx as any)?.object ?? (tx as any)?.object_ref ?? (tx as any)?.object_reference ?? null;
  const objectText = objectValue
    ? refLabel(objectValue) || formatPayload(objectValue)
    : vpsId
      ? refLabel((tx as any)?.vps) || `#${vpsId}`
      : '';
  const deps = Array.isArray((tx as any)?.depends_on) ? (((tx as any).depends_on as any[]) ?? []) : [];

  return (
    <DetailShell testId="transactions.items.detail" variant="wide">
      <ObjectHeader
        boxed
        testId="transactions.items.detail.header"
        title={title}
        kicker={
          <Link className="text-accent hover:underline" to={`${basePath}/transactions/items`}>
            {t('transactions.items.title')}
          </Link>
        }
        titleAfter={
          <span className="inline-flex max-w-full flex-wrap items-center gap-2">
            {badge}
            {operation ? <Badge variant={operationBadgeVariant(operation)}>{operationCategoryLabel(operation, t)}</Badge> : null}
            {operation && operation.severity !== 'normal' ? <Badge variant={operationBadgeVariant(operation)}>{operationSeverityLabel(operation, t)}</Badge> : null}
            {operation && operation.visibility !== 'user' ? <Badge variant={operationBadgeVariant(operation)}>{operationVisibilityLabel(operation, t)}</Badge> : null}
            {urgent ? <Badge variant="warn">{t('transactions.tx.urgent')}</Badge> : null}
            {type !== undefined ? <Badge variant="neutral">{t('transactions.items.row.type_chip', { type })}</Badge> : null}
          </span>
        }
        meta={txIdValid ? `#${txIdNum}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {chainId ? (
              <LinkButton
                to={`${basePath}/transactions/${chainId}`}
                variant="secondary"
                size="sm"
                testId="transactions.items.detail.open_chain"
                title={t('common.open_chain_detail')}
              >
                {t('transactions.items.detail.chain_button', { id: chainId })}
              </LinkButton>
            ) : null}

            <Button size="sm" variant="secondary" onClick={chrome.openTasks} testId="transactions.items.detail.open_tasks">
              {t('common.open_tasks')}
            </Button>
          </div>
        }
      />

      {!txIdValid ? (
        <ErrorState
          testId="transactions.items.detail.invalid_id"
          kindOverride="not_found"
          title={t('transactions.items.detail.invalid_title')}
          body={t('transactions.items.detail.invalid_body')}
          backTo={`${basePath}/transactions/items`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'transactions.items.detail', transactionId }}
        />
      ) : txQ.isLoading ? (
        <LoadingState testId="transactions.items.detail.loading" />
      ) : txQ.isError ? (
        <ErrorState
          testId="transactions.items.detail.error"
          title={t('transactions.items.detail.load_error.title')}
          error={txQ.error}
          onRetry={() => void txQ.refetch()}
          backTo={`${basePath}/transactions/items`}
          detailsExtra={{ page: 'transactions.items.detail', transactionId: txIdNum }}
        />
      ) : tx ? (
        <>
          {errorText ? (
            <Alert variant="danger" title={t('transactions.tx.error_title')} testId="transactions.items.detail.error">
              <pre className="max-w-full whitespace-pre-wrap break-all text-xs">{errorText}</pre>
            </Alert>
          ) : null}

          <Card testId="transactions.items.detail.info">
            <CardHeader title={t('transactions.items.detail.section.info')} />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs text-muted">{t('common.id')}</div>
                  <div className="mt-1 text-sm tabular-nums">#{txIdNum}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.state')}</div>
                  <div className="mt-1">{badge ?? <span className="text-sm text-muted">{t('common.na')}</span>}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.name')}</div>
                  <div className="mt-1 text-sm">
                    {title}
                    {rawName && rawName !== title ? <div className="mt-1 text-xs text-faint">{t('operation.raw_name', { name: rawName })}</div> : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.queued_at_label')}</div>
                  <div className="mt-1 text-sm">{formatDateTime(created)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.updated')}</div>
                  <div className="mt-1 text-sm">{formatDateTime((tx as any)?.updated_at)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.started')}</div>
                  <div className="mt-1 text-sm">{formatDateTime(started)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.finished')}</div>
                  <div className="mt-1 text-sm">{formatDateTime(finished)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.duration_label')}</div>
                  <div className="mt-1 text-sm">{sec !== null ? t('transactions.tx.duration', { sec }) : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.done_label')}</div>
                  <div className="mt-1 text-sm">{done ?? t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.type_label')}</div>
                  <div className="mt-1 text-sm">{type !== undefined ? String(type) : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.prio_label')}</div>
                  <div className="mt-1 text-sm">{prio !== undefined ? String(prio) : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.success_label')}</div>
                  <div className="mt-1 text-sm">{typeof (tx as any)?.success === 'number' ? String((tx as any).success) : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.progress')}</div>
                  <div className="mt-1 text-sm font-medium">{progress ?? t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.user')}</div>
                  <div className="mt-1 text-sm">{userId ? refLabel((tx as any)?.user) || `#${userId}` : t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('transactions.tx.object_label')}</div>
                  <div className="mt-1 text-sm">{objectText || t('common.na')}</div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.chain')}</div>
                  <div className="mt-1 text-sm">
                    {chainId ? (
                      <Link className="text-accent hover:underline" to={`${basePath}/transactions/${chainId}`}>
                        {t('transactions.items.detail.chain_link', { id: chainId })}
                      </Link>
                    ) : (
                      <span className="text-muted">{t('common.na')}</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.node')}</div>
                  <div className="mt-1 text-sm">
                    {nodeId && basePath === '/admin' ? (
                      <Link
                        className="text-accent hover:underline"
                        to={`${basePath}/nodes/${nodeId}`}
                        title={t('common.open_node_detail')}
                        data-testid="transactions.items.detail.node_link"
                      >
                        {refLabel((tx as any)?.node) || `#${nodeId}`}
                      </Link>
                    ) : nodeId ? (
                      <span className="text-muted" data-testid="transactions.items.detail.node_value">
                        {refLabel((tx as any)?.node) || `#${nodeId}`}
                      </span>
                    ) : (
                      <span className="text-muted">{t('common.na')}</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted">{t('common.vps')}</div>
                  <div className="mt-1 text-sm">
                    {vpsId ? (
                      <Link className="text-accent hover:underline" to={`${basePath}/vps/${vpsId}`} title={t('common.open_vps_detail')}>
                        {refLabel((tx as any)?.vps) || `#${vpsId}`}
                      </Link>
                    ) : (
                      <span className="text-muted">{t('common.na')}</span>
                    )}
                  </div>
                </div>

                {deps.length ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-xs text-muted">{t('transactions.tx.depends_on')}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {deps.map((d, idx) => {
                        const id = resourceId(d);
                        if (!id) return null;
                        return (
                          <Link
                            key={idx}
                            to={`${basePath}/transactions/items/${id}`}
                            className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-accent hover:underline"
                          >
                            #{id}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

              </div>
            </CardBody>
          </Card>

          <Card testId="transactions.items.detail.payload">
            <CardHeader
              title={t('transactions.items.detail.section.payload')}
              subtitle={txDone ? t('transactions.items.detail.payload_subtitle_done') : t('transactions.items.detail.payload_subtitle_live')}
            />
            <CardBody>
              <TransactionDebugSections
                t={t}
                input={input}
                output={output}
                errorText={errorText}
                source={tx as any}
                raw={txQ.data}
                maxHeightClass="max-h-96"
                rawTestId="transactions.items.detail.raw"
                testId="transactions.items.detail.debug_sections"
              />
            </CardBody>
          </Card>
        </>
      ) : null}
    </DetailShell>
  );
}
