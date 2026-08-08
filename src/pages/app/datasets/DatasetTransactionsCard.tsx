import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { Spinner } from '../../../components/ui/Spinner';
import type { TransactionChain } from '../../../lib/api/transactions';
import { formatDateTime } from '../../../lib/format';

type TranslationFunction = ReturnType<typeof useI18n>['t'];

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function chainBadgeFromState(
  state: string | null | undefined,
  t: TranslationFunction,
): { label: string; variant: React.ComponentProps<typeof Badge>['variant'] } {
  const rawState = String(state ?? '').trim();
  const normalizedState = rawState.toLowerCase();

  if (normalizedState === 'done' || normalizedState === 'completed' || normalizedState === 'resolved') {
    return { label: t('state.done'), variant: 'ok' };
  }
  if (normalizedState === 'running') return { label: t('state.running'), variant: 'warn' };
  if (normalizedState === 'failed' || normalizedState === 'fatal') {
    return { label: t('state.failed'), variant: 'danger' };
  }
  if (normalizedState === 'canceled' || normalizedState === 'cancelled') {
    return { label: t('state.canceled'), variant: 'neutral' };
  }

  // Anything else that is not a finished state is treated as working.
  if (rawState) return { label: rawState, variant: 'warn' };
  return { label: t('state.unknown'), variant: 'neutral' };
}

function isFailedChainState(state: string | null | undefined): boolean {
  const normalizedState = String(state ?? '').trim().toLowerCase();
  return normalizedState === 'failed' || normalizedState === 'fatal';
}

function chainProgressLabel(
  chain: TransactionChain,
  t: TranslationFunction,
): string | null {
  const progress = asNumber(chain.progress);
  if (progress === undefined) return null;

  // Some backends report percent as 0..1, some as 0..100.
  const percent = progress <= 1 ? Math.round(progress * 100) : Math.round(progress);
  return t('common.progress_percent', { percent: Math.max(0, Math.min(100, percent)) });
}

export function DatasetTransactionsCard(props: {
  chainsLoading: boolean;
  chainsError: unknown | null;
  chains: TransactionChain[];
}) {
  const { t } = useI18n();
  const { basePath } = useAppMode();

  const sorted = useMemo(() => {
    const list = [...(props.chains ?? [])];
    list.sort((a, b) => Number(b.id) - Number(a.id));
    return list;
  }, [props.chains]);

  return (
    <Card testId="dataset.overview.transactions">
      <CardHeader
        title={t('dataset.overview.transactions.title')}
        subtitle={t('dataset.overview.transactions.subtitle')}
        actions={
          <ChipLink to={`${basePath}/transactions`} title={t('dataset.overview.transactions.open_chains_title')}>
            {t('dataset.overview.transactions.open_chains')}
          </ChipLink>
        }
      />
      <CardBody>
        {props.chainsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t('common.loading')}
          </div>
        ) : props.chainsError ? (
          <Alert title={t('dataset.overview.transactions.load_error.title')} variant="danger">
            {t('dataset.overview.transactions.load_error.body')}
          </Alert>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-muted">{t('dataset.overview.transactions.empty')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((chain) => {
              const badge = chainBadgeFromState(chain.state, t);
              const label = chain.label ? String(chain.label) : `#${chain.id}`;
              const isError = isFailedChainState(chain.state);
              const progress = chainProgressLabel(chain, t);

              return (
                <li
                  key={chain.id}
                  className={
                    'flex flex-wrap items-center justify-between gap-3 py-3 ' +
                    (isError ? 'rounded-md bg-danger-bg px-2 -mx-2' : '')
                  }
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">
                      <Link className="text-accent hover:underline" to={`${basePath}/transactions/${chain.id}`}>
                        {label}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      #{chain.id} · {formatDateTime(chain.created_at)}
                      {progress ? <> · {progress}</> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ChipLink
                      to={`${basePath}/transactions/items?transaction_chain=${chain.id}`}
                      title={t('dataset.overview.transactions.open_items_title', { id: chain.id })}
                    >
                      {t('dataset.overview.transactions.open_items')}
                    </ChipLink>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
