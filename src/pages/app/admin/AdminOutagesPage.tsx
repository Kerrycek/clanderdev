import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useAuth } from '../../../app/auth';
import { useToasts } from '../../../app/toasts';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { KeysetPagination } from '../../../components/ui/KeysetPagination';
import { LinkButton } from '../../../components/ui/LinkButton';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { TableCard } from '../../../components/ui/TableCard';
import { Textarea } from '../../../components/ui/Textarea';
import { formatErrorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { parsePositiveInt } from '../../../lib/parse';
import { formatDurationMinutes } from '../../../lib/time';
import { outageImpactLabel, outageTypeLabel } from '../../../lib/apiValues';
import { outageBadges } from '../../../lib/outageBadges';
import { pickLocalizedField } from '../../../lib/translations';
import { fetchOutage, fetchOutageUpdates } from '../../../lib/api/public';
import type { Outage, OutageEntity } from '../../../lib/api/public';
import { fetchSecurityAdvisoryOutageLinks } from '../../../lib/api/securityAdvisoryRelations';
import {
  applyOutageSystems,
  createOutageWithSystems,
  createOutageUpdate,
  fetchAllOutageEntities,
  fetchAllOutageHandlers,
  fetchAdminOutages,
  fetchExportOutages,
  fetchUserOutages,
  fetchVpsOutages,
  OutageCreateIndeterminateError,
  OutageCreateWithSystemsError,
  OutageSystemsApplyError,
  outageHandlerUserId,
  outageStateTransitionPayload,
  updateOutage,
  type OutageAdminState,
  type OutageAdminType,
  type OutagePayload,
  type OutageUpdatePayload,
} from '../../../lib/api/outages';
import { OutageScopeEditor } from './OutageScopeEditor';
import { OutageListSection } from './OutageListSection';
import { OutageAffectedTables } from './OutageAffectedTables';
import { OutageAdvisoriesCard } from './OutageAdvisoriesCard';
import { OutageCreateIndeterminateAlert } from './OutageCreateIndeterminateAlert';
import { OutageUpdatesCard } from './OutageUpdatesCard';
import {
  desiredOutageSystems,
  fromOutageDateTimeInput,
  groupOutages,
  initOutageSystemsForm,
  toOutageDateTimeInput,
  type OutageSystemsFormState,
} from './outageAdminModel';

type OutageFormState = {
  beginsAt: string;
  finishedAt: string;
  duration: string;
  type: OutageAdminType;
  impact: string;
  state: string;
  autoResolve: boolean;
  enSummary: string;
  enDescription: string;
  csSummary: string;
  csDescription: string;
  sendMail: boolean;
};

type OutageFormErrors = Partial<Record<'beginsAt' | 'duration' | 'type' | 'impact' | 'enSummary' | 'csSummary', string>>;

const OUTAGE_TYPES: OutageAdminType[] = ['planned_outage', 'unplanned_outage'];
const IMPACTS = ['tbd', 'performance', 'network', 'system_restart', 'system_reset', 'unavailability', 'export'];
const STATES: OutageAdminState[] = ['staged', 'announced', 'cancelled', 'resolved'];

function entityLabel(ent: OutageEntity): string {
  return ent.label || `${ent.name}${ent.entity_id ? ` #${ent.entity_id}` : ''}`;
}

function initOutageForm(outage?: Outage): OutageFormState {
  const x: any = outage ?? {};
  return {
    beginsAt: toOutageDateTimeInput(x.begins_at) || toOutageDateTimeInput(new Date().toISOString()),
    finishedAt: toOutageDateTimeInput(x.finished_at),
    duration: x.duration != null ? String(x.duration) : '',
    type: typeof x.type === 'string' && OUTAGE_TYPES.includes(x.type as OutageAdminType)
      ? x.type as OutageAdminType
      : 'planned_outage',
    impact: typeof x.impact === 'string' ? x.impact : 'tbd',
    state: typeof x.state === 'string' ? x.state : 'staged',
    autoResolve: outage ? Boolean(x.auto_resolve) : true,
    enSummary: typeof x.en_summary === 'string' ? x.en_summary : '',
    enDescription: typeof x.en_description === 'string' ? x.en_description : '',
    csSummary: typeof x.cs_summary === 'string' ? x.cs_summary : '',
    csDescription: typeof x.cs_description === 'string' ? x.cs_description : '',
    sendMail: true,
  };
}

function formPayload(form: OutageFormState, includeState = false): OutagePayload {
  const duration = form.duration.trim() ? Number(form.duration) : null;
  const payload: OutagePayload = {
    begins_at: fromOutageDateTimeInput(form.beginsAt),
    finished_at: fromOutageDateTimeInput(form.finishedAt),
    duration: Number.isFinite(duration) ? duration : null,
    type: form.type,
    impact: form.impact,
    auto_resolve: form.autoResolve,
    en_summary: form.enSummary,
    en_description: form.enDescription,
    cs_summary: form.csSummary,
    cs_description: form.csDescription,
  };
  if (includeState) payload.state = form.state;
  return payload;
}

function updatePayload(
  form: OutageFormState,
  outageId: number,
  currentState?: string
): OutageUpdatePayload {
  const duration = form.duration.trim() ? Number(form.duration) : null;
  return {
    outage: outageId,
    send_mail: form.sendMail,
    begins_at: fromOutageDateTimeInput(form.beginsAt),
    finished_at: fromOutageDateTimeInput(form.finishedAt),
    duration: Number.isFinite(duration) ? duration : null,
    impact: form.impact,
    state: form.state !== currentState ? form.state : undefined,
    en_summary: form.enSummary || undefined,
    en_description: form.enDescription || undefined,
    cs_summary: form.csSummary || undefined,
    cs_description: form.csDescription || undefined,
  };
}

function outageScopeErrorMessage(
  error: unknown,
  t: (key: any, vars?: any) => string
): string {
  if (error instanceof OutageCreateWithSystemsError) {
    return t(error.rollbackSucceeded
      ? 'admin.outages.create.scope_failed_restored'
      : 'admin.outages.create.scope_failed_partial', { id: error.outageId });
  }
  if (error instanceof OutageSystemsApplyError) {
    return t(error.rollbackSucceeded
      ? 'admin.outages.systems.error_restored'
      : 'admin.outages.systems.error_partial');
  }
  return formatErrorMessage(error);
}

function validateOutageForm(form: OutageFormState, t: (key: any, vars?: any) => string, opts?: { requireType?: boolean }) {
  const errors: OutageFormErrors = {};
  if (!form.beginsAt.trim() || !Number.isFinite(new Date(form.beginsAt).getTime())) errors.beginsAt = t('admin.outages.validation.begins_at');
  const duration = Number(form.duration);
  if (!form.duration.trim() || !Number.isFinite(duration) || duration <= 0) errors.duration = t('admin.outages.validation.duration');
  if (opts?.requireType !== false && !OUTAGE_TYPES.includes(form.type)) errors.type = t('admin.outages.validation.type');
  if (!IMPACTS.includes(form.impact)) errors.impact = t('admin.outages.validation.impact');
  if (!form.enSummary.trim()) errors.enSummary = t('admin.outages.validation.en_summary');
  if (!form.csSummary.trim()) errors.csSummary = t('admin.outages.validation.cs_summary');
  return errors;
}

function hasErrors(errors: OutageFormErrors) {
  return Object.keys(errors).length > 0;
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mt-1 text-xs text-danger">{message}</div>;
}

function FieldLabel(props: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{props.label}</span>
      {props.children}
    </label>
  );
}

