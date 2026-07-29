import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { clsx } from '../../../components/ui/clsx';
import type { VpsAccessChecklistItem, VpsAccessChecklistState } from './VpsAccessModel';

function translate(t: (key: string, vars?: Record<string, unknown>) => string, key: string, values?: Record<string, string | number>): string {
  return values ? t(key, values) : t(key);
}

function checklistStateClass(state: VpsAccessChecklistState): string {
  if (state === 'ready') return 'border-ok-border bg-ok-bg';
  if (state === 'attention') return 'border-warn-border bg-warn-bg';
  if (state === 'blocked') return 'border-danger-border bg-danger-bg';
  if (state === 'fallback') return 'border-info-border bg-info-bg';
  return 'border-border bg-surface';
}

function checklistStateLabelKey(state: VpsAccessChecklistState): string {
  if (state === 'ready') return 'vps.access.checklist.state.ready';
  if (state === 'attention') return 'vps.access.checklist.state.attention';
  if (state === 'blocked') return 'vps.access.checklist.state.blocked';
  if (state === 'fallback') return 'vps.access.checklist.state.fallback';
  return 'vps.access.checklist.state.pending';
}


export function VpsAccessStatusCard(props: {
  objectLabel: string;
  osTemplateLabel: string;
  ownerLabel: string;
  runningLabel: string;
  passwordTypeLabel: string;
}) {
  const { t } = useI18n();
  const items = [
    { label: t('vps.access.status.hostname'), value: props.objectLabel },
    { label: t('vps.access.status.os_template'), value: props.osTemplateLabel },
    { label: t('vps.access.status.owner'), value: props.ownerLabel },
    { label: t('vps.access.status.running'), value: props.runningLabel },
    { label: t('vps.access.status.password_type'), value: props.passwordTypeLabel },
  ];

  return (
    <Card>
      <CardHeader title={t('vps.access.title')} subtitle={t('vps.access.subtitle')} />
      <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface p-3">
            <div className="text-xs text-muted">{item.label}</div>
            <div className="mt-1 text-sm font-medium text-fg">{item.value}</div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function VpsAccessChecklistCard(props: { items: VpsAccessChecklistItem[] }) {
  const { t } = useI18n();

  return (
    <Card testId="vps.access.checklist">
      <CardHeader title={t('vps.access.checklist.title')} subtitle={t('vps.access.checklist.subtitle')} />
      <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {props.items.map((item) => (
          <div key={item.id} className={clsx('rounded-lg border p-3', checklistStateClass(item.state))} data-testid={`vps.access.checklist.${item.id}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 font-medium text-fg">{t(item.titleKey, item.values)}</div>
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted">{t(checklistStateLabelKey(item.state))}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{translate(t, item.descriptionKey, item.values)}</p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
