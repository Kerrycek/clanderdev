import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { getRuntimeConfig } from '../../../app/config';
import { useObjectScope } from '../../../app/objectScope';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';
import { StatCard } from '../../../components/ui/StatCard';
import { TableCard } from '../../../components/ui/TableCard';
import { fetchDatasets, fetchSnapshotDownloads, type Dataset, type SnapshotDownload } from '../../../lib/api/datasets';
import { getMetaTotalCount } from '../../../lib/api/haveapi';
import { formatDateTime, formatMiB } from '../../../lib/format';
import {
  snapshotDownloadCanOpen,
  snapshotDownloadHref,
  snapshotDownloadStatus,
} from '../datasets/DatasetDownloadModel';
import { DatasetDownloadOpenButton, DatasetDownloadStateBadge } from '../datasets/DatasetDownloadStatusView';
import {
  BACKUP_CENTER_TABS,
  datasetBackupKind,
  datasetBackupLabel,
  datasetBackupPath,
  filterBackupDatasets,
  parseBackupCenterTab,
  resourceLabel,
  snapshotDownloadDataset,
  snapshotDownloadDatasetPath,
  summarizeBackupCenter,
  type BackupCenterTab,
} from './BackupCenterModel';

const DATASET_LIMIT = 100;
const DOWNLOAD_LIMIT = 100;

function BackupTabs(props: { active: BackupCenterTab; onChange: (tab: BackupCenterTab) => void }) {
  const { t } = useI18n();

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = BACKUP_CENTER_TABS.indexOf(props.active);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % BACKUP_CENTER_TABS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + BACKUP_CENTER_TABS.length) % BACKUP_CENTER_TABS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = BACKUP_CENTER_TABS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = BACKUP_CENTER_TABS[nextIndex];
    if (!nextTab) return;
    props.onChange(nextTab);
    document.getElementById(`backups-tab-${nextTab}`)?.focus();
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label={t('backups.tabs.aria')}
      onKeyDown={handleKeyDown}
    >
      {BACKUP_CENTER_TABS.map((tab) => (
        <Button
          key={tab}
          id={`backups-tab-${tab}`}
          variant={props.active === tab ? 'secondary' : 'ghost'}
          onClick={() => props.onChange(tab)}
          ariaLabel={t(`backups.tabs.${tab}`)}
          role="tab"
          aria-selected={props.active === tab}
          aria-controls="backups-tab-panel"
          tabIndex={props.active === tab ? 0 : -1}
          testId={`backups.tab.${tab}`}
        >
          {t(`backups.tabs.${tab}`)}
        </Button>
      ))}
    </div>
  );
}