function OutageForm(props: {
  form: OutageFormState;
  setForm: React.Dispatch<React.SetStateAction<OutageFormState>>;
  errors?: OutageFormErrors;
  includeState?: boolean;
  updateMode?: boolean;
}) {
  const { t } = useI18n();
  const { form, setForm, errors = {} } = props;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel label={t('admin.outages.field.begins_at')}>
            <Input testId="admin.outages.form.begins_at" type="datetime-local" value={form.beginsAt} onChange={(e) => setForm((p) => ({ ...p, beginsAt: e.target.value }))} />
          </FieldLabel>
          <ErrorText message={errors.beginsAt} />
        </div>
        <FieldLabel label={t('admin.outages.field.finished_at')}>
          <Input testId="admin.outages.form.finished_at" type="datetime-local" value={form.finishedAt} onChange={(e) => setForm((p) => ({ ...p, finishedAt: e.target.value }))} />
        </FieldLabel>
        <div>
          <FieldLabel label={t('admin.outages.field.duration')}>
            <Input testId="admin.outages.form.duration" inputMode="numeric" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))} />
          </FieldLabel>
          <ErrorText message={errors.duration} />
        </div>
        <div>
          <FieldLabel label={t('admin.outages.field.impact')}>
            <Select testId="admin.outages.form.impact" value={form.impact} onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value }))} options={IMPACTS.map((v) => ({ value: v, label: outageImpactLabel(t, v) }))} />
          </FieldLabel>
          <ErrorText message={errors.impact} />
        </div>
        {!props.updateMode ? (
          <div>
            <FieldLabel label={t('admin.outages.field.type')}>
              <Select testId="admin.outages.form.type" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as OutageAdminType }))} options={OUTAGE_TYPES.map((v) => ({ value: v, label: outageTypeLabel(t, v) }))} />
            </FieldLabel>
            <ErrorText message={errors.type} />
          </div>
        ) : null}
        {props.includeState ? (
          <FieldLabel label={t('admin.outages.field.state')}>
            <Select testId="admin.outages.form.state" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} options={STATES.map((v) => ({ value: v, label: t(`admin.outages.state.${v}`) }))} />
          </FieldLabel>
        ) : null}
      </div>
      {!props.updateMode ? (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={form.autoResolve} onChange={(e) => setForm((p) => ({ ...p, autoResolve: e.target.checked }))} />
          {t('admin.outages.field.auto_resolve')}
        </label>
      ) : (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={form.sendMail} onChange={(e) => setForm((p) => ({ ...p, sendMail: e.target.checked }))} />
          {t('admin.outages.field.send_mail')}
        </label>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel label={t('admin.outages.field.en_summary')}>
            <Input testId="admin.outages.form.en_summary" value={form.enSummary} onChange={(e) => setForm((p) => ({ ...p, enSummary: e.target.value }))} />
          </FieldLabel>
          <ErrorText message={errors.enSummary} />
        </div>
        <div>
          <FieldLabel label={t('admin.outages.field.cs_summary')}>
            <Input testId="admin.outages.form.cs_summary" value={form.csSummary} onChange={(e) => setForm((p) => ({ ...p, csSummary: e.target.value }))} />
          </FieldLabel>
          <ErrorText message={errors.csSummary} />
        </div>
        <Textarea testId="admin.outages.form.en_description" value={form.enDescription} onChange={(e) => setForm((p) => ({ ...p, enDescription: e.target.value }))} label={t('admin.outages.field.en_description')} rows={4} />
        <Textarea testId="admin.outages.form.cs_description" value={form.csDescription} onChange={(e) => setForm((p) => ({ ...p, csDescription: e.target.value }))} label={t('admin.outages.field.cs_description')} rows={4} />
      </div>
    </div>
  );
}

