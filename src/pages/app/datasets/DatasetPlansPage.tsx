import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { useChrome } from '../../../components/layout/ChromeContext';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { TableCard } from '../../../components/ui/TableCard';

import {
  assignDatasetPlan,
  deleteDatasetPlan,
  fetchDatasetPlans,
  fetchEnvironmentDatasetPlans,
  type DatasetInPoolPlan,
  type EnvironmentDatasetPlan,
} from '../../../lib/api/datasets';
import { fetchTransactionChains } from '../../../lib/api/transactions';
import { hasActiveChains } from '../../../lib/taskStatus';

import { useDatasetContext } from './DatasetContext';

function refLabel(ref: any, fallback: string): string {
  if (ref && typeof ref === 'object') {
    const label = String(ref.label ?? ref.name ?? ref.description ?? '').trim();
    if (label) return label;
    if (typeof ref.id === 'number') return `#${ref.id}`;
  }
  return fallback;
}

function envPlanIdFromAssigned(plan: DatasetInPoolPlan): number | null {
  const p: any = plan.environment_dataset_plan;
  return typeof p?.id === 'number' ? Number(p.id) : null;
}

function envPlanLabel(plan: DatasetInPoolPlan, t: (k: string) => string): string {
  const p: any = plan.environment_dataset_plan;
  return refLabel(p, t('common.na'));
}

function basePlanLabel(plan: DatasetInPoolPlan, t: (k: string) => string): string {
  const p: any = plan.environment_dataset_plan;
  return refLabel(p?.dataset_plan, t('common.na'));
}

function allowedAdd(mode: 'user' | 'admin', plan: EnvironmentDatasetPlan): boolean {
  return mode === 'admin' || plan.user_add === true;
}

function allowedRemove(mode: 'user' | 'admin', plan: DatasetInPoolPlan): boolean {
  const p: any = plan.environment_dataset_plan;
  return mode === 'admin' || p?.user_remove === true;
}

