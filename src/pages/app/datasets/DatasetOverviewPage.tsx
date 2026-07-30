import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useObjectScope } from '../../../app/objectScope';
import { useChrome } from '../../../components/layout/ChromeContext';

import { Alert } from '../../../components/ui/Alert';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ChipLink } from '../../../components/ui/ChipLink';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { StackedBar } from '../../../components/ui/StackedBar';

import {
  createDataset,
  deleteDataset,
  updateDataset,
  type Dataset,
  type DatasetEditablePayload,
} from '../../../lib/api/datasets';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { type TransactionChain } from '../../../lib/api/transactions';
import { formatDateTime, formatMiB } from '../../../lib/format';
import { datasetCapabilities, gateDatasetAction } from '../../../lib/gates/dataset';
import { usageSeverityFromRatio } from '../../../lib/usage';

import { useDatasetContext } from './DatasetContext';

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function positive(v: unknown): number | undefined {
  const n = asNumber(v);
  return n !== undefined && n > 0 ? n : undefined;
}

function datasetLabel(ds: any): string {
  return String(ds?.full_name ?? ds?.name ?? ds?.label ?? `#${ds?.id ?? '?'}`);
}

function datasetShortName(ds: any): string {
  const full = datasetLabel(ds);
  const parts = full.split('/');
  return parts[parts.length - 1] || full;
}

function mibToGiBInput(value: unknown): string {
  const n = asNumber(value);
  if (n === undefined || n <= 0) return '';
  return String(Number((n / 1024).toFixed(2)));
}

function parseGiBToMiB(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid-size');
  return Math.round(n * 1024);
}

function parseRecordsizeKiB(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 4 || n > 128 || (n & (n - 1)) !== 0) throw new Error('invalid-recordsize');
  return n * 1024;
}

function recordsizeToKiBInput(value: unknown): string {
  const n = asNumber(value);
  if (n === undefined || n <= 0) return '';
  return String(Math.round(n / 1024));
}

function chainBadgeFromState(
  state: string | null | undefined,
  t: (k: any) => string
): { label: string; variant: React.ComponentProps<typeof Badge>['variant'] } {
  const st = String(state ?? '').trim();
  const norm = st.toLowerCase();
  if (norm === 'done' || norm === 'completed' || norm === 'resolved') return { label: t('state.done'), variant: 'ok' };
  if (norm === 'running') return { label: t('state.running'), variant: 'warn' };
  if (norm === 'failed' || norm === 'fatal') return { label: t('state.failed'), variant: 'danger' };
  if (norm === 'canceled' || norm === 'cancelled') return { label: t('state.canceled'), variant: 'neutral' };

  // Anything else that is not a finished state is treated as “working”.
  if (st) return { label: st, variant: 'warn' };
  return { label: t('state.unknown'), variant: 'neutral' };
}

function isFailedChainState(state: string | null | undefined): boolean {
  const st = String(state ?? '').trim().toLowerCase();
  return st === 'failed' || st === 'fatal';
}

function chainProgressLabel(c: TransactionChain, t: (k: any, vars?: any) => string): string | null {
  const prog = asNumber((c as any).progress);
  if (prog === undefined) return null;

  // Some backends report percent as 0..1, some as 0..100.
  const pct = prog <= 1 ? Math.round(prog * 100) : Math.round(prog);
  const clamped = Math.max(0, Math.min(100, pct));
  return t('common.progress_percent', { percent: clamped });
}

