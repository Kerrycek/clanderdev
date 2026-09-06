import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { getRuntimeConfig } from '../../../app/config';
import { useObjectScope } from '../../../app/objectScope';
import { ListShell } from '../../../components/layout/ListShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';
import { StatCard } from '../../../components/ui/StatCard';
import { TableCard } from '../../../components/ui/TableCard';
import { type Dataset, type SnapshotDownload } from '../../../lib/api/datasets';
import { formatDateTime, formatMiB } from '../../../lib/format';
import {
  snapshotDownloadCanOpen,
  snapshotDownloadHref,
  snapshotDownloadStatus,
} from '../datasets/DatasetDownloadModel';
import { DatasetDownloadOpenButton, DatasetDownloadStateBadge } from '../datasets/DatasetDownloadStatusView';
import {
  BACKUP_CENTER_TABS,
  backupCenterCount,
  filterBackupDatasets,
  parseBackupCenterIntent,
  parseBackupCenterTab,
  resourceLabel,
  resolveSnapshotDownloadDataset,
  snapshotDownloadDatasetPath,
  summarizeBackupCenter,
  type BackupCenterTab,
} from './BackupCenterModel';
import {
  fetchAllBackupDatasets,
  fetchAuthorizedSnapshotDownloads,
  fetchOwnDatasetDownloads,
} from './BackupCenterDownloads';
import { BackupCenterDatasetWorkspaceView } from './BackupCenterDatasetWorkspaceView';
import { BackupCenterQuickActions } from './BackupCenterQuickActions';
import { BackupCenterRestoreGuide } from './BackupCenterRestoreGuide';

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

