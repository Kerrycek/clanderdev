import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';

import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Drawer } from '../../../../components/ui/Drawer';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { SwitchRow } from '../../../../components/ui/SwitchRow';

import { updateUser } from '../../../../lib/api/users';
import { fetchUserPayments } from '../../../../lib/api/payments';
import { adminDateTimeInputToIso } from '../../../../lib/datetimeLocal';
import { formatDateTime } from '../../../../lib/format';
import { getPaidUntilStatus, paidUntilBadgeVariant, paidUntilStatusLabelKey } from '../../../../lib/paymentsBadges';
import { formatMoneyLike } from '../../../../lib/paymentsFormat';
import { roleFromLevel } from '../../../../lib/roles';
import { objectStateBadge } from '../../../../lib/taskStatus';

import { useAdminUserContext } from './AdminUserLayout';
import {
  makeEditDraft,
  makeStateDraft,
  optionalStringField,
  softDeleteExpirationInput,
  type EditUserDraft,
  type StateDraft,
} from './AdminUserOverviewModel';

export function AdminUserOverviewPage() {
  const { t } = useI18n();
  const toasts = useToasts();
  const { user: u, refetch } = useAdminUserContext();
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EditUserDraft>(() => makeEditDraft(u));
  const [editError, setEditError] = useState<string | null>(null);
  const [stateDraft, setStateDraft] = useState<StateDraft>(() => makeStateDraft(u));
  const [stateError, setStateError] = useState<string | null>(null);
  const userInfo = optionalStringField(u, 'info');
  const userRole = roleFromLevel(typeof u.level === 'number' ? u.level : undefined);
  const paidUntil = typeof u.paid_until === 'string' && u.paid_until.trim() ? u.paid_until : null;
  const paidUntilStatus = getPaidUntilStatus(paidUntil);
  const stateBadge = objectStateBadge(u.object_state ?? 'active', t);

  const paymentHistoryQ = useQuery({
    queryKey: ['user_payments', 'overview', { userId: u.id, limit: 5 }],
    queryFn: async () => (await fetchUserPayments({ userId: u.id, limit: 5 })).data,
    staleTime: 30_000,
  });

  const expirationParsed = useMemo(
    () => adminDateTimeInputToIso(stateDraft.expirationDate),
    [stateDraft.expirationDate]
  );
  const remindParsed = useMemo(
    () => adminDateTimeInputToIso(stateDraft.remindAfterDate),
    [stateDraft.remindAfterDate]
  );

  const statePayload = useMemo(() => {
    const payload: Record<string, unknown> = {};
    const currentState = String(u.object_state ?? 'active').trim() || 'active';
    const nextState = stateDraft.objectState.trim() || 'active';

    if (nextState !== currentState) payload['object_state'] = nextState;
    if (expirationParsed.valid && expirationParsed.iso !== (u.expiration_date ?? null)) {
      payload['expiration_date'] = expirationParsed.iso;
    }
    if (remindParsed.valid && remindParsed.iso !== (u.remind_after_date ?? null)) {
      payload['remind_after_date'] = remindParsed.iso;
    }
    if (Object.keys(payload).length > 0 && stateDraft.reason.trim()) {
      payload['change_reason'] = stateDraft.reason.trim();
    }

    return payload;
  }, [
    expirationParsed.iso,
    expirationParsed.valid,
    remindParsed.iso,
    remindParsed.valid,
    stateDraft.objectState,
    stateDraft.reason,
    u.expiration_date,
    u.object_state,
    u.remind_after_date,
  ]);

  const stateHasChanges = Object.keys(statePayload).length > 0;
  const stateValid = stateHasChanges && expirationParsed.valid && remindParsed.valid;

  const openEdit = () => {
    setEditDraft(makeEditDraft(u));
    setEditError(null);
    setEditOpen(true);
  };

  const setEditField = <K extends keyof EditUserDraft>(key: K, value: EditUserDraft[K]) => {
    setEditDraft((prev) => ({ ...prev, [key]: value }));
    if (editError) setEditError(null);
  };

  const setStateField = <K extends keyof StateDraft>(key: K, value: StateDraft[K]) => {
    setStateDraft((prev) => ({ ...prev, [key]: value }));
    if (stateError) setStateError(null);
  };

  const setObjectState = (objectState: string) => {
    setStateDraft((prev) => ({
      ...prev,
      objectState,
      expirationDate: objectState === 'soft_delete' && !prev.expirationDate.trim()
        ? softDeleteExpirationInput()
        : prev.expirationDate,
    }));
    if (stateError) setStateError(null);
  };

  const buildEditPayload = (): Record<string, unknown> | null => {
    const level = Number(editDraft.level);
    if (!Number.isFinite(level) || level < 0) {
      setEditError(t('admin.user.edit.validation.level'));
      return null;
    }

    return {
      full_name: editDraft.fullName.trim() || undefined,
      email: editDraft.email.trim() || undefined,
      address: editDraft.address.trim() || undefined,
      level,
      info: editDraft.info.trim() || undefined,
      mailer_enabled: editDraft.mailerEnabled,
    };
  };

  const editM = useMutation({
    mutationFn: async () => {
      const payload = buildEditPayload();
      if (!payload) throw new Error('validation');
      return updateUser(u.id, payload);
    },
    onSuccess: async () => {
      setEditOpen(false);
      setEditError(null);
      toasts.pushToast({ variant: 'ok', title: t('admin.user.edit.toast.saved') });
      await refetch();
    },
    onError: (err: any) => {
      if (String(err?.message ?? '') === 'validation') return;
      setEditError(String(err?.message ?? err));
    },
  });

  const stateM = useMutation({
    mutationFn: async () => {
      if (!stateValid) throw new Error(t('admin.user.lifecycle.validation.no_changes'));
      return updateUser(u.id, statePayload);
    },
    onSuccess: async (res) => {
      setStateError(null);
      setStateDraft(makeStateDraft(res.data ?? u));
      toasts.pushToast({ variant: 'ok', title: t('admin.user.lifecycle.toast.saved') });
      await refetch();
    },
    onError: (err: any) => setStateError(String(err?.message ?? err)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card testId="admin.user.details.card">
        <CardHeader
          title={t('common.details')}
          actions={
            <Button variant="secondary" size="sm" onClick={openEdit} testId="admin.user.edit.open">
              {t('admin.user.edit.open')}
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted">{t('requests.field.full_name')}</div>
              <div className="text-sm">{u.full_name ?? t('common.na')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('admin.user.field.email')}</div>
              <div className="text-sm">{u.email ?? t('common.na')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('admin.users.field.role')}</div>
              <div className="text-sm">
                <Badge variant="neutral">{t(`admin.users.role.${userRole}`)}</Badge>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('admin.user.edit.field.mailer_enabled')}</div>
              <div className="text-sm">{u.mailer_enabled === false ? t('common.disabled') : t('common.enabled')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('admin.user.field.created')}</div>
              <div className="text-sm">{u.created_at ? formatDateTime(u.created_at) : t('common.na')}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('admin.user.field.last_activity')}</div>
              <div className="text-sm">{u.last_activity_at ? formatDateTime(u.last_activity_at) : t('common.na')}</div>
            </div>
            {u.address ? (
              <div className="sm:col-span-2">
                <div className="text-xs text-muted">{t('admin.user.field.address')}</div>
                <div className="text-sm whitespace-pre-wrap">{u.address}</div>
              </div>
            ) : null}
            {userInfo ? (
              <div className="sm:col-span-2">
                <div className="text-xs text-muted">{t('admin.user.edit.field.info')}</div>
                <div className="text-sm whitespace-pre-wrap">{userInfo}</div>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card testId="admin.user.payments.overview.card">
        <CardHeader
          title={t('admin.user.overview.payments.title')}
          subtitle={t('admin.user.overview.payments.subtitle')}
          actions={
            <Link to={`/admin/users/${u.id}/payments`} className="text-sm underline">
              {t('admin.user.overview.payments.open')}
            </Link>
          }
        />
        <CardBody>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2 p-3" data-testid="admin.user.overview.paid_until">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted">{t('payments.my.stat.paid_until')}</div>
                  <div className="mt-1 text-lg font-semibold text-fg">
                    {paidUntil ? formatDateTime(paidUntil) : t('payments.my.stat.paid_until.missing')}
                  </div>
                </div>
                <Badge variant={paidUntilBadgeVariant(paidUntilStatus.status)}>
                  {t(paidUntilStatusLabelKey(paidUntilStatus.status))}
                </Badge>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-fg">{t('admin.user.overview.payments.recent')}</div>
                {typeof u.monthly_payment === 'number' ? (
                  <div className="text-xs text-muted">
                    {t('admin.user.payments.settings.field.monthly_payment')}: {formatMoneyLike(u.monthly_payment)}
                  </div>
                ) : null}
              </div>

              {paymentHistoryQ.isLoading ? (
                <div className="text-sm text-muted">{t('common.loading')}</div>
              ) : paymentHistoryQ.isError ? (
                <Alert variant="danger" title={t('payments.my.history.load_error.title')} />
              ) : (paymentHistoryQ.data ?? []).length === 0 ? (
                <div className="text-sm text-muted">{t('payments.my.history.empty')}</div>
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {(paymentHistoryQ.data ?? []).slice(0, 5).map((payment) => (
                    <div key={payment.id} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[auto_1fr]">
                      <div className="font-semibold text-fg">{formatMoneyLike(payment.amount)}</div>
                      <div className="min-w-0 text-muted">
                        <div className="truncate">
                          {payment.from_date && payment.to_date
                            ? `${formatDateTime(payment.from_date)} → ${formatDateTime(payment.to_date)}`
                            : t('common.na')}
                        </div>
                        <div className="text-xs text-faint">
                          {payment.created_at ? formatDateTime(payment.created_at) : t('common.na')}
                          {payment.incoming_payment?.id ? ` · #${payment.incoming_payment.id}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card testId="admin.user.account_actions.card" className="lg:col-span-2">
        <CardHeader title={t('admin.user.account_actions.title')} subtitle={t('admin.user.account_actions.subtitle')} />
        <CardBody>
          <div className="grid gap-4">
            <form
              className="space-y-3 rounded-lg border border-border bg-surface-2 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                stateM.mutate();
              }}
              data-testid="admin.user.lifecycle.form"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={stateBadge.variant}>{stateBadge.label}</Badge>
                <span className="text-sm text-muted">{t('admin.user.lifecycle.current_state')}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label={t('lifetimes.field.state')}
                  value={stateDraft.objectState}
                  onChange={(e) => setObjectState(e.target.value)}
                  testId="admin.user.lifecycle.state"
                  options={[
                    { value: 'active', label: t('state.active') },
                    { value: 'suspended', label: t('state.suspended') },
                    { value: 'soft_delete', label: t('state.soft_delete') },
                    { value: 'hard_delete', label: t('state.hard_delete') },
                    { value: 'deleted', label: t('state.deleted') },
                  ]}
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t('lifetimes.field.expiration')}</span>
                  <Input
                    value={stateDraft.expirationDate}
                    onChange={(e) => {
                      setStateField('expirationDate', e.target.value);
                      if (!e.target.value.trim()) setStateField('remindAfterDate', '');
                    }}
                    placeholder={t('common.datetime.placeholder')}
                    testId="admin.user.lifecycle.expiration"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('lifetimes.field.reason')}</span>
                <Input
                  value={stateDraft.reason}
                  onChange={(e) => setStateField('reason', e.target.value)}
                  testId="admin.user.lifecycle.reason"
                />
              </label>

              {!expirationParsed.valid || !remindParsed.valid ? (
                <Alert variant="danger" title={t('lifetimes.admin_update.invalid_date')} />
              ) : stateError ? (
                <Alert variant="danger" title={t('lifetimes.admin_update.error.title')}>
                  {stateError}
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  type="submit"
                  loading={stateM.isPending}
                  disabled={!stateValid}
                  testId="admin.user.lifecycle.save"
                >
                  {t('admin.user.lifecycle.save')}
                </Button>
              </div>
            </form>
          </div>
        </CardBody>
      </Card>

      <Drawer
        open={editOpen}
        onClose={() => {
          if (editM.isPending) return;
          setEditOpen(false);
          setEditError(null);
        }}
        title={t('admin.user.edit.title')}
        width="lg"
        side="right"
        testId="admin.user.edit.drawer"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditOpen(false);
                setEditError(null);
              }}
              disabled={editM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => editM.mutate()}
              loading={editM.isPending}
              testId="admin.user.edit.save"
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editError ? (
            <Alert variant="danger" title={t('admin.user.edit.error')}>
              {editError}
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">{t('requests.field.full_name')}</span>
              <Input
                value={editDraft.fullName}
                onChange={(e) => setEditField('fullName', e.target.value)}
                testId="admin.user.edit.full_name"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">{t('admin.user.field.email')}</span>
              <Input
                type="email"
                value={editDraft.email}
                onChange={(e) => setEditField('email', e.target.value)}
                testId="admin.user.edit.email"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">{t('admin.user.field.level')}</span>
              <Input
                value={editDraft.level}
                onChange={(e) => setEditField('level', e.target.value)}
                inputMode="numeric"
                testId="admin.user.edit.level"
              />
            </label>

            <SwitchRow
              checked={editDraft.mailerEnabled}
              onChange={(checked) => setEditField('mailerEnabled', checked)}
              label={t('admin.user.edit.field.mailer_enabled')}
              description={t('admin.user.edit.field.mailer_enabled.help')}
              testId="admin.user.edit.mailer_enabled"
            />

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">{t('admin.user.field.address')}</span>
              <Input
                value={editDraft.address}
                onChange={(e) => setEditField('address', e.target.value)}
                testId="admin.user.edit.address"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">{t('admin.user.edit.field.info')}</span>
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
                value={editDraft.info}
                onChange={(e) => setEditField('info', e.target.value)}
                data-testid="admin.user.edit.info"
              />
            </label>
          </div>
        </div>
      </Drawer>

    </div>
  );
}
