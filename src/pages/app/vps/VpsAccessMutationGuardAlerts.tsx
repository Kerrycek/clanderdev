import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import type { GateDecision } from '../../../lib/gates/types';

type VpsAccessMutationGuardAlertsProps = {
  canMutateVps: boolean;
  gate: GateDecision;
  onOpenTasks: () => void;
};

export function VpsAccessMutationGuardAlerts({ canMutateVps, gate, onOpenTasks }: VpsAccessMutationGuardAlertsProps) {
  const { t } = useI18n();

  if (!canMutateVps) {
    return (
      <div data-testid="vps.access.read_only">
        <Alert variant="warn" title={t('gate.blocked.permission.title')}>
          {t('gate.blocked.permission.body')}
        </Alert>
      </div>
    );
  }

  if (gate.allowed) return null;

  return (
    <Alert variant="warn" title={t(gate.reason.titleKey)}>
      {gate.reason.descriptionKey ? <p>{t(gate.reason.descriptionKey)}</p> : null}
      <Button variant="secondary" onClick={onOpenTasks}>
        {t('common.open_tasks')}
      </Button>
    </Alert>
  );
}
