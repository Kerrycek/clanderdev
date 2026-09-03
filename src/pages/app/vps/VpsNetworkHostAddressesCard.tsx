import React from 'react';

import { useI18n } from '../../../app/i18n';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import type { HostIpAddress } from '../../../lib/api/networking';
import type { GateDecision } from '../../../lib/gates/types';
import { hostAddr, hostAssigned, hostPtrState, hostPtrValue, hostRouteLabel } from './VpsNetworkModel';

export function VpsNetworkHostAddressesCard(props: {
  canMutate: boolean;
  gate: GateDecision;
  isLoading: boolean;
  errorMessage: string | null;
  actionErrorMessage: string | null;
  rows: HostIpAddress[];
  updatePtrPending: boolean;
  assignHostPending: boolean;
  freeHostPending: boolean;
  deleteHostPending: boolean;
  onRefresh: () => void;
  onEditPtr: (row: HostIpAddress) => void;
  onAssign: (row: HostIpAddress) => void;
  onFree: (row: HostIpAddress) => void;
  onDelete: (row: HostIpAddress) => void;
}) {
  const { t } = useI18n();
  const gate = props.gate;
  const assignedRows = props.rows.filter(hostAssigned);
  const availableRows = props.rows.filter((row) => !hostAssigned(row));

  return (
    <Card testId="vps.network.host_addresses">
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">2</span>
            <span>{t('vps.network.ptr.title')}</span>
          </div>
        }
        subtitle={t('vps.network.ptr.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={props.onRefresh}>
            {t('common.refresh')}
          </Button>
        }
      />

      <CardBody className="space-y-4">
        <div className="rounded-lg border border-info-border bg-info-bg p-3 text-sm text-muted">
          {t('vps.network.ptr.explanation')}
        </div>

        {props.isLoading ? (
          <div className="py-2">
            <Spinner label={t('common.loading')} />
          </div>
        ) : props.errorMessage ? (
          <Alert title={t('vps.network.host_addresses.load_error')} variant="danger">
            {props.errorMessage}
          </Alert>
        ) : (
          <>
            {assignedRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                {t('vps.network.ptr.empty_assigned')}
              </div>
            ) : (
              <div className="space-y-2">
                {assignedRows.map((row) => {
                  const id = Number(row.id);
                  const ptrState = hostPtrState(row);

                  return (
                    <div
                      key={id}
                      data-testid={`vps.network.host_addresses.row.${id}`}
                      className="rounded-lg border border-border bg-surface-2 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold">{hostAddr(row)}</span>
                            <Badge variant="ok">{t('vps.network.ptr.on_interface')}</Badge>
                            {!gate.allowed ? <Badge variant="warn">{t('vps.network.state.busy')}</Badge> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span>{t('vps.network.host_addresses.field.route')}: <span className="font-mono">{hostRouteLabel(row)}</span></span>
                            <span>
                              {t('vps.network.host_addresses.field.ptr')}: {' '}
                              <span className={ptrState === 'set' ? 'font-medium text-fg' : 'text-faint'}>{hostPtrValue(row)}</span>
                            </span>
                          </div>
                        </div>

                        {props.canMutate ? <div className="flex flex-wrap justify-end gap-2">
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            testId={`vps.network.host_addresses.row.${id}.ptr`}
                            disabled={!gate.allowed}
                            disabledReason={!gate.allowed ? gate.reason : undefined}
                            loading={props.updatePtrPending}
                            onClick={() => props.onEditPtr(row)}
                          >
                            {ptrState === 'set' ? t('vps.network.host_addresses.action.ptr_edit') : t('vps.network.host_addresses.action.ptr_add')}
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            size="sm"
                            testId={`vps.network.host_addresses.row.${id}.free`}
                            disabled={!gate.allowed}
                            disabledReason={!gate.allowed ? gate.reason : undefined}
                            loading={props.freeHostPending}
                            onClick={() => props.onFree(row)}
                          >
                            {t('vps.network.host_addresses.action.free')}
                          </ActionButton>
                        </div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {availableRows.length > 0 ? (
              <div className="rounded-lg border border-accent/40 bg-accent/5 p-3" data-testid="vps.network.host_addresses.available">
                <div className="font-semibold">{t('vps.network.ptr.available.title')}</div>
                <div className="mt-0.5 text-sm text-muted">{t('vps.network.ptr.available.subtitle')}</div>
                <div className="mt-3 space-y-2">
                  {availableRows.map((row) => {
                    const id = Number(row.id);
                    const canDelete = row.user_created === true;
                    const ptrState = hostPtrState(row);

                    return (
                      <div key={id} data-testid={`vps.network.host_addresses.row.${id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-2">
                        <div>
                          <div className="font-mono text-sm font-medium">{hostAddr(row)}</div>
                          <div className="mt-0.5 text-xs text-muted">
                            {t('vps.network.host_addresses.field.route')}: <span className="font-mono">{hostRouteLabel(row)}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            {t('vps.network.host_addresses.field.ptr')}: <span className={ptrState === 'set' ? 'text-fg' : 'text-faint'}>{hostPtrValue(row)}</span>
                          </div>
                        </div>
                        {props.canMutate ? <div className="flex flex-wrap gap-2">
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            testId={`vps.network.host_addresses.row.${id}.ptr`}
                            disabled={!gate.allowed}
                            disabledReason={!gate.allowed ? gate.reason : undefined}
                            loading={props.updatePtrPending}
                            onClick={() => props.onEditPtr(row)}
                          >
                            {ptrState === 'set' ? t('vps.network.host_addresses.action.ptr_edit') : t('vps.network.host_addresses.action.ptr_add')}
                          </ActionButton>
                          <ActionButton
                            variant="primary"
                            size="sm"
                            testId={`vps.network.host_addresses.row.${id}.assign`}
                            disabled={!gate.allowed}
                            disabledReason={!gate.allowed ? gate.reason : undefined}
                            loading={props.assignHostPending}
                            onClick={() => props.onAssign(row)}
                          >
                            {t('vps.network.host_addresses.action.assign')}
                          </ActionButton>
                          {canDelete ? (
                            <ActionButton
                              variant="danger"
                              size="sm"
                              testId={`vps.network.host_addresses.row.${id}.delete`}
                              disabled={!gate.allowed}
                              disabledReason={!gate.allowed ? gate.reason : undefined}
                              loading={props.deleteHostPending}
                              onClick={() => props.onDelete(row)}
                            >
                              {t('common.delete')}
                            </ActionButton>
                          ) : null}
                        </div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}

        {props.actionErrorMessage ? (
          <Alert title={t('vps.network.host_addresses.action_error')} variant="danger">
            {props.actionErrorMessage}
          </Alert>
        ) : null}
      </CardBody>
    </Card>
  );
}