function DownloadRows(props: {
  downloads: SnapshotDownload[];
  datasets: Dataset[];
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
          const dataset = resolveSnapshotDownloadDataset(download, props.datasets);
          const detailPath = snapshotDownloadDatasetPath(download, dataset);
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
                  {detailPath ? (
                    <Button
                      to={detailPath}
                      size="sm"
                      variant="ghost"
                      testId={`backups.downloads.row.${download.id}.detail`}
                    >
                      {t('backups.open')}
                    </Button>
                  ) : null}
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
  const intent = parseBackupCenterIntent(searchParams.get('intent'));
  const query = searchParams.get('q') ?? '';
  const selectedDatasetParam = searchParams.get('dataset');
  const needsDatasetScopedDownloads = scope.mineUserId !== undefined;
  const shouldLoadDownloads = tab === 'overview' || tab === 'downloads';

  const datasetsQ = useQuery({
    queryKey: ['backup-center', 'datasets', { user: scope.mineUserId }],
    queryFn: () => fetchAllBackupDatasets({
      limit: DATASET_LIMIT,
      includes: 'vps,parent,environment,user',
      user: scope.mineUserId,
    }),
    staleTime: 30_000,
    enabled: true,
  });
  const datasets = datasetsQ.data?.data ?? [];
  const scopedDatasetIds = needsDatasetScopedDownloads
    ? datasets.map((dataset) => Number(dataset.id)).filter(Number.isFinite)
    : [];
  const downloadsEnabled = shouldLoadDownloads
    && (!needsDatasetScopedDownloads || datasetsQ.isSuccess);
  const downloadsQ = useQuery({
    queryKey: [
      'backup-center',
      'downloads',
      needsDatasetScopedDownloads
        ? { user: scope.mineUserId, datasets: scopedDatasetIds }
        : { scope: 'api-authorized-user' },
    ],
    queryFn: async () => {
      if (needsDatasetScopedDownloads) {
        return fetchOwnDatasetDownloads(datasets, { limit: DOWNLOAD_LIMIT });
      }
      return fetchAuthorizedSnapshotDownloads({ limit: DOWNLOAD_LIMIT });
    },
    staleTime: 15_000,
    enabled: downloadsEnabled,
  });

  const downloads = downloadsQ.data?.data ?? [];
  const selectedDatasetId = selectedDatasetParam && /^\d+$/.test(selectedDatasetParam)
    ? Number(selectedDatasetParam)
    : undefined;
  const selectedDataset = selectedDatasetId !== undefined
    ? datasets.find((dataset) => dataset.id === selectedDatasetId)
    : undefined;
  const invalidDatasetSelection = Boolean(selectedDatasetParam && !selectedDataset);
  const filteredDatasets = useMemo(() => filterBackupDatasets(datasets, query), [datasets, query]);
  const filteredDownloads = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return downloads;
    return downloads.filter((download) => [
      download.id,
      resourceLabel(download.snapshot, ''),
      resourceLabel(resolveSnapshotDownloadDataset(download, datasets), ''),
      download.format,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle));
  }, [datasets, downloads, query]);
  const summary = useMemo(
    () => summarizeBackupCenter(datasets, downloads, hrefOptions),
    [datasets, downloads, hrefOptions],
  );

  function changeTab(nextTab: BackupCenterTab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    next.delete('intent');
    setSearchParams(next, { replace: true });
  }

  function beginRestore() {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'snapshots');
    next.set('intent', 'restore');
    setSearchParams(next, { replace: true });
  }

  function changeQuery(nextQuery: string) {
    const next = new URLSearchParams(searchParams);
    if (nextQuery.trim()) next.set('q', nextQuery);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  function clearEmbeddedSnapshotParams(next: URLSearchParams) {
    for (const key of [...next.keys()]) {
      if (key.startsWith('backup_snapshot_')) next.delete(key);
    }
  }

  function selectDataset(dataset: Dataset) {
    const next = new URLSearchParams(searchParams);
    next.set('dataset', String(dataset.id));
    clearEmbeddedSnapshotParams(next);
    setSearchParams(next, { replace: true });
  }

  function clearDatasetSelection() {
    const next = new URLSearchParams(searchParams);
    next.delete('dataset');
    clearEmbeddedSnapshotParams(next);
    setSearchParams(next, { replace: true });
  }

  const datasetTotal = datasetsQ.data?.totalCount;
  const downloadTotal = downloadsQ.data?.totalCount;
  const datasetsComplete = datasetsQ.data?.complete === true;
  const downloadsComplete = downloadsQ.data?.complete === true
    && (!needsDatasetScopedDownloads || datasetsComplete);
  const datasetScopeLimited = datasetsQ.isSuccess && !datasetsComplete;
  const downloadScopeLimited = downloadsQ.isSuccess && !downloadsComplete;
  const datasetScopeIsRequired = needsDatasetScopedDownloads
    || tab === 'snapshots'
    || tab === 'plans';
  const scopeLimited = (datasetScopeIsRequired && datasetScopeLimited)
    || (shouldLoadDownloads && downloadScopeLimited);
  const datasetMetadataLimited = !needsDatasetScopedDownloads
    && shouldLoadDownloads
    && (datasetsQ.isError || datasetScopeLimited);
  const partialDownloadDatasetCount = downloadsQ.data?.failedDatasetIds.length ?? 0;
  const downloadsLoading = (downloadsEnabled && downloadsQ.isPending)
    || (needsDatasetScopedDownloads && datasetsQ.isPending);
  const loading = (tab === 'overview' && downloadsLoading)
    || ((tab === 'snapshots' || tab === 'plans') && datasetsQ.isPending)
    || (tab === 'downloads' && downloadsLoading);
  const error = tab === 'downloads'
    ? downloadsQ.error ?? (needsDatasetScopedDownloads ? datasetsQ.error : null)
    : tab === 'overview'
      ? downloadsQ.error ?? (needsDatasetScopedDownloads ? datasetsQ.error : null)
      : datasetsQ.error;

  function retryActiveTab() {
    if (tab === 'downloads') {
      void datasetsQ.refetch();
      void downloadsQ.refetch();
      return;
    }
    void datasetsQ.refetch();
    if (tab === 'overview') void downloadsQ.refetch();
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
        {!loading && !error && datasetMetadataLimited ? (
          <Alert
            variant="warn"
            title={t('backups.datasets.metadata_partial.title')}
            testId="backups.datasets.metadata_partial"
          >
            {t('backups.datasets.metadata_partial.body')}
          </Alert>
        ) : null}
        {!loading && !error && shouldLoadDownloads && partialDownloadDatasetCount > 0 ? (
          <Alert
            variant="warn"
            title={t('backups.downloads.partial.title')}
            testId="backups.downloads.partial"
          >
            {t('backups.downloads.partial.body', { count: partialDownloadDatasetCount })}
          </Alert>
        ) : null}

        {!loading && !error && tab === 'overview' ? (
          <div className="space-y-6" data-testid="backups.overview">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                testId="backups.stats.datasets"
                title={t('backups.stats.datasets')}
                value={datasetsQ.isPending
                  ? '…'
                  : backupCenterCount(datasetTotal ?? summary.datasets, datasetsComplete)}
                subtitle={t('backups.stats.datasets.help')}
              />
              <StatCard
                testId="backups.stats.downloads"
                title={t('backups.stats.downloads')}
                value={backupCenterCount(downloadTotal ?? summary.downloads, downloadsComplete)}
                subtitle={t('backups.stats.downloads.help')}
              />
              <StatCard
                testId="backups.stats.ready"
                title={t('backups.stats.ready')}
                value={backupCenterCount(summary.readyDownloads, downloadsComplete)}
                subtitle={t('backups.stats.ready.help')}
              />
              <StatCard
                testId="backups.stats.pending"
                title={t('backups.stats.pending')}
                value={backupCenterCount(summary.pendingDownloads, downloadsComplete)}
                subtitle={t('backups.stats.pending.help')}
              />
              <StatCard
                testId="backups.stats.unavailable"
                title={t('backups.stats.unavailable')}
                value={backupCenterCount(summary.unavailableDownloads, downloadsComplete)}
                subtitle={t('backups.stats.unavailable.help')}
              />
            </div>
            <BackupCenterQuickActions
              onRestore={beginRestore}
              onDownloads={() => changeTab('downloads')}
              onPlans={() => changeTab('plans')}
            />
            <div>
              <h2 className="mb-3 text-base font-semibold">{t('backups.recent_downloads')}</h2>
              {downloads.length ? (
                <DownloadRows
                  downloads={downloads}
                  datasets={datasets}
                  compact
                  hrefOptions={hrefOptions}
                />
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
            {tab === 'snapshots' && intent === 'restore' ? (
              <BackupCenterRestoreGuide />
            ) : (
              <Card>
                <CardBody>
                  <div className="font-semibold">{t(`backups.${tab}.scope.title`)}</div>
                  <p className="mt-1 text-sm text-muted">{t(`backups.${tab}.scope.body`)}</p>
                </CardBody>
              </Card>
            )}
            {filteredDatasets.length || selectedDataset || invalidDatasetSelection ? (
              <BackupCenterDatasetWorkspaceView
                datasets={filteredDatasets}
                selectedDataset={selectedDataset}
                invalidSelection={invalidDatasetSelection}
                section={tab}
                restoreMode={tab === 'snapshots' && intent === 'restore'}
                onSelect={selectDataset}
                onClear={clearDatasetSelection}
                onRefetch={() => void datasetsQ.refetch()}
              />
            ) : (
              <EmptyState
                title={t(tab === 'snapshots' && intent === 'restore'
                  ? 'backups.restore.workspace.empty.title'
                  : `backups.${tab}.empty.title`)}
                body={t(tab === 'snapshots' && intent === 'restore'
                  ? 'backups.restore.workspace.empty.body'
                  : `backups.${tab}.empty.body`)}
              />
            )}
          </div>
        ) : null}

        {!loading && !error && tab === 'downloads' ? (
          <div data-testid="backups.downloads">
            {filteredDownloads.length ? (
              <DownloadRows
                downloads={filteredDownloads}
                datasets={datasets}
                hrefOptions={hrefOptions}
              />
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
