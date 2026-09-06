import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Input } from '../../../../components/ui/Input';
import { isAmbiguousMutationError } from '../../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../../lib/errors';

export type MaintenanceState = 'no' | 'lock' | 'master_lock';
export type MaintenanceChange = { lock: boolean; reason?: string };
export type MaintenanceReadback = { value: unknown; reason?: unknown };
export type MaintenanceReconciliation = 'applied' | 'not_applied' | 'unknown';

type MaintenanceAttempt = MaintenanceChange & {
  previousState: MaintenanceState;
  previousReason?: string;
};

export function canManageClusterMaintenance(role: string): boolean {
  return role === 'admin';
}

export function parseMaintenanceState(value: unknown): MaintenanceState {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'lock') return 'lock';
  if (normalized === 'master_lock') return 'master_lock';
  return 'no';
}

function knownMaintenanceState(value: unknown): MaintenanceState | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'no' || normalized === 'lock' || normalized === 'master_lock') return normalized;
  return null;
}

function maintenanceReason(value: unknown): string | null {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : null;
}

export function reconcileMaintenanceAttempt(
  attempt: MaintenanceAttempt,
  readback: MaintenanceReadback,
): MaintenanceReconciliation {
  if ((attempt.lock && attempt.previousState !== 'no') || (!attempt.lock && attempt.previousState !== 'lock')) {
    return 'unknown';
  }
  const state = knownMaintenanceState(readback.value);
  const reason = maintenanceReason(readback.reason);
  if (state === null || reason === null) return 'unknown';

  if (attempt.lock) {
    if (state === 'no') return 'not_applied';
    if (state === 'lock' && reason === maintenanceReason(attempt.reason)) return 'applied';
    return 'unknown';
  }

  if (state === 'no' || state === 'master_lock') return 'applied';
  return reason === maintenanceReason(attempt.previousReason) ? 'not_applied' : 'unknown';
}

