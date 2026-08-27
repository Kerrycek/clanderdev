import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../app/auth';
import { useAppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';
import { useToasts } from '../../app/toasts';
import { useChrome } from '../layout/ChromeContext';

import { updateUser } from '../../lib/api/users';
import { updateVps } from '../../lib/api/vps';
import { getMetaActionStateId } from '../../lib/api/haveapi';
import { fetchUserStateLogs, fetchVpsStateLogs } from '../../lib/api/lifetimes';
import {
  adminDateTimeInputToIso,
  isoToAdminDateTimeInput,
} from '../../lib/datetimeLocal';
import { formatErrorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { objectRef } from '../../lib/objectRef';
import { objectStateBadge } from '../../lib/taskStatus';

import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { TableCard } from '../ui/TableCard';
import { Textarea } from '../ui/Textarea';
import {
  type LifetimeKind,
  normalizeStateLogValue,
  type SnoozePreset,
  snoozeIso,
  softDeleteExpirationInput,
  stateHelpKey,
} from './lifecycleSemantics';

export function LifecyclePanel(props: {
  kind: LifetimeKind;
  id: number;
  objectLabel: string;
  objectState?: string | null;
  expirationDate?: string | null;
  remindAfterDate?: string | null;
  /** Called after successful updates to refresh surrounding page data */
  onUpdated?: () => void;
  /** Optional test id prefix */
  testId?: string;
}) {
  const { t } = useI18n();
  const auth = useAuth();
  const { mode } = useAppMode();
  const toasts = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const isAdminView = mode === 'admin';
  const canAdministerLifetime = isAdminView && auth.role === 'admin';
  const canUseSelfServiceLifetime = !isAdminView;
  const st = String(props.objectState ?? '').trim() || 'unknown';

  const lifetimeObjectRef = useMemo(() => objectRef(props.kind === 'vps' ? 'Vps' : 'User', props.id), [props.id, props.kind]);

  const stBadge = objectStateBadge(st, t);
  const helpKey = stateHelpKey(st);

  const expIso = props.expirationDate ?? null;
  const remindIso = props.remindAfterDate ?? null;

  // ----------------------
  // User: Snooze reminders
  // ----------------------

  const userCanSnooze = canUseSelfServiceLifetime && props.kind === 'vps' && Boolean(expIso) && st === 'active';

  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozePreset, setSnoozePreset] = useState<SnoozePreset>('1w');
  const [snoozeCustom, setSnoozeCustom] = useState('');

  const snooze = useMemo(() => snoozeIso(snoozePreset, snoozeCustom), [snoozeCustom, snoozePreset]);

  const snoozeMut = useMutation({
    mutationFn: async () => {
      if (props.kind !== 'vps') throw new Error('Snooze is only supported for VPS');
      if (!snooze.valid || !snooze.iso) throw new Error('Invalid remind-after date');
      return await updateVps(props.id, { remind_after_date: snooze.iso });
    },
    onMutate: () => {
      chrome.acquireLocalLock(lifetimeObjectRef);
    },
    onSuccess: (res) => {
      setSnoozeOpen(false);
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.lifecycle.label',
          objectLabel: props.objectLabel,
          object: objectRef('Vps', props.id),
        });
      }
      toasts.pushToast({
        variant: 'ok',
        title: t('lifetimes.snooze.success.title'),
        body: t('lifetimes.snooze.success.body'),
      });
      props.onUpdated?.();
      void qc.invalidateQueries({ queryKey: ['vps', 'show', { id: props.id }] });
    },
    onError: (err) => {
      toasts.pushToast({
        variant: 'danger',
        title: t('lifetimes.snooze.error.title'),
        body: formatErrorMessage(err),
        autoDismissMs: false,
      });
    },
    onSettled: () => {
      chrome.releaseLocalLock(lifetimeObjectRef);
    },
  });

  // ----------------------
  // Admin: State/expiration editor
  // ----------------------

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminState, setAdminState] = useState(st === 'unknown' ? 'active' : st);
  const [adminExpirationLocal, setAdminExpirationLocal] = useState(isoToAdminDateTimeInput(expIso));
  const [adminRemindLocal, setAdminRemindLocal] = useState(isoToAdminDateTimeInput(remindIso));
  const [adminReason, setAdminReason] = useState('');

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const expParsed = useMemo(() => adminDateTimeInputToIso(adminExpirationLocal), [adminExpirationLocal]);
  const remindParsed = useMemo(() => adminDateTimeInputToIso(adminRemindLocal), [adminRemindLocal]);

  const adminPayload = useMemo(() => {
    if (!canAdministerLifetime) return null;

    const payload: Record<string, unknown> = {};

    const nextState = String(adminState || '').trim();
    const curState = st;
    const stateChanging = nextState && nextState !== 'unknown' && nextState !== curState;

    // State change: always submit the expiration field from the form to avoid unintended defaults
    // (the backend may compute a default expiration when none is supplied).
    if (stateChanging) {
      payload['object_state'] = nextState;

      if (expParsed.valid) {
        payload['expiration_date'] = expParsed.iso; // string | null

        // When an explicit expiration is provided (not blank), also submit remind-after from the form.
        // This keeps remind-after stable across state changes unless the admin edits it.
        if (expParsed.iso !== null && remindParsed.valid) {
          payload['remind_after_date'] = remindParsed.iso; // string | null
        }
      }
    } else {
      // Expiration: send only when changed
      const nextExp = expParsed.valid ? expParsed.iso : null;
      const curExp = expIso;
      if (expParsed.valid && nextExp !== curExp) {
        payload['expiration_date'] = nextExp;

        // When clearing expiration, also clear remind-after locally (and send it)
        if (nextExp === null) {
          payload['remind_after_date'] = null;
        }
      }

      const nextRem = remindParsed.valid ? remindParsed.iso : null;
      const curRem = remindIso;
      const expirationWillExist =
        (Object.prototype.hasOwnProperty.call(payload, 'expiration_date') ? payload['expiration_date'] : expIso) !== null;

      if (remindParsed.valid && nextRem !== curRem) {
        // Only allow remind-after when expiration exists (model constraint).
        if (expirationWillExist) {
          payload['remind_after_date'] = nextRem;
        }
      }
    }

    if (
      (payload['object_state'] ||
        Object.prototype.hasOwnProperty.call(payload, 'expiration_date') ||
        Object.prototype.hasOwnProperty.call(payload, 'remind_after_date')) &&
      adminReason.trim()
    ) {
      payload['change_reason'] = adminReason.trim();
    }

    return payload;
  }, [adminReason, adminState, canAdministerLifetime, expIso, expParsed.iso, expParsed.valid, remindIso, remindParsed.iso, remindParsed.valid, st]);

  const adminPayloadHasChanges = Boolean(
    adminPayload &&
      (Object.prototype.hasOwnProperty.call(adminPayload, 'object_state') ||
        Object.prototype.hasOwnProperty.call(adminPayload, 'expiration_date') ||
        Object.prototype.hasOwnProperty.call(adminPayload, 'remind_after_date'))
  );

  const adminPayloadValid = Boolean(adminPayloadHasChanges && expParsed.valid && remindParsed.valid);

  const adminMut = useMutation({
    mutationFn: async () => {
      if (!adminPayload || !adminPayloadValid) throw new Error('Nothing to update');
      if (props.kind === 'vps') return await updateVps(props.id, adminPayload);
      return await updateUser(props.id, adminPayload);
    },
    onMutate: () => {
      chrome.acquireLocalLock(lifetimeObjectRef);
    },
    onSuccess: (res) => {
      setAdminOpen(false);
      setConfirmDeleteOpen(false);
      setAdminReason('');

      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: props.kind === 'vps' ? 'action.vps.lifecycle.label' : undefined,
          actionLabel: props.kind === 'user' ? t('lifetimes.panel.title') : undefined,
          objectLabel: props.objectLabel,
          object: objectRef(props.kind === 'vps' ? 'Vps' : 'User', props.id),
        });
      }

      toasts.pushToast({
        variant: 'ok',
        title: t('lifetimes.admin_update.success.title'),
        body: t('lifetimes.admin_update.success.body'),
      });
      props.onUpdated?.();

      // Best-effort cache invalidation
      if (props.kind === 'vps') void qc.invalidateQueries({ queryKey: ['vps', 'show', { id: props.id }] });
      if (props.kind === 'user') void qc.invalidateQueries({ queryKey: ['users', props.id] });
    },
    onError: (err) => {
      toasts.pushToast({
        variant: 'danger',
        title: t('lifetimes.admin_update.error.title'),
        body: formatErrorMessage(err),
        autoDismissMs: false,
      });
    },
    onSettled: () => {
      chrome.releaseLocalLock(lifetimeObjectRef);
    },
  });

  function requestAdminSave() {
    if (!adminPayloadValid) return;

    const nextState = String(adminState || '').trim();
    const isDeletionMove =
      nextState !== st && (nextState === 'soft_delete' || nextState === 'hard_delete' || nextState === 'deleted');

    if (isDeletionMove) {
      setConfirmDeleteOpen(true);
      return;
    }

    adminMut.mutate();
  }

  function confirmAdminSave() {
    setConfirmDeleteOpen(false);
    adminMut.mutate();
  }

  function openAdminEditor() {
    setAdminState(st === 'unknown' ? 'active' : st);
    setAdminExpirationLocal(isoToAdminDateTimeInput(expIso));
    setAdminRemindLocal(isoToAdminDateTimeInput(remindIso));
    setAdminReason('');
    setAdminOpen(true);
  }

  function setAdminStateFromSelect(nextState: string) {
    setAdminState(nextState);
    if (nextState === 'soft_delete' && !adminExpirationLocal.trim()) {
      setAdminExpirationLocal(softDeleteExpirationInput());
    }
  }

  // ----------------------
  // Admin: State log drawer
  // ----------------------

  const [logOpen, setLogOpen] = useState(false);
  const [logOffset, setLogOffset] = useState(0);
  const logLimit = 50;

  const logQ = useQuery({
    queryKey: ['lifetimes', props.kind, props.id, 'state_logs', logOffset, logLimit],
    queryFn: async () => {
      if (props.kind === 'vps') return (await fetchVpsStateLogs(props.id, { limit: logLimit, offset: logOffset })).data;
      return (await fetchUserStateLogs(props.id, { limit: logLimit, offset: logOffset })).data;
    },
    enabled: canAdministerLifetime && logOpen,
    staleTime: 10_000,
  });

  const logs = logQ.data ?? [];

  const stateLabel = (s: any): string => {
    const raw = String(normalizeStateLogValue<string>(s, 'state') ?? '').trim();
    if (!raw) return t('state.unknown');
    // For known lifetime states, prefer i18n labels
    if (raw === 'active') return t('state.active');
    if (raw === 'suspended') return t('state.suspended');
    if (raw === 'soft_delete') return t('state.soft_delete');
    if (raw === 'hard_delete') return t('state.hard_delete');
    if (raw === 'deleted') return t('state.deleted');
    return raw;
  };

  const changedAtIso = (s: any): string | undefined => normalizeStateLogValue<string>(s, 'changed_at', 'created_at');
  const expAtIso = (s: any): string | undefined => normalizeStateLogValue<string>(s, 'expiration', 'expiration_date');
  const remindAtIso = (s: any): string | undefined => normalizeStateLogValue<string>(s, 'remind_after', 'remind_after_date');

  return (
    <>
      <Card testId={props.testId ?? 'lifetimes.panel'}>
        <CardHeader
          title={t('lifetimes.panel.title')}
          actions={
            canAdministerLifetime ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={openAdminEditor} testId="lifetimes.admin.edit">
                  {t('lifetimes.action.set_state')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setLogOffset(0); setLogOpen(true); }} testId="lifetimes.admin.log">
                  {t('lifetimes.action.state_log')}
                </Button>
              </div>
            ) : userCanSnooze ? (
              <Button size="sm" variant="secondary" onClick={() => setSnoozeOpen(true)} testId="lifetimes.user.snooze">
                {t('lifetimes.action.snooze')}
              </Button>
            ) : null
          }
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.state')}</div>
              <div className="mt-1">
                <Badge variant={stBadge.variant}>{stBadge.label}</Badge>
              </div>
            </div>

            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.expiration')}</div>
              <div className="mt-1 text-sm font-medium text-fg">{expIso ? formatDateTime(expIso) : t('common.na')}</div>
            </div>

            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.remind_after')}</div>
              <div className="mt-1 text-sm font-medium text-fg">{remindIso ? formatDateTime(remindIso) : t('common.na')}</div>
            </div>
          </div>

          <div className="mt-3 text-sm text-muted">
            {helpKey ? t(helpKey) : t('lifetimes.help.unknown', { state: st })}
          </div>

          {canUseSelfServiceLifetime && Boolean(expIso) && st !== 'active' ? (
            <div className="mt-2 text-xs text-faint">{t('lifetimes.user.snooze.disabled')}</div>
          ) : null}
        </CardBody>
      </Card>

      {/* User snooze modal */}
      <Modal
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        title={t('lifetimes.snooze.title')}
        size="md"
        testId="lifetimes.snooze.modal"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setSnoozeOpen(false)} disabled={snoozeMut.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => snoozeMut.mutate()}
              loading={snoozeMut.isPending}
              disabled={!userCanSnooze || !snooze.valid || !snooze.iso}
            >
              {t('lifetimes.action.snooze_confirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-muted">{t('lifetimes.snooze.description')}</div>

          <Select value={snoozePreset} onChange={(e) => setSnoozePreset(e.target.value as SnoozePreset)} testId="lifetimes.snooze.preset">
            <option value="1w">{t('lifetimes.snooze.1w')}</option>
            <option value="2w">{t('lifetimes.snooze.2w')}</option>
            <option value="custom">{t('lifetimes.snooze.custom')}</option>
            <option value="dont">{t('lifetimes.snooze.dont')}</option>
          </Select>

          {snoozePreset === 'custom' ? (
            <div>
              <Input
                type="datetime-local"
                value={snoozeCustom}
                onChange={(e) => setSnoozeCustom(e.target.value)}
                testId="lifetimes.snooze.custom"
              />
              {!snooze.valid ? <div className="mt-1 text-xs text-danger">{t('lifetimes.snooze.invalid')}</div> : null}
            </div>
          ) : null}

          {snooze.iso ? (
            <div className="text-xs text-muted">{t('lifetimes.snooze.preview', { when: formatDateTime(snooze.iso) })}</div>
          ) : null}

          {expIso && snooze.iso && new Date(snooze.iso).getTime() > new Date(expIso).getTime() ? (
            <div className="text-xs text-warn">{t('lifetimes.snooze.after_expiration')}</div>
          ) : null}
        </div>
      </Modal>

      {/* Admin editor modal */}
      <Modal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        title={t('lifetimes.admin_update.title', { label: props.objectLabel })}
        size="lg"
        testId="lifetimes.admin.modal"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdminOpen(false)} disabled={adminMut.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={requestAdminSave}
              loading={adminMut.isPending}
              disabled={!adminPayloadValid}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-muted">{t('lifetimes.admin_update.description')}</div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.state')}</div>
              <div className="mt-1">
                <Select value={adminState} onChange={(e) => setAdminStateFromSelect(e.target.value)} testId="lifetimes.admin.state">
                  <option value="active">{t('state.active')}</option>
                  <option value="suspended">{t('state.suspended')}</option>
                  <option value="soft_delete">{t('state.soft_delete')}</option>
                  <option value="hard_delete">{t('state.hard_delete')}</option>
                  <option value="deleted">{t('state.deleted')}</option>
                </Select>
              </div>
              <div className="mt-2 text-xs text-faint">
                {stateHelpKey(adminState) ? t(stateHelpKey(adminState) as any) : ''}
              </div>
            </div>

            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.expiration')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={adminExpirationLocal}
                  onChange={(e) => {
                    setAdminExpirationLocal(e.target.value);
                    // If expiration is cleared, also clear remind-after in the form.
                    if (!e.target.value.trim()) setAdminRemindLocal('');
                  }}
                  placeholder={t('common.datetime.placeholder')}
                  testId="lifetimes.admin.expiration"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setAdminExpirationLocal(''); setAdminRemindLocal(''); }}
                  testId="lifetimes.admin.expiration.clear"
                >
                  {t('common.clear')}
                </Button>
              </div>
              {!expParsed.valid ? <div className="mt-1 text-xs text-danger">{t('lifetimes.admin_update.invalid_date')}</div> : null}
            </div>

            <div>
              <div className="text-xs text-faint">{t('lifetimes.field.remind_after')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={adminRemindLocal}
                  onChange={(e) => setAdminRemindLocal(e.target.value)}
                  disabled={!adminExpirationLocal.trim()}
                  placeholder={t('common.datetime.placeholder')}
                  testId="lifetimes.admin.remind_after"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAdminRemindLocal('')}
                  testId="lifetimes.admin.remind_after.clear"
                >
                  {t('common.clear')}
                </Button>
              </div>
              {!remindParsed.valid ? <div className="mt-1 text-xs text-danger">{t('lifetimes.admin_update.invalid_date')}</div> : null}
              {!adminExpirationLocal.trim() ? (
                <div className="mt-1 text-xs text-faint">{t('lifetimes.admin_update.remind_requires_expiration')}</div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-faint">{t('lifetimes.field.reason')}</div>
              <div className="mt-1">
                <Textarea
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  rows={3}
                  testId="lifetimes.admin.reason"
                />
              </div>
              <div className="mt-1 text-xs text-faint">{t('lifetimes.field.reason_hint')}</div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Admin confirm delete step */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={t('lifetimes.confirm_delete.title')}
        size="md"
        testId="lifetimes.admin.confirm_delete"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteOpen(false)} disabled={adminMut.isPending}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmAdminSave} loading={adminMut.isPending} disabled={!adminPayloadValid}>
              {t('lifetimes.confirm_delete.confirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-muted">{t('lifetimes.confirm_delete.description', { label: props.objectLabel })}</div>
          <div className="text-xs text-faint">{t('lifetimes.confirm_delete.hint')}</div>
        </div>
      </Modal>

      {/* Admin state log drawer */}
      <Drawer
        open={logOpen}
        onClose={() => setLogOpen(false)}
        side="right"
        width="lg"
        title={t('lifetimes.state_log.title', { label: props.objectLabel })}
        testId="lifetimes.state_log.drawer"
      >
        {logQ.isLoading ? (
          <Spinner label={t('common.loading')} />
        ) : logQ.isError ? (
          <div className="text-sm text-muted">{t('lifetimes.state_log.error')}</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted">{t('lifetimes.state_log.empty')}</div>
        ) : (
          <div className="space-y-3">
            <TableCard>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 pr-3">{t('lifetimes.state_log.col.changed_at')}</th>
                    <th className="py-2 pr-3">{t('lifetimes.state_log.col.state')}</th>
                    <th className="py-2 pr-3">{t('lifetimes.state_log.col.expiration')}</th>
                    <th className="py-2 pr-3">{t('lifetimes.state_log.col.remind_after')}</th>
                    <th className="py-2 pr-3">{t('lifetimes.state_log.col.user')}</th>
                    <th className="py-2">{t('lifetimes.state_log.col.reason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((s) => {
                    const stateRaw = String(normalizeStateLogValue<string>(s as any, 'state') ?? '').trim();
                    const b = objectStateBadge(stateRaw || 'unknown', t);

                    const u = (s as any).user as any | undefined;
                    const userLabel = u?.login ?? u?.label ?? (typeof u?.id === 'number' ? `#${u.id}` : t('common.na'));

                    return (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{formatDateTime(changedAtIso(s) ?? null)}</td>
                        <td className="py-2 pr-3 align-top"><Badge variant={b.variant}>{stateLabel(s)}</Badge></td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{expAtIso(s) ? formatDateTime(expAtIso(s) as any) : t('common.na')}</td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{remindAtIso(s) ? formatDateTime(remindAtIso(s) as any) : t('common.na')}</td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">{userLabel}</td>
                        <td className="py-2 align-top">
                          <div className="max-w-xl whitespace-pre-wrap break-words text-xs text-muted">{String((s as any).reason ?? '') || '—'}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>

            <div className="flex items-center justify-between">
              <div className="text-xs text-faint">{t('lifetimes.state_log.hint')}</div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLogOffset(Math.max(0, logOffset - logLimit))}
                  disabled={logOffset <= 0}
                  testId="lifetimes.state_log.prev"
                >
                  {t('pagination.prev')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLogOffset(logOffset + logLimit)}
                  disabled={logs.length < logLimit}
                  testId="lifetimes.state_log.next"
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
