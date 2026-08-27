import React from 'react';

import { useI18n } from '../../../app/i18n';
import { SummaryGrid } from '../../../components/layout/SummaryGrid';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { StatCard } from '../../../components/ui/StatCard';
import type { GateDecision } from '../../../lib/gates/types';
import { formatMiB } from '../../../lib/format';
import type { RootDatasetSummary, StorageOverviewSummary } from './VpsStorageModel';

function percentLabel(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export function VpsStorageOverviewCard(props: {
  canMutate: boolean;
  gate: GateDecision;
  root: RootDatasetSummary;
  summary: StorageOverviewSummary;
  onAddMount: () => void;
  onOpenTasks: () => void;
}) {
  const { t } = useI18n();
  const gate = props.gate;
  const rootLimit = props.root.referenceQuota ?? props.root.quota;

  return (
    <Card testId="vps.storage.summary">
      <CardHeader
        title={t('vps.storage.title')}
        subtitle={t('vps.storage.subtitle')}
        actions={props.canMutate ? (
          <ActionButton
            testId="vps.storage.mounts.add"
            variant="primary"
            size="sm"
            disabled={!gate.allowed}
            disabledReason={!gate.allowed ? gate.reason : undefined}
            onClick={props.onAddMount}
          >
            {t('vps.storage.add_mount')}
          </ActionButton>
        ) : null}
      />
      <CardBody className="space-y-4">
        {props.canMutate && !gate.allowed ? (
          <Alert title={t(gate.reason.titleKey)} variant="warn">
            <div className="space-y-2">
              {gate.reason.descriptionKey ? <div>{t(gate.reason.descriptionKey)}</div> : null}
              <div>
                <Button variant="secondary" size="sm" onClick={props.onOpenTasks}>
                  {t('common.open_tasks')}
                </Button>
              </div>
            </div>
          </Alert>
        ) : null}

        <SummaryGrid testId="vps.storage.summary.grid">
          <StatCard
            testId="vps.storage.summary.root"
            className="md:col-span-3"
            variant="compact"
            title={t('vps.storage.overview.root.title')}
            value={props.root.label}
            subtitle={props.root.state ?? t('common.na')}
          />
          <StatCard
            testId="vps.storage.summary.capacity"
            className="md:col-span-3"
            variant="compact"
            title={t('vps.storage.overview.capacity.title')}
            value={percentLabel(props.root.capacityPercent)}
            subtitle={t('vps.storage.overview.capacity.subtitle', {
              used: formatMiB(props.root.used),
              limit: rootLimit !== null ? formatMiB(rootLimit) : t('vps.storage.capacity.unlimited'),
            })}
          />
          <StatCard
            testId="vps.storage.summary.mounts"
            className="md:col-span-3"
            variant="compact"
            title={t('vps.storage.overview.mounts.title')}
            value={props.summary.mountCount}
            subtitle={t('vps.storage.overview.mounts.subtitle', {
              enabled: props.summary.enabledMountCount,
              disabled: props.summary.disabledMountCount,
            })}
          />
          <StatCard
            testId="vps.storage.summary.access"
            className="md:col-span-3"
            variant="compact"
            title={t('vps.storage.overview.access.title')}
            value={t('vps.storage.overview.access.value', { rw: props.summary.writableMountCount, ro: props.summary.readOnlyMountCount })}
            subtitle={
              props.summary.failedMountCount > 0
                ? t('vps.storage.overview.access.failed', { n: props.summary.failedMountCount })
                : t('vps.storage.overview.access.ok')
            }
          />
        </SummaryGrid>

        <div className="rounded-md border border-info-border bg-info-bg p-3 text-sm text-info" data-testid="vps.storage.no_backup_cta_note">
          {t('vps.storage.overview.no_backup_cta')}
        </div>
      </CardBody>
    </Card>
  );
}
