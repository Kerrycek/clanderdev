import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Input } from '../../../../components/ui/Input';
import { formatErrorMessage } from '../../../../lib/errors';

export type MaintenanceState = 'no' | 'lock' | 'master_lock';

export function parseMaintenanceState(value: unknown): MaintenanceState {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'lock') return 'lock';
  if (normalized === 'master_lock') return 'master_lock';
  return 'no';
}

export function MaintenanceControl(props: {
  value: unknown;
  reason?: string;
  label: string;
  testId: string;
  setMaintenance: (opts: { lock: boolean; reason?: string }) => Promise<unknown>;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const state = parseMaintenanceState(props.value);
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => props.setMaintenance({ lock: dialog === 'lock', reason: dialog === 'lock' ? reason.trim() : undefined }),
    onSuccess: async () => {
      const action = dialog;
      setDialog(null);
      setReason('');
      await props.onChanged();
      pushToast({ variant: 'ok', title: t(action === 'lock' ? 'admin.cluster.maintenance.toast.locked' : 'admin.cluster.maintenance.toast.unlocked', { resource: props.label }) });
    },
    onError: (error) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(error) }),
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid={props.testId}>
      <Badge variant={state === 'no' ? 'ok' : 'warn'}>
        {t(`admin.cluster.maintenance.state.${state}`)}
      </Badge>
      {state === 'no' ? (
        <Button size="sm" variant="secondary" onClick={() => setDialog('lock')} testId={`${props.testId}.lock`}>
          {t('admin.cluster.maintenance.action.lock')}
        </Button>
      ) : state === 'lock' ? (
        <Button size="sm" variant="secondary" onClick={() => setDialog('unlock')} testId={`${props.testId}.unlock`}>
          {t('admin.cluster.maintenance.action.unlock')}
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === 'lock'}
        onCancel={() => !mutation.isPending && setDialog(null)}
        onConfirm={() => mutation.mutate()}
        title={t('admin.cluster.maintenance.dialog.lock.title', { resource: props.label })}
        description={t('admin.cluster.maintenance.dialog.lock.body')}
        confirmLabel={t('admin.cluster.maintenance.action.lock')}
        confirmLoading={mutation.isPending}
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
        onCancel={() => !mutation.isPending && setDialog(null)}
        onConfirm={() => mutation.mutate()}
        title={t('admin.cluster.maintenance.dialog.unlock.title', { resource: props.label })}
        description={props.reason || t('admin.cluster.maintenance.dialog.unlock.body')}
        confirmLabel={t('admin.cluster.maintenance.action.unlock')}
        confirmLoading={mutation.isPending}
        testId={`${props.testId}.unlock_dialog`}
      />
    </div>
  );
}
