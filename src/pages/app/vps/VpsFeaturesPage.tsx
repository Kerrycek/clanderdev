import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Spinner } from '../../../components/ui/Spinner';
import { fetchVpsFeatures, updateVpsFeaturesAll, type VpsFeature } from '../../../lib/api/vpsFeatures';
import { getMetaActionStateId, isMissingActionStateError } from '../../../lib/api/haveapi';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { objectRef } from '../../../lib/objectRef';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import { freezeVpsMutationSnapshot, type VpsMutationSnapshot } from './VpsMutationSnapshot';

function featureLabel(f: VpsFeature): string {
  return (f.label as any) ?? f.name;
}

function mapFeatures(list: VpsFeature[] | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of list ?? []) {
    if (!f?.name) continue;
    if (typeof f.enabled !== 'boolean') continue;
    out[String(f.name)] = f.enabled;
  }
  return out;
}

function equalBoolMaps(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function VpsFeaturesPage() {
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();

  const { vps, canMutateVps, busyTransaction, busyLocalLock } = useVps();
  const vpsId = vps.id;
  const objectLabel = String((vps as any).hostname ?? '') || `#${vpsId}`;

  const q = useQuery({
    queryKey: ['vps_feature', 'list', { vpsId }],
    queryFn: async () => (await fetchVpsFeatures(vpsId)).data,
    refetchOnWindowFocus: false,
  });

  const baseline = useMemo(() => mapFeatures(q.data), [q.data]);
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const effective = draft ?? baseline;

  // Initialize draft from baseline on first load (or when switching VPS).
  useEffect(() => {
    setDraft(null);
  }, [vpsId]);

  useEffect(() => {
    if (!q.data) return;
    if (draft !== null) return;
    setDraft(baseline);
  }, [baseline, draft, q.data]);

  const dirty = draft !== null && !equalBoolMaps(effective, baseline);
  const dirtyCount = useMemo(() => {
    if (!dirty) return 0;
    const keys = new Set<string>([...Object.keys(effective), ...Object.keys(baseline)]);
    let n = 0;
    for (const k of keys) if (effective[k] !== baseline[k]) n += 1;
    return n;
  }, [baseline, dirty, effective]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const m = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { features: Record<string, boolean> }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return updateVpsFeaturesAll(variables.vpsId, variables.features);
    },
    onMutate: async (variables) => {
      const lockRef = objectRef('Vps', variables.vpsId);
      const mutationGeneration = await chrome.acquireLocalLock(lockRef, { durable: true });
      return { lockRef, mutationGeneration };
    },
    onSuccess: (r, variables, context) => {
      setConfirmOpen(false);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['vps_feature', 'list', { vpsId: variables.vpsId }] });

      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.features.apply.label',
          objectLabel: variables.objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
        });
      }

      void qc.invalidateQueries({ queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: variables.vpsId }] });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: (_data, error, _variables, context) => {
      if (context) chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration);
    },
  });

  const busyLocal = busyLocalLock || m.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });

  const list = q.data ?? [];

  return (
    <div data-testid="vps.features.page" className="space-y-4">
      <Card testId="vps.features.card">
        <CardHeader
          title={t('vps.features.title')}
          subtitle={t('vps.features.subtitle_basic')}
          actions={canMutateVps ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                testId="vps.features.reset"
                variant="secondary"
                size="sm"
                disabled={!dirty || m.isPending}
                onClick={() => setDraft(null)}
              >
                {t('common.reset')}
              </Button>
              <ActionButton
                testId="vps.features.save"
                size="sm"
                disabled={!dirty || !gate.allowed}
                disabledReason={!gate.allowed ? gate.reason : undefined}
                loading={m.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {dirty ? t('vps.features.save_changes', { n: dirtyCount }) : t('vps.features.save_changes_empty')}
              </ActionButton>
            </div>
          ) : null}
        />

        <CardBody>
          {!canMutateVps ? (
            <Alert title={t('gate.blocked.permission.title')} variant="warn" className="mb-4">
              <div data-testid="vps.features.read_only">{t('gate.blocked.permission.body')}</div>
            </Alert>
          ) : null}

          {canMutateVps && !gate.allowed ? (
            <Alert title={t(gate.reason.titleKey)} variant="warn">
              <div className="space-y-2">
                {gate.reason.descriptionKey ? <div>{t(gate.reason.descriptionKey)}</div> : null}
                <div>
                  <Button variant="secondary" size="sm" onClick={chrome.openTasks}>
                    {t('common.open_tasks')}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}

          {q.isLoading ? (
            <div className={!gate.allowed ? 'mt-4' : ''}>
              <Spinner label={t('common.loading')} />
            </div>
          ) : q.error ? (
            <Alert title={t('vps.features.load_error')} variant="danger" className={!gate.allowed ? 'mt-4' : ''}>
              {String((q.error as any)?.message ?? q.error)}
            </Alert>
          ) : list.length === 0 ? (
            <div className={!gate.allowed ? 'mt-4' : ''}>
              <div className="text-sm text-muted">{t('vps.features.empty')}</div>
            </div>
          ) : (
            <div className={"mt-3 grid gap-2 sm:grid-cols-2"}>
              {list.map((f) => {
                const name = String(f.name ?? '');
                const enabled = Boolean(effective[name]);
                return canMutateVps ? (
                  <Checkbox
                    key={f.id}
                    testId={`vps.features.item.${f.id}`}
                    checked={enabled}
                    disabled={m.isPending || !gate.allowed}
                    onChange={(checked) => {
                      setDraft((prev) => ({ ...(prev ?? baseline), [name]: checked }));
                    }}
                    label={featureLabel(f)}
                    description={name}
                  />
                ) : (
                  <div
                    key={f.id}
                    data-testid={`vps.features.item.${f.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-fg">{featureLabel(f)}</div>
                      <div className="text-xs text-muted">{name}</div>
                    </div>
                    <span className="text-xs font-medium text-muted">
                      {enabled ? t('common.enabled') : t('common.disabled')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {dirty ? <div className="mt-3 text-xs text-muted">{t('vps.features.unsaved', { n: dirtyCount })}</div> : null}
          {m.error ? (
            <Alert title={t('vps.features.apply_error')} variant="danger" className="mt-3">
              {isMissingActionStateError(m.error)
                ? t('vps.mutation.error.missing_action_state')
                : m.error instanceof Error
                  ? m.error.message
                  : String(m.error)}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {canMutateVps ? <ConfirmDialog
        testId="vps.features.confirm"
        open={confirmOpen}
        title={t('vps.features.confirm.title')}
        description={t('vps.features.confirm.desc_basic')}
        confirmLabel={t('vps.features.confirm.apply')}
        confirmLoading={m.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => m.mutate(freezeVpsMutationSnapshot({
          vpsId, features: Object.freeze({ ...effective }), canMutate: canMutateVps,
          knownBusy: busyTransaction || busyLocalLock, objectLabel,
        }))}
      >
        {dirty ? (
          <div className="text-xs text-muted">
            {t('vps.features.confirm.summary', { n: dirtyCount })}
          </div>
        ) : null}
      </ConfirmDialog> : null}
    </div>
  );
}