function SpaceCard(props: { dataset: any }) {
  const { t } = useI18n();

  const used = Math.max(0, asNumber(props.dataset.used) ?? 0);
  const avail = Math.max(0, asNumber(props.dataset.avail) ?? 0);

  const refquota = positive(props.dataset.refquota);
  const quota = positive(props.dataset.quota);
  const referenced = asNumber(props.dataset.referenced);

  const total = used + avail;
  const usageRatio = total > 0 ? used / total : 0;
  const usageVariant = usageSeverityFromRatio(usageRatio);

  const pctQuota = refquota ? Math.round((used / refquota) * 100) : null;
  const pctQuotaClamped = pctQuota !== null ? Math.max(0, Math.min(999, pctQuota)) : null;
  const pctVariant = pctQuotaClamped !== null ? usageSeverityFromRatio(pctQuotaClamped / 100) : undefined;

  const segs = useMemo(() => {
    if (total <= 0) return [{ value: 1, variant: 'neutral' as const, title: t('datasets.usage.no_data') }];
    return [
      { value: used, variant: usageVariant, title: t('datasets.usage.used_mib', { mib: used.toFixed(0) }) },
      {
        value: avail,
        variant: 'neutral' as const,
        title: t('datasets.usage.free_mib', { mib: avail.toFixed(0) }),
      },
    ];
  }, [avail, t, total, usageVariant, used]);


  return (
    <Card testId="dataset.overview.space">
      <CardHeader
        title={t('dataset.overview.space.title')}
        subtitle={t('dataset.overview.space.subtitle')}
        actions={
          pctQuotaClamped !== null ? (
            <Badge variant={pctVariant as any} title={t('dataset.overview.space.badge.title')}>
              {pctQuotaClamped}%
            </Badge>
          ) : (
            <Badge variant="neutral" title={t('dataset.overview.space.badge.infinity_title')}>
              ∞
            </Badge>
          )
        }
      />

      <CardBody>
        <StackedBar ariaLabel={t('datasets.usage.aria_label')} segments={segs} />

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-faint">{t('dataset.field.used')}</div>
            <div className="font-medium text-fg">{formatMiB(used)}</div>
          </div>
          <div>
            <div className="text-xs text-faint">{t('dataset.field.available')}</div>
            <div className="font-medium text-fg">{formatMiB(avail)}</div>
          </div>

          <div>
            <div className="text-xs text-faint">{t('dataset.field.reference_quota')}</div>
            <div className="font-medium text-fg">{refquota !== undefined ? formatMiB(refquota) : '∞'}</div>
          </div>

          <>
              <div>
                <div className="text-xs text-faint">{t('dataset.field.quota')}</div>
                <div className="font-medium text-fg">{quota !== undefined ? formatMiB(quota) : t('common.na')}</div>
              </div>
              <div>
                <div className="text-xs text-faint">{t('dataset.field.referenced')}</div>
                <div className="font-medium text-fg">
                  {referenced !== undefined ? formatMiB(referenced) : t('common.na')}
                </div>
              </div>
            </>
        </div>
      </CardBody>
    </Card>
  );
}