function DatasetRows(props: { datasets: Dataset[]; section: 'snapshots' | 'plans' }) {
  const { t } = useI18n();
  return (
    <TableCard minWidth="md" testId={`backups.${props.section}.table`}>
      <thead>
        <tr>
          <th className="px-3 py-2 text-left">{t('backups.dataset')}</th>
          <th className="px-3 py-2 text-left">{t('backups.kind')}</th>
          <th className="px-3 py-2 text-left">{t('backups.vps')}</th>
          <th className="px-3 py-2 text-right">{t('backups.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {props.datasets.map((dataset) => {
          return (
            <tr key={dataset.id} data-testid={`backups.${props.section}.row.${dataset.id}`}>
              <td className="px-3 py-2">
                <div className="font-medium text-fg">{datasetBackupLabel(dataset)}</div>
                <div className="text-xs text-faint">#{dataset.id}</div>
              </td>
              <td className="px-3 py-2">
                <Badge variant="neutral">{t(`backups.kind.${datasetBackupKind(dataset)}`)}</Badge>
              </td>
              <td className="px-3 py-2 text-muted">{resourceLabel(dataset.vps)}</td>
              <td className="px-3 py-2 text-right">
                <Button to={datasetBackupPath(dataset, props.section)} size="sm" variant="secondary">
                  {t(`backups.${props.section}.open`)}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );
}

function DownloadRows(props: {
  downloads: SnapshotDownload[];
  compact?: boolean;
  hrefOptions: { webuiUrl?: string; origin?: string };
}) {
  const { t } = useI18n();
  const rows = props.compact ? props.downloads.slice(0, 5) : props.downloads;
  return (
    <TableCard minWidth="lg" testId="backups.downloads.table">
      <thead>
        <tr>
          <th className="px-3 py-2 text-left">{t('backups.dataset')}</th>
          <th className="px-3 py-2 text-left">{t('backups.snapshot')}</th>
          <th className="px-3 py-2 text-left">{t('backups.downloads.format')}</th>
          <th className="px-3 py-2 text-left">{t('backups.downloads.state')}</th>
          <th className="px-3 py-2 text-left">{t('backups.downloads.expires')}</th>
          <th className="px-3 py-2 text-right">{t('backups.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((download) => {
          const href = snapshotDownloadHref(download, props.hrefOptions);
          const status = snapshotDownloadStatus(download, { href });
          const dataset = snapshotDownloadDataset(download);
          const detailPath = snapshotDownloadDatasetPath(download);
          const expiration = String(download.expiration_date ?? download.expires_at ?? '');
          return (
            <tr key={download.id} data-testid={`backups.downloads.row.${download.id}`}>
              <td className="px-3 py-2">
                <div className="font-medium">{resourceLabel(dataset, t('backups.dataset.unknown'))}</div>
                <div className="text-xs text-faint">#{dataset?.id ?? '—'}</div>
              </td>
              <td className="px-3 py-2 text-muted">{resourceLabel(download.snapshot, `#${download.snapshot?.id ?? '—'}`)}</td>
              <td className="px-3 py-2">
                {download.format ? t(`dataset.download.format.${download.format}`) : '—'}
                {download.size !== undefined ? <div className="text-xs text-faint">{formatMiB(download.size)}</div> : null}
              </td>
              <td className="px-3 py-2"><DatasetDownloadStateBadge status={status} t={t} /></td>
              <td className="px-3 py-2 text-muted">{expiration ? formatDateTime(expiration) : '—'}</td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-2">
                  {detailPath ? <Button to={detailPath} size="sm" variant="ghost">{t('backups.open')}</Button> : null}
                  <DatasetDownloadOpenButton
                    href={href}
                    canOpen={snapshotDownloadCanOpen(status, href)}
                    disabledTitle={t(`dataset.downloads.state_detail.${status}`)}
                    testId={`backups.downloads.row.${download.id}.download`}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );
}

export function BackupCenterPage() {
  const { t } = useI18n();
  const scope = useObjectScope();
  const runtime = useMemo(() => getRuntimeConfig(), []);
  const hrefOptions = useMemo(
    () => ({
      webuiUrl: runtime.webuiUrl,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
    [runtime.webuiUrl],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseBackupCenterTab(searchParams.get('tab'));
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const canLoadGlobalDownloads = scope.mineUserId === undefined;

  const datasetsQ = useQuery({
    queryKey: ['backup-center', 'datasets', { user: scope.mineUserId }],
    queryFn: () => fetchDatasets({
      limit: DATASET_LIMIT,
      includes: 'vps,parent',
      user: scope.mineUserId,
      count: true,
    }),
    staleTime: 30_000,
    enabled: tab !== 'downloads',
  });
  const downloadsQ = useQuery({
    queryKey: ['backup-center', 'downloads', { userScope: scope.scope }],
    queryFn: () => fetchSnapshotDownloads({
      limit: DOWNLOAD_LIMIT,
      includes: 'snapshot__dataset',
      count: true,
    }),
    staleTime: 15_000,
    enabled: canLoadGlobalDownloads && (tab === 'overview' || tab === 'downloads'),
  });

  const datasets = datasetsQ.data?.data ?? [];
  const downloads = downloadsQ.data?.data ?? [];
  const filteredDatasets = useMemo(() => filterBackupDatasets(datasets, query), [datasets, query]);
  const filteredDownloads = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return downloads;
    return downloads.filter((download) => [
      download.id,
      resourceLabel(download.snapshot, ''),
      resourceLabel(snapshotDownloadDataset(download), ''),
      download.format,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
  }, [downloads, query]);
  const summary = useMemo(
    () => summarizeBackupCenter(datasets, downloads, hrefOptions),
    [datasets, downloads, hrefOptions],
  );

  function changeTab(nextTab: BackupCenterTab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    const next = new URLSearchParams(searchParams);
    if (nextQuery.trim()) next.set('q', nextQuery);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  const datasetTotal = getMetaTotalCount(datasetsQ.data?.meta);
  const downloadTotal = getMetaTotalCount(downloadsQ.data?.meta);
  const datasetScopeLimited = (datasetTotal ?? 0) > datasets.length;
  const downloadScopeLimited = canLoadGlobalDownloads && (downloadTotal ?? 0) > downloads.length;
  const scopeLimited = datasetScopeLimited || downloadScopeLimited;
  const loading = (tab === 'overview' && (datasetsQ.isPending || (canLoadGlobalDownloads && downloadsQ.isPending)))
    || ((tab === 'snapshots' || tab === 'plans') && datasetsQ.isPending)
    || (tab === 'downloads' && canLoadGlobalDownloads && downloadsQ.isPending);
  const error = tab === 'downloads'
    ? (canLoadGlobalDownloads ? downloadsQ.error : null)
    : tab === 'overview'
      ? datasetsQ.error ?? (canLoadGlobalDownloads ? downloadsQ.error : null)
      : datasetsQ.error;

  function retryActiveTab() {
    if (tab === 'downloads') {
      if (canLoadGlobalDownloads) void downloadsQ.refetch();
      return;
    }
    void datasetsQ.refetch();
    if (tab === 'overview' && canLoadGlobalDownloads) void downloadsQ.refetch();
  }

  return (
    <ListShell
      variant="wide"
      testId="backups.page"
      header={<PageHeader title={t('backups.title')} description={t('backups.subtitle')} />}
      filters={
        <div className="space-y-3">
          <BackupTabs active={tab} onChange={changeTab} />
          {tab !== 'overview' ? (
            <Input
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder={t(`backups.${tab}.filter`)}
              ariaLabel={t(`backups.${tab}.filter`)}
              testId="backups.filter"
            />
          ) : null}
        </div>
      }
    >
      <div
        id="backups-tab-panel"
        role="tabpanel"
        aria-labelledby={`backups-tab-${tab}`}
        className="space-y-6"
      >
        {loading ? <LoadingState testId="backups.loading" /> : null}
        {!loading && error ? (
          <ErrorState error={error} onRetry={retryActiveTab} testId="backups.error" />
        ) : null}
        {!loading && !error && scopeLimited ? (
          <Card>
            <CardBody className="text-sm text-muted">
              {t('backups.scope_limited', {
                datasets: datasets.length,
                downloads: downloads.length,
              })}
            </CardBody>
          </Card>
        ) : null}

        {!loading && !error && tab === 'overview' ? (
          <div className="space-y-6" data-testid="backups.overview">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                testId="backups.stats.datasets"
                title={t('backups.stats.datasets')}
                value={datasetTotal ?? summary.datasets}
                subtitle={t('backups.stats.datasets.help')}
              />
              <StatCard
                testId="backups.stats.downloads"
                title={t('backups.stats.downloads')}
                value={canLoadGlobalDownloads ? (downloadTotal ?? summary.downloads) : '—'}
                subtitle={
                  canLoadGlobalDownloads
                    ? t('backups.stats.downloads.help')
                    : t('backups.downloads.mine_scope.help')
                }
              />
              <StatCard
                testId="backups.stats.ready"
                title={t('backups.stats.ready')}
                value={canLoadGlobalDownloads ? summary.readyDownloads : '—'}
                subtitle={t('backups.stats.ready.help')}
              />
              <StatCard
                testId="backups.stats.pending"
                title={t('backups.stats.pending')}
                value={canLoadGlobalDownloads ? summary.pendingDownloads : '—'}
                subtitle={t('backups.stats.pending.help')}
              />
            </div>
            <Card>
              <CardHeader title={t('backups.quick.title')} subtitle={t('backups.quick.subtitle')} />
              <CardBody className="grid gap-3 md:grid-cols-3">
                <Button onClick={() => changeTab('snapshots')} variant="secondary">
                  {t('backups.quick.snapshots')}
                </Button>
                <Button onClick={() => changeTab('downloads')} variant="secondary">
                  {t('backups.quick.downloads')}
                </Button>
                <Button onClick={() => changeTab('plans')} variant="secondary">
                  {t('backups.quick.plans')}
                </Button>
              </CardBody>
            </Card>
            <div>
              <h2 className="mb-3 text-base font-semibold">{t('backups.recent_downloads')}</h2>
              {!canLoadGlobalDownloads ? (
                <Card>
                  <CardBody className="text-sm text-muted">
                    {t('backups.downloads.mine_scope.body')}
                  </CardBody>
                </Card>
              ) : downloads.length ? (
                <DownloadRows downloads={downloads} compact hrefOptions={hrefOptions} />
              ) : (
                <EmptyState
                  title={t('backups.downloads.empty.title')}
                  body={t('backups.downloads.empty.body')}
                />
              )}
            </div>
          </div>
        ) : null}

        {!loading && !error && (tab === 'snapshots' || tab === 'plans') ? (
          <div className="space-y-4" data-testid={`backups.${tab}`}>
            <Card>
              <CardBody>
                <div className="font-semibold">{t(`backups.${tab}.scope.title`)}</div>
                <p className="mt-1 text-sm text-muted">{t(`backups.${tab}.scope.body`)}</p>
              </CardBody>
            </Card>
            {filteredDatasets.length ? (
              <DatasetRows datasets={filteredDatasets} section={tab} />
            ) : (
              <EmptyState
                title={t(`backups.${tab}.empty.title`)}
                body={t(`backups.${tab}.empty.body`)}
              />
            )}
          </div>
        ) : null}

        {!loading && !error && tab === 'downloads' ? (
          <div data-testid="backups.downloads">
            {!canLoadGlobalDownloads ? (
              <Card>
                <CardBody className="text-sm text-muted">
                  {t('backups.downloads.mine_scope.body')}
                </CardBody>
              </Card>
            ) : filteredDownloads.length ? (
              <DownloadRows downloads={filteredDownloads} hrefOptions={hrefOptions} />
            ) : (
              <EmptyState
                title={t('backups.downloads.empty.title')}
                body={t('backups.downloads.empty.body')}
              />
            )}
          </div>
        ) : null}
      </div>
    </ListShell>
  );
}