export function MaintenanceControl(props: {
  value: unknown;
  reason?: string;
  label: string;
  testId: string;
  setMaintenance: (opts: MaintenanceChange) => Promise<unknown>;
  onChanged: () => Promise<unknown> | void;
  /** Exact resource read-back used to settle an ambiguous POST without retrying it. */
  readMaintenance?: () => Promise<MaintenanceReadback>;
  /** Persisted by the owning screen so an unknown outcome remains blocked across remounts. */
  verificationBlocked?: boolean;
  /** Persisted disable-only guard for an operation that is still settling. */
  settlingBlocked?: boolean;
  onVerificationRequired?: () => void;
  onSettlingChange?: (settling: boolean) => void;
}) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const state = parseMaintenanceState(props.value);
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);
  const [reason, setReason] = useState('');
  const [settling, setSettling] = useState(false);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const submitRef = useRef(false);
  const verificationBlocked = retryBlocked || props.verificationBlocked === true;
  useEffect(() => {
    if (props.verificationBlocked === false) {
      setRetryBlocked(false);
      submitRef.current = false;
    }
  }, [props.verificationBlocked]);
  const mutation = useMutation({
    mutationFn: (change: MaintenanceChange) => props.setMaintenance(change),
    retry: false,
  });

  const pushSuccess = (attempt: MaintenanceAttempt) => {
    pushToast({
      variant: 'ok',
      title: t(
        attempt.lock
          ? 'admin.cluster.maintenance.toast.locked'
          : 'admin.cluster.maintenance.toast.unlocked',
        { resource: props.label },
      ),
    });
  };

  const pushDefinitiveError = (error: unknown) => {
    pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(error) });
  };

  const blockUnverifiedRetry = (error: unknown) => {
    setRetryBlocked(true);
    props.onVerificationRequired?.();
    pushToast({
      variant: 'danger',
      title: t('admin.cluster.maintenance.toast.unverified.title', { resource: props.label }),
      body: `${t('admin.cluster.maintenance.toast.unverified.body')} (${formatErrorMessage(error)})`,
      autoDismissMs: false,
    });
  };

  const settleFromReadback = async (
    attempt: MaintenanceAttempt,
    error: unknown,
    mutationWasAccepted: boolean,
  ): Promise<'applied' | 'retryable' | 'blocked'> => {
    if (!props.readMaintenance) {
      blockUnverifiedRetry(error);
      return 'blocked';
    }

    try {
      const outcome = reconcileMaintenanceAttempt(attempt, await props.readMaintenance());
      if (outcome === 'applied') {
        setDialog(null);
        setReason('');
        pushSuccess(attempt);
        return 'applied';
      }
      if (outcome === 'not_applied' && !mutationWasAccepted) {
        pushDefinitiveError(error);
        return 'retryable';
      }
      blockUnverifiedRetry(error);
      return 'blocked';
    } catch (readbackError) {
      blockUnverifiedRetry(readbackError);
      return 'blocked';
    }
  };

  const confirmMaintenance = async () => {
    if (
      dialog === null
      || submitRef.current
      || settling
      || verificationBlocked
      || props.settlingBlocked
    ) return;

    const attempt: MaintenanceAttempt = {
      lock: dialog === 'lock',
      reason: dialog === 'lock' ? reason.trim() || undefined : undefined,
      previousState: state,
      previousReason: props.reason,
    };
    submitRef.current = true;
    setSettling(true);
    props.onSettlingChange?.(true);
    let keepBlocked = false;

    try {
      try {
        await mutation.mutateAsync({ lock: attempt.lock, reason: attempt.reason });
      } catch (error) {
        if (isAmbiguousMutationError(error)) {
          keepBlocked = (await settleFromReadback(attempt, error, false)) === 'blocked';
        } else {
          pushDefinitiveError(error);
        }
        return;
      }

      // The mutation was accepted. Hide the stale dialog immediately, but keep
      // the old-state trigger disabled until the authoritative list refetch ends.
      setDialog(null);
      setReason('');
      try {
        await props.onChanged();
        pushSuccess(attempt);
      } catch (error) {
        keepBlocked = (await settleFromReadback(attempt, error, true)) === 'blocked';
      }
    } finally {
      setSettling(false);
      if (!keepBlocked) {
        submitRef.current = false;
        props.onSettlingChange?.(false);
      }
    }
  };

  const controlsDisabled = settling || mutation.isPending || verificationBlocked || props.settlingBlocked;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid={props.testId}>
      <Badge variant={state === 'no' ? 'ok' : 'warn'}>
        {t(`admin.cluster.maintenance.state.${state}`)}
      </Badge>
      {verificationBlocked ? (
        <span className="text-xs text-danger" data-testid={`${props.testId}.verification_required`}>
          {t('admin.cluster.maintenance.state.verification_required')}
        </span>
      ) : null}
      {state === 'no' ? (
        <Button size="sm" variant="secondary" disabled={controlsDisabled} onClick={() => setDialog('lock')} testId={`${props.testId}.lock`}>
          {t('admin.cluster.maintenance.action.lock')}
        </Button>
      ) : state === 'lock' ? (
        <Button size="sm" variant="secondary" disabled={controlsDisabled} onClick={() => setDialog('unlock')} testId={`${props.testId}.unlock`}>
          {t('admin.cluster.maintenance.action.unlock')}
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === 'lock'}
        onCancel={() => !settling && setDialog(null)}
        onConfirm={() => void confirmMaintenance()}
        title={t('admin.cluster.maintenance.dialog.lock.title', { resource: props.label })}
        description={t('admin.cluster.maintenance.dialog.lock.body')}
        confirmLabel={t('admin.cluster.maintenance.action.lock')}
        confirmLoading={settling || mutation.isPending}
        confirmDisabled={verificationBlocked || props.settlingBlocked}
        testId={`${props.testId}.lock_dialog`}
      >
        <Input
          label={t('admin.cluster.maintenance.reason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          testId={`${props.testId}.reason`}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'unlock'}
        onCancel={() => !settling && setDialog(null)}
        onConfirm={() => void confirmMaintenance()}
        title={t('admin.cluster.maintenance.dialog.unlock.title', { resource: props.label })}
        description={props.reason || t('admin.cluster.maintenance.dialog.unlock.body')}
        confirmLabel={t('admin.cluster.maintenance.action.unlock')}
        confirmLoading={settling || mutation.isPending}
        confirmDisabled={verificationBlocked || props.settlingBlocked}
        testId={`${props.testId}.unlock_dialog`}
      />
    </div>
  );
}