function TemporaryExpansionCard(props: { dataset: any }) {
  const { t } = useI18n();
  const { basePath } = useAppMode();

  const ds = props.dataset;
  const expansionId =
    typeof (ds as any).dataset_expansion?.id === 'number' ? Number((ds as any).dataset_expansion.id) : null;
  const to = `${basePath}/datasets/${ds.id}/expansion`;

  return (
    <Card testId="dataset.overview.expansion">
      <CardHeader
        title={t('dataset.overview.expansion.title')}
        subtitle={
          expansionId
            ? t('dataset.overview.expansion.subtitle_active')
            : t('dataset.overview.expansion.subtitle')
        }
        actions={
          <Button to={to} size="sm" testId="dataset.overview.expansion.open">
            {expansionId ? t('dataset.overview.expansion.open') : t('dataset.overview.expansion.create')}
          </Button>
        }
      />
      <CardBody>
        <div className="space-y-3 text-sm text-muted">
          <p>{t('dataset.overview.expansion.body')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={expansionId ? 'warn' : 'neutral'}>
              {expansionId
                ? t('dataset.overview.expansion.active')
                : t('dataset.overview.expansion.none')}
            </Badge>
            {expansionId ? <span className="text-xs text-faint">#{expansionId}</span> : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

type DatasetEditForm = {
  quotaGiB: string;
  refquotaGiB: string;
  compression?: boolean;
  atime?: boolean;
  relatime?: boolean;
  recordsizeKiB: string;
  sync?: DatasetEditablePayload['sync'];
  sharenfs?: string;
  adminOverride?: boolean;
  adminLockType?: 'no_lock' | 'absolute' | 'not_less' | 'not_more';
};

type DatasetCreateForm = {
  name: string;
  automount: boolean;
  quotaGiB: string;
  refquotaGiB: string;
  compression: boolean;
  atime: boolean;
  relatime: boolean;
  recordsizeKiB: string;
  sync: NonNullable<DatasetEditablePayload['sync']>;
  sharenfs: string;
  adminOverride: boolean;
  adminLockType: NonNullable<DatasetEditablePayload['admin_lock_type']>;
  includeAdvanced: boolean;
};

function initialDatasetCreateForm(): DatasetCreateForm {
  return {
    name: '',
    automount: true,
    quotaGiB: '',
    refquotaGiB: '',
    compression: true,
    atime: false,
    relatime: false,
    recordsizeKiB: '128',
    sync: 'standard',
    sharenfs: '',
    adminOverride: false,
    adminLockType: 'no_lock',
    includeAdvanced: false,
  };
}

function buildEditablePayload(
  form: DatasetEditForm,
  isAdmin: boolean,
  includeAdvanced: boolean
): DatasetEditablePayload {
  const payload: DatasetEditablePayload = {};

  const quota = parseGiBToMiB(form.quotaGiB);
  const refquota = parseGiBToMiB(form.refquotaGiB);

  if (quota !== undefined) payload.quota = quota;
  if (refquota !== undefined) payload.refquota = refquota;

  if (includeAdvanced) {
    const recordsize = parseRecordsizeKiB(form.recordsizeKiB);
    if (form.compression !== undefined) payload.compression = form.compression;
    if (form.atime !== undefined) payload.atime = form.atime;
    if (form.relatime !== undefined) payload.relatime = form.relatime;
    if (form.sync !== undefined) payload.sync = form.sync;
    if (recordsize !== undefined) payload.recordsize = recordsize;

    if (isAdmin) {
      if (form.sharenfs !== undefined) payload.sharenfs = form.sharenfs.trim();
      if (form.adminOverride !== undefined) payload.admin_override = form.adminOverride;
      if (form.adminLockType !== undefined) payload.admin_lock_type = form.adminLockType;
    }
  }

  return payload;
}

function buildCreateProperties(form: DatasetCreateForm, isAdmin: boolean): DatasetEditablePayload {
  const payload: DatasetEditablePayload = {};

  if (form.quotaGiB.trim()) payload.quota = parseGiBToMiB(form.quotaGiB);
  if (form.refquotaGiB.trim()) payload.refquota = parseGiBToMiB(form.refquotaGiB);

  if (form.includeAdvanced) {
    payload.compression = form.compression;
    payload.atime = form.atime;
    payload.relatime = form.relatime;
    payload.sync = form.sync;
    payload.recordsize = parseRecordsizeKiB(form.recordsizeKiB);

    if (isAdmin) {
      payload.sharenfs = form.sharenfs.trim();
      payload.admin_override = form.adminOverride;
      payload.admin_lock_type = form.adminLockType;
    }
  }

  return payload;
}

function DatasetManagementCard() {
  const { t } = useI18n();
  const auth = useAuth();
  const { role } = auth;
  const scope = useObjectScope();
  const chrome = useChrome();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataset, refetch, refetchChains, datasetRef, busyLocalLock, busyTransaction, listPath } = useDatasetContext();
  const capabilities = datasetCapabilities(dataset, {
    role,
    scope: scope.scope,
    userId: auth.user?.id,
  });
  const showAdminControls = capabilities.canUseAdminProperties;

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<DatasetCreateForm>(initialDatasetCreateForm);

  const [editAdvancedOpened, setEditAdvancedOpened] = useState(false);
  const [editAdvancedDirty, setEditAdvancedDirty] = useState(false);
  const [edit, setEdit] = useState<DatasetEditForm>(() => ({
    quotaGiB: mibToGiBInput((dataset as any).quota),
    refquotaGiB: mibToGiBInput((dataset as any).refquota),
    compression: typeof (dataset as any).compression === 'boolean' ? (dataset as any).compression : undefined,
    atime: typeof (dataset as any).atime === 'boolean' ? (dataset as any).atime : undefined,
    relatime: typeof (dataset as any).relatime === 'boolean' ? (dataset as any).relatime : undefined,
    recordsizeKiB: recordsizeToKiBInput((dataset as any).recordsize),
    sync: ['standard', 'always', 'disabled'].includes(String((dataset as any).sync))
      ? ((dataset as any).sync as DatasetEditablePayload['sync'])
      : undefined,
    sharenfs: typeof (dataset as any).sharenfs === 'string' ? (dataset as any).sharenfs : undefined,
    adminOverride:
      typeof (dataset as any).admin_override === 'boolean' ? (dataset as any).admin_override : undefined,
    adminLockType: ['no_lock', 'absolute', 'not_less', 'not_more'].includes(
      String((dataset as any).admin_lock_type)
    )
      ? ((dataset as any).admin_lock_type as DatasetEditForm['adminLockType'])
      : undefined,
  }));

  const objectLabel = datasetLabel(dataset);

  useEffect(() => {
    if (searchParams.get('create') !== 'subdataset') return;

    if (capabilities.canCreateSubdataset) {
      setFormError(null);
      setCreateOpen(true);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  }, [capabilities.canCreateSubdataset, searchParams, setSearchParams]);

  const track = (meta: unknown, labelKey: string) => {
    const asId = getMetaActionStateId(meta);
    if (asId !== undefined) {
      const progressTitleKey =
        labelKey === 'action.dataset.create.label'
          ? 'modal.dataset.create.title'
          : labelKey === 'action.dataset.update.label'
            ? 'modal.dataset.update.title'
            : labelKey === 'action.dataset.delete.label'
              ? 'modal.dataset.delete.title'
              : undefined;
      chrome.trackActionState(asId, { actionLabelKey: labelKey, objectLabel, object: datasetRef, progressTitleKey });
    }
    refetch();
    refetchChains();
  };

  const createM = useMutation({
    mutationFn: async () => {
      const name = createForm.name.trim();
      if (!name) throw new Error('name-required');
      const payload = buildCreateProperties(createForm, showAdminControls);
      return createDataset({
        ...payload,
        dataset: Number(dataset.id),
        name,
        automount: createForm.automount,
      });
    },
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: (res) => {
      track(res.meta, 'action.dataset.create.label');
      setCreateOpen(false);
      setCreateForm(initialDatasetCreateForm());
      const newId = Number((res.data as Dataset | undefined)?.id);
      if (Number.isInteger(newId) && newId > 0) navigate(`${listPath}/${newId}`);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const updateM = useMutation({
    mutationFn: async () =>
      updateDataset(dataset.id, buildEditablePayload(edit, showAdminControls, editAdvancedDirty)),
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: (res) => {
      track(res.meta, 'action.dataset.update.label');
      setEditAdvancedDirty(false);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const deleteM = useMutation({
    mutationFn: async () => deleteDataset(dataset.id),
    onMutate: () => chrome.acquireLocalLock(datasetRef),
    onSuccess: (res) => {
      track(res.meta, 'action.dataset.delete.label');
      setDeleteOpen(false);
      navigate(listPath);
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(datasetRef),
  });

  const busyLocal = busyLocalLock || createM.isPending || updateM.isPending || deleteM.isPending;
  const createGate = gateDatasetAction('dataset.create', {
    dataset,
    busyLocal,
    busyTransaction,
    role,
    permission: capabilities.canCreateSubdataset,
  });
  const updateGate = gateDatasetAction('dataset.update', {
    dataset,
    busyLocal,
    busyTransaction,
    role,
    permission: capabilities.canUpdate,
  });
  const deleteGate = gateDatasetAction('dataset.delete', {
    dataset,
    busyLocal,
    busyTransaction,
    role,
    permission: capabilities.canDelete,
  });

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateForm(initialDatasetCreateForm());
    setFormError(null);
    createM.reset();
  };

  const submitCreate = () => {
    setFormError(null);
    try {
      buildCreateProperties(createForm, showAdminControls);
      createM.mutate();
    } catch {
      setFormError(t('dataset.manage.validation.properties'));
    }
  };

  const submitUpdate = () => {
    setFormError(null);
    try {
      buildEditablePayload(edit, showAdminControls, editAdvancedDirty);
      updateM.mutate();
    } catch {
      setFormError(t('dataset.manage.validation.properties'));
    }
  };

  const advancedFields = (
    <details
      open={editAdvancedOpened}
      onToggle={(event) => setEditAdvancedOpened(event.currentTarget.open)}
      className="rounded-lg border border-border bg-surface-2"
      data-testid="dataset.manage.advanced_properties"
    >
      <summary
        className="flex cursor-pointer select-none items-start justify-between gap-3 px-3 py-3"
        data-testid="dataset.manage.advanced_properties.summary"
      >
        <span>
          <span className="block text-sm font-medium text-fg">{t('filters.advanced.label')} ZFS</span>
          <span className="mt-1 block text-xs text-muted">
            {t('dataset.manage.field.recordsize')} · {t('dataset.manage.field.sync')} ·{' '}
            {t('dataset.manage.field.atime')} · {t('dataset.manage.field.relatime')}
          </span>
        </span>
        <Badge variant="neutral">{t('filters.advanced.label')}</Badge>
      </summary>
      <div className="space-y-4 border-t border-border px-3 py-4">
        <Checkbox
          checked={edit.compression ?? false}
          onChange={(value) => {
            setEdit((previous) => ({ ...previous, compression: value }));
            setEditAdvancedDirty(true);
          }}
          label={t('dataset.manage.field.compression')}
          testId="dataset.manage.compression"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="text-xs font-medium text-muted">{t('dataset.manage.field.recordsize')}</div>
            <Input
              value={edit.recordsizeKiB}
              onChange={(event) => {
                setEdit((previous) => ({ ...previous, recordsizeKiB: event.target.value }));
                setEditAdvancedDirty(true);
              }}
              placeholder="128"
              testId="dataset.manage.recordsize"
            />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-muted">{t('dataset.manage.field.sync')}</div>
            <Select
              value={edit.sync ?? ''}
              onChange={(event) => {
                setEdit((previous) => ({
                  ...previous,
                  sync: event.target.value as DatasetEditablePayload['sync'],
                }));
                setEditAdvancedDirty(true);
              }}
              testId="dataset.manage.sync"
              options={[
                { value: '', label: t('common.na'), disabled: true },
                { value: 'standard', label: t('dataset.manage.sync.standard') },
                { value: 'always', label: t('dataset.manage.sync.always') },
                { value: 'disabled', label: t('dataset.manage.sync.disabled') },
              ]}
            />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox
            checked={edit.atime ?? false}
            onChange={(value) => {
              setEdit((previous) => ({ ...previous, atime: value }));
              setEditAdvancedDirty(true);
            }}
            label={t('dataset.manage.field.atime')}
            testId="dataset.manage.atime"
          />
          <Checkbox
            checked={edit.relatime ?? false}
            onChange={(value) => {
              setEdit((previous) => ({ ...previous, relatime: value }));
              setEditAdvancedDirty(true);
            }}
            label={t('dataset.manage.field.relatime')}
            testId="dataset.manage.relatime"
          />
        </div>

        {showAdminControls ? (
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.sharenfs')}</div>
              <Input
                value={edit.sharenfs ?? ''}
                onChange={(event) => {
                  setEdit((previous) => ({ ...previous, sharenfs: event.target.value }));
                  setEditAdvancedDirty(true);
                }}
                placeholder="off"
                testId="dataset.manage.sharenfs"
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.admin_lock_type')}</div>
              <Select
                value={edit.adminLockType ?? ''}
                onChange={(event) => {
                  setEdit((previous) => ({
                    ...previous,
                    adminLockType: event.target.value as DatasetEditForm['adminLockType'],
                  }));
                  setEditAdvancedDirty(true);
                }}
                testId="dataset.manage.admin_lock_type"
                options={[
                  { value: '', label: t('common.na'), disabled: true },
                  { value: 'no_lock', label: t('dataset.manage.admin_lock.no_lock') },
                  { value: 'absolute', label: t('dataset.manage.admin_lock.absolute') },
                  { value: 'not_less', label: t('dataset.manage.admin_lock.not_less') },
                  { value: 'not_more', label: t('dataset.manage.admin_lock.not_more') },
                ]}
              />
            </label>
            <Checkbox
              checked={edit.adminOverride ?? false}
              onChange={(value) => {
                setEdit((previous) => ({ ...previous, adminOverride: value }));
                setEditAdvancedDirty(true);
              }}
              label={t('dataset.manage.field.admin_override')}
              testId="dataset.manage.admin_override"
            />
          </div>
        ) : null}
      </div>
    </details>
  );

  const createAdvancedFields = (
    <details
      className="rounded-lg border border-border bg-surface-2"
      data-testid="dataset.manage.create.advanced_properties"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setCreateForm((previous) => ({ ...previous, includeAdvanced: true }));
        }
      }}
    >
      <summary
        className="flex cursor-pointer select-none items-start justify-between gap-3 px-3 py-3"
        data-testid="dataset.manage.create.advanced_properties.summary"
      >
        <span>
          <span className="block text-sm font-medium text-fg">{t('filters.advanced.label')} ZFS</span>
          <span className="mt-1 block text-xs text-muted">
            {t('dataset.manage.field.recordsize')} · {t('dataset.manage.field.sync')} ·{' '}
            {t('dataset.manage.field.atime')} · {t('dataset.manage.field.relatime')}
          </span>
        </span>
        <Badge variant="neutral">{t('filters.advanced.label')}</Badge>
      </summary>
      <div className="space-y-4 border-t border-border px-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="text-xs font-medium text-muted">{t('dataset.manage.field.recordsize')}</div>
            <Input
              value={createForm.recordsizeKiB}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, recordsizeKiB: event.target.value }))}
              placeholder="128"
              testId="dataset.manage.create.recordsize"
            />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-muted">{t('dataset.manage.field.sync')}</div>
            <Select
              value={createForm.sync}
              onChange={(event) => setCreateForm((previous) => ({
                ...previous,
                sync: event.target.value as DatasetCreateForm['sync'],
              }))}
              testId="dataset.manage.create.sync"
              options={[
                { value: 'standard', label: t('dataset.manage.sync.standard') },
                { value: 'always', label: t('dataset.manage.sync.always') },
                { value: 'disabled', label: t('dataset.manage.sync.disabled') },
              ]}
            />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox
            checked={createForm.compression}
            onChange={(value) => setCreateForm((previous) => ({ ...previous, compression: value }))}
            label={t('dataset.manage.field.compression')}
            testId="dataset.manage.create.compression"
          />
          <Checkbox
            checked={createForm.atime}
            onChange={(value) => setCreateForm((previous) => ({ ...previous, atime: value }))}
            label={t('dataset.manage.field.atime')}
            testId="dataset.manage.create.atime"
          />
          <Checkbox
            checked={createForm.relatime}
            onChange={(value) => setCreateForm((previous) => ({ ...previous, relatime: value }))}
            label={t('dataset.manage.field.relatime')}
            testId="dataset.manage.create.relatime"
          />
        </div>

        {showAdminControls ? (
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.sharenfs')}</div>
              <Input
                value={createForm.sharenfs}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, sharenfs: event.target.value }))}
                placeholder="off"
                testId="dataset.manage.create.sharenfs"
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.admin_lock_type')}</div>
              <Select
                value={createForm.adminLockType}
                onChange={(event) => setCreateForm((previous) => ({
                  ...previous,
                  adminLockType: event.target.value as DatasetCreateForm['adminLockType'],
                }))}
                testId="dataset.manage.create.admin_lock_type"
                options={[
                  { value: 'no_lock', label: t('dataset.manage.admin_lock.no_lock') },
                  { value: 'absolute', label: t('dataset.manage.admin_lock.absolute') },
                  { value: 'not_less', label: t('dataset.manage.admin_lock.not_less') },
                  { value: 'not_more', label: t('dataset.manage.admin_lock.not_more') },
                ]}
              />
            </label>
            <Checkbox
              checked={createForm.adminOverride}
              onChange={(value) => setCreateForm((previous) => ({ ...previous, adminOverride: value }))}
              label={t('dataset.manage.field.admin_override')}
              testId="dataset.manage.create.admin_override"
            />
          </div>
        ) : null}
      </div>
    </details>
  );

  const fields = (
    <div className="space-y-4">
      {formError ? (
        <Alert title={t('dataset.manage.validation.title')} variant="danger">
          {formError}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="text-xs font-medium text-muted">{t('dataset.manage.field.quota')}</div>
          <Input
            value={edit.quotaGiB}
            onChange={(e) => setEdit((p) => ({ ...p, quotaGiB: e.target.value }))}
            placeholder="10"
            testId="dataset.manage.quota"
          />
        </label>
        <label className="block">
          <div className="text-xs font-medium text-muted">{t('dataset.manage.field.refquota')}</div>
          <Input
            value={edit.refquotaGiB}
            onChange={(e) => setEdit((p) => ({ ...p, refquotaGiB: e.target.value }))}
            placeholder="10"
            testId="dataset.manage.refquota"
          />
        </label>
      </div>

      {advancedFields}
    </div>
  );

  return (
    <Card testId="dataset.manage">
      <CardHeader
        title={t('dataset.manage.title')}
        subtitle={t('dataset.manage.subtitle')}
        actions={
          capabilities.canCreateSubdataset || capabilities.canDelete ? (
            <div className="flex flex-wrap gap-2">
              {capabilities.canCreateSubdataset ? (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  testId="dataset.manage.create.open"
                  disabled={!createGate.allowed}
                  disabledReason={!createGate.allowed ? createGate.reason : undefined}
                  onClick={() => {
                    setFormError(null);
                    setCreateOpen(true);
                  }}
                >
                  {t('dataset.manage.create.open')}
                </ActionButton>
              ) : null}
              {capabilities.canDelete ? (
                <ActionButton
                  variant="danger"
                  size="sm"
                  testId="dataset.manage.delete.open"
                  disabled={!deleteGate.allowed}
                  disabledReason={!deleteGate.allowed ? deleteGate.reason : undefined}
                  onClick={() => {
                    setDeleteOpen(true);
                  }}
                >
                  {t('common.delete')}
                </ActionButton>
              ) : null}
            </div>
          ) : null
        }
      />
      <CardBody>
        <div className="mb-4 text-xs text-muted">
          {t('dataset.manage.current', { dataset: datasetShortName(dataset), id: dataset.id })}
        </div>

        {fields}

        {updateM.isError ? (
          <div className="mt-4">
            <Alert title={t('dataset.manage.edit.error')} variant="danger">
              {String((updateM.error as any)?.message ?? updateM.error)}
            </Alert>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton
            loading={updateM.isPending}
            disabled={!updateGate.allowed}
            disabledReason={!updateGate.allowed ? updateGate.reason : undefined}
            onClick={submitUpdate}
            testId="dataset.manage.edit.submit"
          >
            {t('common.save')}
          </ActionButton>
        </div>
      </CardBody>

      <Modal open={createOpen} onClose={closeCreate} title={t('dataset.manage.create.title')}>
        <div className="space-y-4" data-testid="dataset.manage.create.modal">
          <label className="block">
            <div className="text-xs font-medium text-muted">{t('dataset.manage.field.child_name')}</div>
            <Input
              value={createForm.name}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="data"
              testId="dataset.manage.create.name"
            />
          </label>
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
            {t('dataset.manage.create.scope', { dataset: objectLabel })}
          </div>
          <Checkbox
            checked={createForm.automount}
            onChange={(value) => setCreateForm((previous) => ({ ...previous, automount: value }))}
            label={t('dataset.manage.field.automount')}
            testId="dataset.manage.create.automount"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.quota')}</div>
              <Input
                value={createForm.quotaGiB}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, quotaGiB: event.target.value }))}
                placeholder="10"
                testId="dataset.manage.create.quota"
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-muted">{t('dataset.manage.field.refquota')}</div>
              <Input
                value={createForm.refquotaGiB}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, refquotaGiB: event.target.value }))}
                placeholder="10"
                testId="dataset.manage.create.refquota"
              />
            </label>
          </div>
          {createAdvancedFields}
          {createM.isError ? (
            <Alert title={t('dataset.manage.create.error')} variant="danger">
              {String((createM.error as any)?.message ?? createM.error)}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeCreate}>
              {t('common.cancel')}
            </Button>
            <ActionButton
              loading={createM.isPending}
              disabled={!createForm.name.trim() || !createGate.allowed}
              onClick={submitCreate}
              testId="dataset.manage.create.submit"
            >
              {t('common.create')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        testId="dataset.manage.delete.confirm"
        danger
        title={t('dataset.manage.delete.title')}
        description={t('dataset.manage.delete.description', { dataset: objectLabel })}
        confirmLabel={t('common.delete')}
        confirmLoading={deleteM.isPending}
        confirmDisabled={!deleteGate.allowed}
        onCancel={() => {
          setDeleteOpen(false);
        }}
        onConfirm={() => {
          deleteM.mutate();
        }}
      >
        {deleteM.isError ? (
          <Alert title={t('dataset.manage.delete.error')} variant="danger">
            {String((deleteM.error as any)?.message ?? deleteM.error)}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}

function TransactionsCard(props: {
  chainsLoading: boolean;
  chainsError: unknown | null;
  chains: TransactionChain[];
}) {
  const { t } = useI18n();
  const { basePath } = useAppMode();

  const sorted = useMemo(() => {
    const list = [...(props.chains ?? [])];
    list.sort((a, b) => Number(b.id) - Number(a.id));
    return list;
  }, [props.chains]);

  return (
    <Card testId="dataset.overview.transactions">
      <CardHeader
        title={t('dataset.overview.transactions.title')}
        subtitle={t('dataset.overview.transactions.subtitle')}
        actions={
          <ChipLink to={`${basePath}/transactions`} title={t('dataset.overview.transactions.open_chains_title')}>
            {t('dataset.overview.transactions.open_chains')}
          </ChipLink>
        }
      />
      <CardBody>
        {props.chainsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t('common.loading')}
          </div>
        ) : props.chainsError ? (
          <Alert title={t('dataset.overview.transactions.load_error.title')} variant="danger">
            {t('dataset.overview.transactions.load_error.body')}
          </Alert>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-muted">{t('dataset.overview.transactions.empty')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((c) => {
              const b = chainBadgeFromState(c.state, t);
              const label = c.label ? String(c.label) : `#${c.id}`;
              const isError = isFailedChainState(c.state);
              const prog = chainProgressLabel(c, t);
              return (
                <li
                  key={c.id}
                  className={
                    'flex flex-wrap items-center justify-between gap-3 py-3 ' +
                    (isError ? 'rounded-md bg-danger-bg px-2 -mx-2' : '')
                  }
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">
                      <Link className="text-accent hover:underline" to={`${basePath}/transactions/${c.id}`}>
                        {label}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      #{c.id} · {formatDateTime((c as any).created_at)}
                      {prog ? <> · {prog}</> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ChipLink
                      to={`${basePath}/transactions/items?transaction_chain=${c.id}`}
                      title={t('dataset.overview.transactions.open_items_title', { id: c.id })}
                    >
                      {t('dataset.overview.transactions.open_items')}
                    </ChipLink>
                    <Badge variant={b.variant}>{b.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function DatasetOverviewPage() {
  const { dataset, chains, chainsLoading, chainsError } = useDatasetContext();

  return (
    <div className="space-y-6" data-testid="dataset.overview">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SpaceCard dataset={dataset as any} />
          <DatasetManagementCard />
        </div>
        <div className="space-y-6">
          <TemporaryExpansionCard dataset={dataset as any} />
        </div>
      </div>

      <TransactionsCard chains={chains} chainsLoading={chainsLoading} chainsError={chainsError} />
    </div>
  );
}