function OutageReviewSummary(props: {
  form: OutageFormState;
  systems?: OutageSystemsFormState;
  showState?: boolean;
}) {
  const { t } = useI18n();
  const { form, systems } = props;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-muted">{t('admin.outages.field.type')}</dt><dd>{outageTypeLabel(t, form.type)}</dd></div>
      <div><dt className="text-xs text-muted">{t('admin.outages.field.impact')}</dt><dd>{outageImpactLabel(t, form.impact)}</dd></div>
      <div><dt className="text-xs text-muted">{t('admin.outages.field.begins_at')}</dt><dd>{formatDateTime(fromOutageDateTimeInput(form.beginsAt))}</dd></div>
      <div><dt className="text-xs text-muted">{t('admin.outages.field.duration')}</dt><dd>{form.duration} min</dd></div>
      {form.finishedAt ? <div><dt className="text-xs text-muted">{t('admin.outages.field.finished_at')}</dt><dd>{formatDateTime(fromOutageDateTimeInput(form.finishedAt))}</dd></div> : null}
      {props.showState ? <div><dt className="text-xs text-muted">{t('admin.outages.field.state')}</dt><dd>{t(`admin.outages.state.${form.state}`)}</dd></div> : null}
      <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.outages.field.en_summary')}</dt><dd>{form.enSummary || '—'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.outages.field.cs_summary')}</dt><dd>{form.csSummary || '—'}</dd></div>
      {systems ? (
        <>
          <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.outages.systems.preview.scope')}</dt><dd>{systems.scope.map((item) => item.label).join(', ') || t('admin.outages.systems.none_selected')}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted">{t('admin.outages.systems.handlers')}</dt><dd>{systems.handlers.map((item) => item.label).join(', ') || t('admin.outages.empty.handlers')}</dd></div>
        </>
      ) : null}
    </dl>
  );
}

export function AdminOutagesPage() {
  const params = useParams();
  const outageId = parsePositiveInt(params['outageId']);
  if (params['outageId']) return <AdminOutageDetailPage outageId={outageId} />;
  return <AdminOutageListPage />;
}

function AdminOutageListPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const canMutate = auth.role === 'admin';
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(searchParams.get('state') ?? '');
  const [type, setType] = useState(searchParams.get('type') ?? '');
  const vpsFilter = useMemo(() => parsePositiveInt(searchParams.get('vps')), [searchParams]);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(() => initOutageForm());
  const [systemsForm, setSystemsForm] = useState<OutageSystemsFormState>(() => initOutageSystemsForm([], []));
  const [formErrors, setFormErrors] = useState<OutageFormErrors>({});
  const [createReviewOpen, setCreateReviewOpen] = useState(false);
  const [createOutcomeUnknown, setCreateOutcomeUnknown] = useState(false);
  const [verifyingCreate, setVerifyingCreate] = useState(false);

  const pagination = useKeysetPagination({
    id: 'admin.outages',
    filterKey: JSON.stringify({ state, type, vps: vpsFilter }),
    searchParams,
    setSearchParams,
    defaultLimit: 25,
  });

  const outagesQ = useQuery({
    queryKey: ['admin_outages', 'index', { state, type, vps: vpsFilter, limit: pagination.limit, fromId: pagination.fromId }],
    queryFn: async () => (await fetchAdminOutages({ state: state || undefined, type: type || undefined, vps: vpsFilter, limit: pagination.limit, fromId: pagination.fromId })).data,
  });

  const createM = useMutation({
    mutationFn: async () => {
      if (!canMutate) throw new Error('Administrator role required');
      return createOutageWithSystems(formPayload(form), desiredOutageSystems(systemsForm));
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['admin_outages'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.created') });
      setCreateReviewOpen(false);
      setNewOpen(false);
      navigate(`/admin/outages/${res.data.id}`);
    },
    onError: async (error) => {
      if (error instanceof OutageCreateIndeterminateError) {
        setCreateReviewOpen(false);
        setNewOpen(false);
        setCreateOutcomeUnknown(true);
        pushToast({
          variant: 'danger',
          title: t('admin.outages.create.indeterminate_title'),
          body: t('admin.outages.create.indeterminate_body'),
        });
        return;
      }
      if (error instanceof OutageCreateWithSystemsError) {
        await qc.invalidateQueries({ queryKey: ['admin_outages'] });
        pushToast({
          variant: 'danger',
          title: t('common.error'),
          body: outageScopeErrorMessage(error, t),
        });
        setCreateReviewOpen(false);
        setNewOpen(false);
        navigate(`/admin/outages/${error.outageId}`);
        return;
      }
      pushToast({
        variant: 'danger',
        title: t('common.error'),
        body: formatErrorMessage(error),
      });
    },
  });

  const submitCreate = () => {
    if (!canMutate || createOutcomeUnknown) return;
    const errors = validateOutageForm(form, t);
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    setCreateReviewOpen(true);
  };

  const rows = outagesQ.data ?? [];
  const groupedRows = groupOutages(rows);

  const verifyIndeterminateCreate = async () => {
    setVerifyingCreate(true);
    const result = await outagesQ.refetch();
    setVerifyingCreate(false);
    if (!result.isError) setCreateOutcomeUnknown(false);
  };

  return (
    <div className="space-y-6" data-testid="admin.outages.page">
      <PageHeader
        title={t('admin.outages.title')}
        description={t('admin.outages.subtitle')}
        actions={canMutate ? <Button disabled={createOutcomeUnknown} onClick={() => { setForm(initOutageForm()); setSystemsForm(initOutageSystemsForm([], [])); setFormErrors({}); setNewOpen(true); }} testId="admin.outages.new">{t('admin.outages.action.new')}</Button> : null}
      />
      {createOutcomeUnknown ? <OutageCreateIndeterminateAlert loading={verifyingCreate} onVerify={verifyIndeterminateCreate} /> : null}
      <Card>
        <CardBody>
          {vpsFilter ? <Alert title={t('admin.outages.filter.vps', { id: vpsFilter })} variant="info" /> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <FieldLabel label={t('admin.outages.field.state')}>
              <Select value={state} onChange={(e) => setState(e.target.value)} options={[{ value: '', label: t('common.all') }, ...STATES.map((v) => ({ value: v, label: t(`admin.outages.state.${v}`) }))]} />
            </FieldLabel>
            <FieldLabel label={t('admin.outages.field.type')}>
              <Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: t('common.all') }, ...OUTAGE_TYPES.map((v) => ({ value: v, label: outageTypeLabel(t, v) }))]} />
            </FieldLabel>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => outagesQ.refetch()}>{t('common.refresh')}</Button>
            </div>
          </div>
        </CardBody>
      </Card>
      {outagesQ.isLoading ? (
        <LoadingState />
      ) : outagesQ.isError ? (
        <ErrorState title={t('admin.outages.error.title')} message={formatErrorMessage(outagesQ.error)} onRetry={() => outagesQ.refetch()} />
      ) : <div className="space-y-5">
        <OutageListSection group="active" rows={groupedRows.active} />
        <OutageListSection group="planned" rows={groupedRows.planned} />
        <OutageListSection group="finished" rows={groupedRows.finished} />
      </div>}
      <KeysetPagination
        testId="admin.outages.pagination"
        page={pagination.page}
        pageCount={pagination.pageCount}
        canPrev={pagination.canPrev}
        canNext={pagination.hasForward || rows.length >= pagination.limit}
        onPrev={pagination.goPrev}
        onNext={() => pagination.goNext(rows[rows.length - 1]?.id)}
        onGoToPage={pagination.goToPage}
        limit={pagination.limit}
        allowedLimits={pagination.allowedLimits}
        onLimitChange={pagination.setLimit}
      />

      <Modal open={newOpen} title={t('admin.outages.create.title')} onClose={() => setNewOpen(false)} size="lg" testId="admin.outages.create.modal" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setNewOpen(false)} disabled={createM.isPending}>{t('common.cancel')}</Button>
          <Button onClick={submitCreate} loading={createM.isPending} testId="admin.outages.create.save">{t('admin.outages.action.review')}</Button>
        </div>
      }>
        {hasErrors(formErrors) ? <Alert variant="warn" title={t('common.validation_error')} testId="admin.outages.create.validation">{t('admin.outages.validation.body')}</Alert> : null}
        <div className="mt-4 space-y-6">
          <OutageForm form={form} setForm={setForm} errors={formErrors} />
          <div>
            <div className="mb-3 text-sm font-semibold text-fg">{t('admin.outages.section.systems')}</div>
            <OutageScopeEditor form={systemsForm} setForm={setSystemsForm} />
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={createReviewOpen}
        testId="admin.outages.create.confirm"
        title={t('admin.outages.create.confirm_title')}
        description={t('admin.outages.create.confirm_body')}
        confirmLabel={t('common.create')}
        confirmLoading={createM.isPending}
        onCancel={() => setCreateReviewOpen(false)}
        onConfirm={() => createM.mutate()}
      >
        <OutageReviewSummary form={form} systems={systemsForm} />
      </ConfirmDialog>
    </div>
  );
}

