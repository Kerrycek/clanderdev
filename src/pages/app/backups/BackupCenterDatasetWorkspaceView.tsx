import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { Dataset } from '../../../lib/api/datasets';
import { DatasetPlansPage } from '../datasets/DatasetPlansPage';
import { DatasetSnapshotsPage } from '../datasets/DatasetSnapshotsPage';
import {
  datasetBackupKind,
  datasetBackupLabel,
  datasetBackupPath,
  resourceLabel,
} from './BackupCenterModel';
import { BackupCenterDatasetWorkspace } from './BackupCenterDatasetWorkspace';

interface BackupCenterDatasetWorkspaceViewProps {
  datasets: Dataset[];
  selectedDataset: Dataset | undefined;
  invalidSelection: boolean;
  section: 'snapshots' | 'plans';
  onSelect: (dataset: Dataset) => void;
  onClear: () => void;
  onRefetch: () => void;
}

export function BackupCenterDatasetWorkspaceView(props: BackupCenterDatasetWorkspaceViewProps) {
  const { t } = useI18n();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,0.34fr)_minmax(0,1fr)]">
      <Card testId={`backups.${props.section}.datasets`}>
        <CardHeader
          title={t('backups.workspace.datasets.title')}
          subtitle={t('backups.workspace.datasets.subtitle')}
        />
        <nav
          className="max-h-80 space-y-2 overflow-y-auto p-3 lg:max-h-screen"
          aria-label={t('backups.workspace.datasets.aria')}
        >
          {props.datasets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
              {t('backups.workspace.datasets.no_matches')}
            </div>
          ) : null}
          {props.datasets.map((dataset) => {
            const selected = props.selectedDataset?.id === dataset.id;
            return (
              <button
                key={dataset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => props.onSelect(dataset)}
                data-testid={`backups.${props.section}.row.${dataset.id}`}
                className={`w-full rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  selected
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : 'border-border bg-surface-2 hover:border-accent/50 hover:bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-fg">{datasetBackupLabel(dataset)}</div>
                    <div className="mt-1 text-xs text-faint">#{dataset.id}</div>
                  </div>
                  <Badge variant={selected ? 'info' : 'neutral'}>
                    {t(`backups.kind.${datasetBackupKind(dataset)}`)}
                  </Badge>
                </div>
                {dataset.vps ? (
                  <div className="mt-2 truncate text-sm text-muted">
                    {t('backups.vps')}: {resourceLabel(dataset.vps)}
                  </div>
                ) : null}
              </button>
            );
          })}
        </nav>
      </Card>

      <div className="min-w-0 space-y-4" data-testid={`backups.${props.section}.workspace`}>
        {props.selectedDataset ? (
          <>
            <Card testId="backups.workspace.selection">
              <CardHeader
                title={datasetBackupLabel(props.selectedDataset)}
                subtitle={t('backups.workspace.selected', { id: props.selectedDataset.id })}
                actions={
                  <Button
                    to={datasetBackupPath(props.selectedDataset, props.section)}
                    size="sm"
                    variant="secondary"
                  >
                    {t('backups.workspace.open_detail')}
                  </Button>
                }
              />
            </Card>
            <BackupCenterDatasetWorkspace
              key={props.selectedDataset.id}
              dataset={props.selectedDataset}
              refetch={props.onRefetch}
            >
              {props.section === 'snapshots' ? (
                <DatasetSnapshotsPage queryParamPrefix="backup_snapshot_" />
              ) : (
                <DatasetPlansPage />
              )}
            </BackupCenterDatasetWorkspace>
          </>
        ) : props.invalidSelection ? (
          <EmptyState
            testId="backups.workspace.invalid"
            title={t('backups.workspace.invalid.title')}
            body={t('backups.workspace.invalid.body')}
            action={<Button onClick={props.onClear}>{t('backups.workspace.invalid.clear')}</Button>}
          />
        ) : (
          <EmptyState
            testId="backups.workspace.empty"
            title={t(`backups.${props.section}.workspace.empty.title`)}
            body={t(`backups.${props.section}.workspace.empty.body`)}
          />
        )}
      </div>
    </div>
  );
}
