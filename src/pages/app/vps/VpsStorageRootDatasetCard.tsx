import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { Spinner } from '../../../components/ui/Spinner';
import { formatMiB } from '../../../lib/format';
import type { RootDatasetSummary } from './VpsStorageModel';

function MetadataItem(props: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-faint">{props.label}</div>
      <div className="font-medium text-fg">{props.value}</div>
    </div>
  );
}
function countLabel(value: number | null): string | number {
  return value ?? '—';
}

export function VpsStorageRootDatasetCard(props: {
  basePath: string;
  canAdmin: boolean;
  canCreateSubdataset: boolean;
  root: RootDatasetSummary;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  const root = props.root;

  if (!root.id) {
    return (
      <Card testId="vps.storage.root_dataset.empty">
        <CardHeader title={t('vps.storage.root_dataset.title')} subtitle={t('vps.storage.root_dataset.empty.subtitle')} />
        <CardBody>
          <div className="text-sm text-muted">{t('vps.storage.root_dataset.empty.body')}</div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card testId="vps.storage.root_dataset">
      <CardHeader title={t('vps.storage.root_dataset.title')} subtitle={t('vps.storage.root_dataset.subtitle', { dataset: root.label })} />
      <CardBody>
        {props.loading ? (
          <div className="mb-3 flex items-center gap-2 text-sm text-muted" data-testid="vps.storage.root_dataset.loading">
            <Spinner /> {t('common.loading')}
          </div>
        ) : null}
        {props.error ? (
          <div className="mb-3">
            <Alert title={t('vps.storage.root_dataset.load_error')} variant="danger">
              {props.error}
            </Alert>
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4" data-testid="vps.storage.root_dataset.metadata">
          <MetadataItem label={t('dataset.field.used')} value={formatMiB(root.used)} />
          <MetadataItem label={t('dataset.field.available')} value={formatMiB(root.available)} />
          <MetadataItem label={t('dataset.field.reference_quota')} value={root.referenceQuota !== null ? formatMiB(root.referenceQuota) : '∞'} />
          <MetadataItem label={t('dataset.field.quota')} value={formatMiB(root.quota)} />
          <MetadataItem label={t('dataset.field.referenced')} value={formatMiB(root.referenced)} />
          <MetadataItem label={t('common.state')} value={root.state ?? t('common.na')} />
          <MetadataItem
            label={t('vps.storage.root_dataset.capacity')}
            value={root.capacityPercent !== null ? t('vps.storage.root_dataset.capacity_percent', { percent: root.capacityPercent }) : t('common.na')}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <ChipLink to={`${props.basePath}/datasets/${root.id}`} data-testid="vps.storage.root_dataset.open">
            {t('vps.storage.root_dataset.open')}
          </ChipLink>
          {props.canCreateSubdataset ? (
            <ChipLink to={`${props.basePath}/datasets/${root.id}?create=subdataset`} data-testid="vps.storage.root_dataset.create_subdataset">
              {t('vps.storage.root_dataset.create_subdataset')}
            </ChipLink>
          ) : null}
          <ChipLink to={`${props.basePath}/datasets/${root.id}/snapshots`} data-testid="vps.storage.root_dataset.snapshots">
            {t('vps.storage.root_dataset.snapshots')}
          </ChipLink>
          <ChipLink to={`${props.basePath}/datasets/${root.id}/downloads`} data-testid="vps.storage.root_dataset.downloads">
            {t('vps.storage.root_dataset.downloads')}
          </ChipLink>
        </div>

        <div className="mt-3 text-xs text-muted">{t('vps.storage.root_dataset.no_backup_note')}</div>
        {!props.loading && !props.canCreateSubdataset ? (
          <div className="mt-1 text-xs text-muted">{t('vps.storage.root_dataset.create_subdataset_user_note')}</div>
        ) : null}

        {props.canAdmin ? (
          <details className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-xs text-muted" data-testid="vps.storage.root_dataset.system_context">
            <summary className="cursor-pointer font-medium text-fg">{t('vps.storage.root_dataset.system_context.title')}</summary>
            <div className="mt-2">
              {t('vps.storage.root_dataset.related_counts', {
                snapshots: countLabel(root.snapshotCount),
                mounts: countLabel(root.mountCount),
                exports: countLabel(root.exportCount),
              })}
            </div>
            <div className="mt-1">{t('vps.storage.root_dataset.system_context.body')}</div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