function AdminOutageDetailPage({ outageId }: { outageId: number | undefined }) {
  const { t, preferredLanguageCodes } = useI18n();
  const auth = useAuth();
  const canMutate = auth.role === 'admin';
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [form, setForm] = useState(() => initOutageForm());
  const [systemsForm, setSystemsForm] = useState<OutageSystemsFormState>(() => initOutageSystemsForm([], []));
  const [formErrors, setFormErrors] = useState<OutageFormErrors>({});
  const [stateWarning, setStateWarning] = useState('');
  const [confirmState, setConfirmState] = useState<OutageAdminState | null>(null);
  const [attrsReviewOpen, setAttrsReviewOpen] = useState(false);
  const [updateReviewOpen, setUpdateReviewOpen] = useState(false);
  const [systemsReviewOpen, setSystemsReviewOpen] = useState(false);

  const enabled = Boolean(outageId);
  const outageQ = useQuery({ queryKey: ['outages', 'show', outageId], queryFn: async () => (await fetchOutage(outageId!)).data, enabled });
  const entitiesQ = useQuery({ queryKey: ['outages', outageId, 'entities'], queryFn: async () => fetchAllOutageEntities(outageId!), enabled });
  const handlersQ = useQuery({ queryKey: ['outages', outageId, 'handlers'], queryFn: async () => fetchAllOutageHandlers(outageId!), enabled });
  const updatesQ = useQuery({ queryKey: ['outages', outageId, 'updates'], queryFn: async () => (await fetchOutageUpdates(outageId!)).data, enabled });
  const usersQ = useQuery({ queryKey: ['outages', outageId, 'affected_users'], queryFn: async () => (await fetchUserOutages(outageId!)).data, enabled });
  const vpsQ = useQuery({ queryKey: ['outages', outageId, 'affected_vps'], queryFn: async () => (await fetchVpsOutages(outageId!)).data, enabled });
  const exportsQ = useQuery({ queryKey: ['outages', outageId, 'affected_exports'], queryFn: async () => (await fetchExportOutages(outageId!)).data, enabled });
  const advisoriesQ = useQuery({
    queryKey: ['outages', outageId, 'security_advisories'],
    queryFn: async () => (await fetchSecurityAdvisoryOutageLinks({ outageId: outageId!, limit: 100, includes: 'security_advisory' })).data,
    enabled,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['outages', outageId] });
    await qc.invalidateQueries({ queryKey: ['admin_outages'] });
  };

  const saveAttrsM = useMutation({
    mutationFn: async () => {
      if (!canMutate) throw new Error('Administrator role required');
      return updateOutage(outageId!, formPayload(form));
    },
    onSuccess: async () => {
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.outages.toast.saved') });
      setAttrsReviewOpen(false);
      setEditOpen(false);
    },
    onError: (e) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) }),
  });

  const submitAttrs = () => {
    const errors = validateOutageForm(form, t);
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    setAttrsReviewOpen(true);
  };

  const postUpdateM = useMutation({
    mutationFn: async (payload?: OutageUpdatePayload) => {
      if (!canMutate) throw new Error('Administrator role required');
      return createOutageUpdate(payload ?? updatePayload(form, outageId!, outageQ.data?.state));
    },
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'updates'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.update_posted') });
      setUpdateReviewOpen(false);
      setUpdateOpen(false);
      setConfirmState(null);
    },
    onError: (error) => pushToast({
      variant: 'danger',
      title: t('common.error'),
      body: formatErrorMessage(error),
    }),
  });

  const submitUpdate = () => {
    const errors = validateOutageForm(form, t, { requireType: false });
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    setUpdateReviewOpen(true);
  };

  const saveSystemsM = useMutation({
    mutationFn: async () => {
      if (!canMutate) throw new Error('Administrator role required');
      await applyOutageSystems(outageId!, desiredOutageSystems(systemsForm));
    },
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'entities'] });
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'handlers'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.systems_saved') });
      setSystemsReviewOpen(false);
      setSystemsOpen(false);
    },
    onError: async (error) => {
      await invalidate();
      const [entitiesResult, handlersResult] = await Promise.all([
        entitiesQ.refetch(),
        handlersQ.refetch(),
      ]);
      if (entitiesResult.data && handlersResult.data) {
        setSystemsForm(initOutageSystemsForm(
          entitiesResult.data,
          handlersResult.data
        ));
      }
      pushToast({
        variant: 'danger',
        title: t('common.error'),
        body: outageScopeErrorMessage(error, t),
      });
    },
  });

  if (!outageId) return <ErrorState title={t('admin.outages.invalid.title')} message={t('admin.outages.invalid.body')} />;
  if (outageQ.isLoading) return <LoadingState />;
  if (outageQ.isError || !outageQ.data) return <ErrorState title={t('admin.outages.error.detail_title')} message={formatErrorMessage(outageQ.error)} onRetry={() => outageQ.refetch()} />;

  const outage = outageQ.data;
  const badges = outageBadges(outage, t);
  const entities = entitiesQ.data ?? [];
  const handlers = handlersQ.data ?? [];
  const summary = pickLocalizedField(outage, 'summary', preferredLanguageCodes)
    ?? t('public.outage.fallback_title', { id: outage.id });
  const description = pickLocalizedField(outage, 'description', preferredLanguageCodes);

  const openEdit = () => {
    if (!canMutate) return;
    setForm(initOutageForm(outage));
    setFormErrors({});
    setEditOpen(true);
  };
  const openUpdate = () => {
    if (!canMutate) return;
    setForm({ ...initOutageForm(outage), enSummary: '', enDescription: '', csSummary: '', csDescription: '', sendMail: true });
    setFormErrors({});
    setUpdateOpen(true);
  };
  const openSystems = () => {
    if (!canMutate) return;
    setSystemsForm(initOutageSystemsForm(entities, handlers));
    setSystemsOpen(true);
  };
  const requestStateChange = (st: OutageAdminState) => {
    if (!canMutate) return;
    setStateWarning('');
    if (st === 'announced' && (entities.length === 0 || handlers.length === 0)) {
      setStateWarning(t('admin.outages.change_state.announce_blocked'));
      return;
    }
    setConfirmState(st);
  };

  return (
    <div className="space-y-6" data-testid="admin.outages.detail.page">
      <PageHeader
        title={summary}
        description={`#${outage.id}`}
        actions={
          <>
            <LinkButton to="/admin/outages" variant="secondary">{t('admin.outages.back')}</LinkButton>
            {canMutate ? <>
              <Button variant="secondary" onClick={openEdit} testId="admin.outages.detail.edit_attrs">{t('admin.outages.action.edit_attrs')}</Button>
              <Button variant="secondary" onClick={openSystems} testId="admin.outages.detail.edit_systems">{t('admin.outages.action.edit_systems')}</Button>
              <Button onClick={openUpdate} testId="admin.outages.detail.post_update">{t('admin.outages.action.post_update')}</Button>
            </> : null}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge>
        {badges.type ? <Badge variant={badges.type.variant}>{badges.type.label}</Badge> : null}
        {badges.impact ? <Badge variant={badges.impact.variant}>{badges.impact.label}</Badge> : null}
      </div>

      {description ? <Alert variant="info" title={t('admin.outages.section.reason')}>{description}</Alert> : null}

      {canMutate && outage.state === 'staged' ? (
        <Card>
          <CardHeader title={t('admin.outages.change_state.title')} />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {(['announced', 'cancelled', 'resolved'] satisfies OutageAdminState[]).map((st) => (
                <Button key={st} variant={st === 'cancelled' ? 'danger' : 'secondary'} onClick={() => requestStateChange(st)} testId={`admin.outages.change_state.${st}`}>
                  {t(`admin.outages.change_state.${st}`)}
                </Button>
              ))}
            </div>
            {stateWarning ? <div className="mt-3"><Alert variant="warn" title={t('common.validation_error')}>{stateWarning}</Alert></div> : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('admin.outages.section.info')} />
          <CardBody>
            <dl className="grid gap-3 md:grid-cols-2">
              <div><dt className="text-xs font-semibold text-muted">{t('admin.outages.field.begins_at')}</dt><dd>{formatDateTime(outage.begins_at)}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">{t('admin.outages.field.finished_at')}</dt><dd>{outage.finished_at ? formatDateTime(outage.finished_at) : '—'}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">{t('admin.outages.field.duration')}</dt><dd>{outage.duration != null ? formatDurationMinutes(outage.duration as any) : '—'}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">{t('admin.outages.field.auto_resolve')}</dt><dd>{outage.auto_resolve ? t('common.yes') : t('common.no')}</dd></div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('admin.outages.section.affected_counts')} />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>{t('admin.outages.field.users')}: <span className="font-mono">{outage.affected_user_count ?? '—'}</span></div>
              <div>{t('admin.outages.field.direct_vps')}: <span className="font-mono">{outage.affected_direct_vps_count ?? '—'}</span></div>
              <div>{t('admin.outages.field.indirect_vps')}: <span className="font-mono">{outage.affected_indirect_vps_count ?? '—'}</span></div>
              <div>{t('admin.outages.field.exports')}: <span className="font-mono">{outage.affected_export_count ?? '—'}</span></div>
            </div>
            <div className="mt-3 text-xs text-muted">{t('admin.outages.affected_counts.help')}</div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('admin.outages.section.systems')} />
        <CardBody>
          {entitiesQ.isLoading ? <Spinner label={t('common.loading')} /> : entities.length ? (
            <div className="flex flex-wrap gap-2">{entities.map((entity) => {
              const label = entityLabel(entity);
              return entity.name === 'Node' && entity.entity_id ? (
                <Link key={entity.id} className="inline-flex" to={`/admin/nodes/${entity.entity_id}`}><Badge variant="neutral">{label}</Badge></Link>
              ) : <Badge key={entity.id} variant="neutral">{label}</Badge>;
            })}</div>
          ) : <div className="text-sm text-muted">{t('admin.outages.empty.systems')}</div>}
          <div className="mt-4 text-sm text-muted">{handlers.length ? handlers.map((h) => h.full_name || h.reporter_name || `#${outageHandlerUserId(h) ?? h.id}`).join(', ') : t('admin.outages.empty.handlers')}</div>
        </CardBody>
      </Card>

      <OutageAdvisoriesCard links={advisoriesQ.data ?? []} />

      <OutageAffectedTables
        usersQ={usersQ}
        vpsQ={vpsQ}
        exportsQ={exportsQ}
        userTotal={outage.affected_user_count}
        vpsTotal={(outage.affected_direct_vps_count != null || outage.affected_indirect_vps_count != null)
          ? (outage.affected_direct_vps_count ?? 0) + (outage.affected_indirect_vps_count ?? 0)
          : undefined}
        exportTotal={outage.affected_export_count}
      />

      <OutageUpdatesCard
        updates={updatesQ.data}
        loading={updatesQ.isLoading}
        preferredLanguageCodes={preferredLanguageCodes}
      />

      <Modal open={editOpen} title={t('admin.outages.edit.title')} onClose={() => setEditOpen(false)} size="lg" testId="admin.outages.edit.modal" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saveAttrsM.isPending}>{t('common.cancel')}</Button><Button onClick={submitAttrs} loading={saveAttrsM.isPending} testId="admin.outages.edit.save">{t('common.save')}</Button></div>}>
        <Alert title={t('admin.outages.edit.notice.title')} variant="info">{t('admin.outages.edit.notice.body')}</Alert>
        {hasErrors(formErrors) ? <div className="mt-4"><Alert variant="warn" title={t('common.validation_error')}>{t('admin.outages.validation.body')}</Alert></div> : null}
        {saveAttrsM.isError ? <div className="mt-4"><Alert variant="danger" title={t('common.error')} testId="admin.outages.edit.error">{formatErrorMessage(saveAttrsM.error)}</Alert></div> : null}
        <div className="mt-4"><OutageForm form={form} setForm={setForm} errors={formErrors} /></div>
      </Modal>

      <Modal open={updateOpen} title={t('admin.outages.update.title')} onClose={() => setUpdateOpen(false)} size="lg" testId="admin.outages.update.modal" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setUpdateOpen(false)} disabled={postUpdateM.isPending}>{t('common.cancel')}</Button><Button onClick={submitUpdate} loading={postUpdateM.isPending} testId="admin.outages.update.save">{t('admin.outages.action.post_update')}</Button></div>}>
        {hasErrors(formErrors) ? <Alert variant="warn" title={t('common.validation_error')}>{t('admin.outages.validation.body')}</Alert> : null}
        {postUpdateM.isError ? <div className="mt-4"><Alert variant="danger" title={t('common.error')} testId="admin.outages.update.error">{formatErrorMessage(postUpdateM.error)}</Alert></div> : null}
        <div className="mt-4"><OutageForm form={form} setForm={setForm} errors={formErrors} includeState updateMode /></div>
      </Modal>

      <Modal open={systemsOpen} title={t('admin.outages.systems.title')} onClose={() => setSystemsOpen(false)} size="lg" testId="admin.outages.systems.modal" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSystemsOpen(false)} disabled={saveSystemsM.isPending}>{t('common.cancel')}</Button><Button onClick={() => setSystemsReviewOpen(true)} loading={saveSystemsM.isPending} testId="admin.outages.systems.save">{t('admin.outages.action.review')}</Button></div>}>
        {saveSystemsM.isError ? <Alert variant="danger" title={t('common.error')} testId="admin.outages.systems.error">{outageScopeErrorMessage(saveSystemsM.error, t)}</Alert> : null}
        <OutageScopeEditor form={systemsForm} setForm={setSystemsForm} />
      </Modal>

      <ConfirmDialog
        open={attrsReviewOpen}
        testId="admin.outages.edit.confirm"
        title={t('admin.outages.edit.confirm_title')}
        description={t('admin.outages.edit.confirm_body')}
        confirmLoading={saveAttrsM.isPending}
        onCancel={() => setAttrsReviewOpen(false)}
        onConfirm={() => saveAttrsM.mutate()}
      >
        <OutageReviewSummary form={form} />
      </ConfirmDialog>

      <ConfirmDialog
        open={updateReviewOpen}
        testId="admin.outages.update.confirm"
        title={t('admin.outages.update.confirm_title')}
        description={t('admin.outages.update.confirm_body')}
        confirmLoading={postUpdateM.isPending}
        onCancel={() => setUpdateReviewOpen(false)}
        onConfirm={() => postUpdateM.mutate(undefined)}
      >
        <OutageReviewSummary form={form} showState />
      </ConfirmDialog>

      <ConfirmDialog
        open={systemsReviewOpen}
        testId="admin.outages.systems.confirm"
        title={t('admin.outages.systems.confirm_title')}
        description={t('admin.outages.systems.confirm_body')}
        confirmLoading={saveSystemsM.isPending}
        onCancel={() => setSystemsReviewOpen(false)}
        onConfirm={() => saveSystemsM.mutate()}
      >
        <div className="text-sm text-muted">
          {systemsForm.scope.map((item) => item.label).join(', ') || t('admin.outages.systems.none_selected')}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        testId="admin.outages.change_state.confirm"
        title={t('admin.outages.change_state.confirm_title')}
        description={t('admin.outages.change_state.confirm_body', { state: confirmState ? t(`admin.outages.state.${confirmState}`) : '' })}
        danger={confirmState === 'cancelled'}
        confirmLoading={postUpdateM.isPending}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (!confirmState) return;
          postUpdateM.mutate(outageStateTransitionPayload(
            outageId,
            confirmState
          ));
        }}
      />
    </div>
  );
}

export default AdminOutagesPage;