export function DatasetPlansPage() {
  const {
    dataset,
    refetch,
    datasetRef,
    busyTransaction,
    busyLocalLock,
    chainsLoading,
    chainsError,
    chainsStale,
    refetchChains,
  } = useDatasetContext();
  const { mode } = useAppMode();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const environmentId = typeof (dataset as any).environment?.id === 'number' ? Number((dataset as any).environment.id) : null;
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedEnvPlanId, setSelectedEnvPlanId] = useState('');
  const [removePlan, setRemovePlan] = useState<DatasetInPoolPlan | null>(null);

  const assignedQ = useQuery({
    queryKey: ['datasets', dataset.id, 'plans'],
    queryFn: async () => (await fetchDatasetPlans(dataset.id, { limit: 200 })).data,
    staleTime: 15_000,
  });

  const availableQ = useQuery({
    queryKey: ['environments', environmentId, 'dataset_plans'],
    enabled: environmentId !== null,
    queryFn: async () =>
      (await fetchEnvironmentDatasetPlans(environmentId as number, { limit: 200 })).data,
    staleTime: 15_000,
  });

  const assignedRows = assignedQ.data ?? [];
  const availableRows = availableQ.data ?? [];

  const assignable = useMemo(() => {
    const used = new Set<number>();
    for (const row of assignedRows) {
      const id = envPlanIdFromAssigned(row);
      if (id !== null) used.add(id);
    }
    return availableRows.filter((p) => typeof p.id === 'number' && !used.has(p.id) && allowedAdd(mode, p));
  }, [assignedRows, availableRows, mode]);

  const busy =
    busyTransaction || busyLocalLock || chainsLoading || chainsError !== null || chainsStale;

  async function preflightDatasetNotBusy() {
    const chainsRes = await fetchTransactionChains({
      className: 'Dataset',
      rowId: dataset.id,
      limit: 10,
    });
    if (hasActiveChains(chainsRes.data)) {
      const err: any = new Error(t('toast.action_blocked.body'));
      err.code = 'BUSY';
      throw err;
    }
  }

  const assignM = useMutation({
    mutationFn: async () => {
      await preflightDatasetNotBusy();
      return assignDatasetPlan(dataset.id, {
        environment_dataset_plan: Number(selectedEnvPlanId),
      });
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['datasets', dataset.id, 'plans'] });
      await qc.invalidateQueries({ queryKey: ['datasets', 'show', dataset.id] });
      setAssignOpen(false);
      setSelectedEnvPlanId('');
      pushToast({ variant: 'ok', title: t('dataset.plans.assign.success') });
      refetch();
      refetchChains();
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: t('dataset.plans.assign.error'), body: String(err?.message ?? err ?? '') });
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const removeM = useMutation({
    mutationFn: async (planId: number) => {
      await preflightDatasetNotBusy();
      return deleteDatasetPlan(dataset.id, planId);
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['datasets', dataset.id, 'plans'] });
      await qc.invalidateQueries({ queryKey: ['datasets', 'show', dataset.id] });
      setRemovePlan(null);
      pushToast({ variant: 'ok', title: t('dataset.plans.remove.success') });
      refetch();
      refetchChains();
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: t('dataset.plans.remove.error'), body: String(err?.message ?? err ?? '') });
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  if (assignedQ.isLoading || (environmentId !== null && availableQ.isLoading)) {
    return <LoadingState testId="dataset.plans.loading" />;
  }

  if (assignedQ.isError) {
    return (
      <ErrorState
        testId="dataset.plans.error"
        title={t('dataset.plans.load_error.title')}
        error={assignedQ.error}
        onRetry={() => void assignedQ.refetch()}
        detailsExtra={{ page: 'dataset.plans', datasetId: dataset.id }}
      />
    );
  }

  const canAssignAny = !availableQ.isError && assignable.length > 0;

  return (
    <div className="space-y-4">
      {busy ? (
        <Alert
          variant="warn"
          title={t('dataset.plans.busy.title')}
          description={t('dataset.plans.busy.body')}
          testId="dataset.plans.busy"
        />
      ) : null}

      {environmentId === null ? (
        <Alert
          variant="warn"
          title={t('dataset.plans.environment_missing.title')}
          description={t('dataset.plans.environment_missing.body')}
          testId="dataset.plans.environment_missing"
        />
      ) : null}


      {availableQ.isError ? (
        <Alert
          variant="warn"
          title={t('dataset.plans.available_load_error.title')}
          description={t('dataset.plans.available_load_error.body')}
          testId="dataset.plans.available_load_error"
        />
      ) : null}

      <Card testId="dataset.plans.summary">
        <CardHeader
          title={t('dataset.plans.title')}
          subtitle={t('dataset.plans.subtitle')}
          actions={
            canAssignAny ? (
              <Button testId="dataset.plans.assign.open" onClick={() => setAssignOpen(true)} disabled={busy || environmentId === null}>
                {t('dataset.plans.assign.open')}
              </Button>
            ) : null
          }
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-faint">{t('dataset.plans.assigned_count')}</div>
              <div className="text-lg font-semibold text-fg">{assignedRows.length}</div>
            </div>
            <div>
              <div className="text-xs text-faint">{t('dataset.plans.available_count')}</div>
              <div className="text-lg font-semibold text-fg">{assignable.length}</div>
            </div>
            <div>
              <div className="text-xs text-faint">{t('dataset.plans.environment')}</div>
              <div className="font-medium text-fg">{refLabel((dataset as any).environment, t('common.na'))}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {assignedRows.length === 0 ? (
        <EmptyState
          testId="dataset.plans.empty"
          title={t('dataset.plans.empty.title')}
          body={canAssignAny ? t('dataset.plans.empty.body') : t('dataset.plans.empty.no_available')}
          action={
            canAssignAny ? (
              <Button testId="dataset.plans.empty.assign" onClick={() => setAssignOpen(true)} disabled={busy || environmentId === null}>
                {t('dataset.plans.assign.open')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard testId="dataset.plans.table" minWidth="lg">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.plans.column.label')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.plans.column.source')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint">{t('dataset.plans.column.permissions')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-faint">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {assignedRows.map((row) => {
              const removable = allowedRemove(mode, row);
              const envPlan: any = row.environment_dataset_plan;
              return (
                <tr key={row.id} data-testid={`dataset.plans.row.${row.id}`}>
                  <td className="px-3 py-2 font-medium text-fg">{envPlanLabel(row, t)}</td>
                  <td className="px-3 py-2 text-sm text-muted">{basePlanLabel(row, t)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={envPlan?.user_add ? 'ok' : 'neutral'}>{t(envPlan?.user_add ? 'dataset.plans.permission.user_add' : 'dataset.plans.permission.user_add_off')}</Badge>
                      <Badge variant={envPlan?.user_remove ? 'ok' : 'neutral'}>{t(envPlan?.user_remove ? 'dataset.plans.permission.user_remove' : 'dataset.plans.permission.user_remove_off')}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {removable ? (
                      <Button testId={`dataset.plans.row.${row.id}.remove`} variant="danger" onClick={() => setRemovePlan(row)} disabled={busy}>
                        {t('common.remove')}
                      </Button>
                    ) : (
                      <span className="text-xs text-faint">{t('dataset.plans.remove.not_allowed')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <Modal
        open={assignOpen}
        onClose={() => {
          if (!assignM.isPending) setAssignOpen(false);
        }}
        title={t('dataset.plans.assign.title')}
        size="md"
        testId="dataset.plans.assign.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)} disabled={assignM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              testId="dataset.plans.assign.submit"
              onClick={() => void assignM.mutate()}
              loading={assignM.isPending}
              disabled={!selectedEnvPlanId || busy}
            >
              {t('dataset.plans.assign.submit')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm font-medium text-fg">{t('dataset.plans.assign.field')}</div>
            <Select
              testId="dataset.plans.assign.select"
              value={selectedEnvPlanId}
              onChange={(e) => setSelectedEnvPlanId(e.target.value)}
              aria-label={t('dataset.plans.assign.field')}
            >
              <option value="">{t('dataset.plans.assign.placeholder')}</option>
              {assignable.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {refLabel(plan, `#${plan.id}`)}
                </option>
              ))}
            </Select>
          </div>
          {selectedEnvPlanId ? (() => {
            const selected = assignable.find((p) => String(p.id) === selectedEnvPlanId);
            if (!selected) return null;
            return (
              <Card>
                <CardBody>
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-xs text-faint">{t('dataset.plans.column.label')}</div>
                      <div className="font-medium text-fg">{refLabel(selected, t('common.na'))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-faint">{t('dataset.plans.column.source')}</div>
                      <div className="font-medium text-fg">{refLabel((selected as any).dataset_plan, t('common.na'))}</div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })() : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={removePlan !== null}
        onCancel={() => setRemovePlan(null)}
        onConfirm={() => removePlan && void removeM.mutate(removePlan.id)}
        confirmLoading={removeM.isPending}
        danger
        title={t('dataset.plans.remove.title')}
        description={removePlan ? t('dataset.plans.remove.body', { label: envPlanLabel(removePlan, t) }) : ''}
        testId="dataset.plans.remove.confirm"
      />
    </div>
  );
}
