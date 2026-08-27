import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
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
import { NodeLookupInput } from '../../../components/ui/NodeLookupInput';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { TableCard } from '../../../components/ui/TableCard';
import { Textarea } from '../../../components/ui/Textarea';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { formatErrorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { useKeysetPagination } from '../../../lib/hooks/useKeysetPagination';
import { parsePositiveInt } from '../../../lib/parse';
import { formatDurationMinutes } from '../../../lib/time';
import { fetchEnvironments, fetchLocations } from '../../../lib/api/infra';
import { outageImpactLabel, outageTypeLabel } from '../../../lib/apiValues';
import { outageBadges, outageUpdateBadges } from '../../../lib/outageBadges';
import { fetchOutage, fetchOutageEntities, fetchOutageHandlers, fetchOutageUpdates } from '../../../lib/api/public';
import type { Outage, OutageEntity, OutageHandler } from '../../../lib/api/public';
import {
  applyOutageSystems,
  createOutageWithSystems,
  createOutageUpdate,
  fetchAdminOutages,
  fetchExportOutages,
  fetchUserOutages,
  fetchVpsOutages,
  outageHandlerUserId,
  updateOutage,
  type OutagePayload,
  type OutageUpdatePayload,
} from '../../../lib/api/outages';

type OutageFormState = {
  beginsAt: string;
  finishedAt: string;
  duration: string;
  type: string;
  impact: string;
  state: string;
  autoResolve: boolean;
  enSummary: string;
  enDescription: string;
  csSummary: string;
  csDescription: string;
  sendMail: boolean;
};

type SystemsFormState = {
  vpsadmin: string;
  clusterWide: boolean;
  environments: string;
  locations: string;
  nodes: string;
  additional: string;
  handlers: string;
};

type OutageFormErrors = Partial<Record<'beginsAt' | 'duration' | 'type' | 'impact' | 'enSummary' | 'csSummary', string>>;

const OUTAGE_TYPES = ['outage', 'maintenance'];
const IMPACTS = ['tbd', 'performance', 'network', 'system_restart', 'system_reset', 'unavailability', 'export'];
const STATES = ['staged', 'announced', 'cancelled', 'resolved'];

function toDateInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value.slice(0, 16);
  return d.toISOString().slice(0, 16);
}

function fromDateInput(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

function intList(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

function entityLabel(ent: OutageEntity): string {
  return ent.label || `${ent.name}${ent.entity_id ? ` #${ent.entity_id}` : ''}`;
}

function initOutageForm(outage?: Outage): OutageFormState {
  const x: any = outage ?? {};
  return {
    beginsAt: toDateInput(x.begins_at) || new Date().toISOString().slice(0, 16),
    finishedAt: toDateInput(x.finished_at),
    duration: x.duration != null ? String(x.duration) : '',
    type: typeof x.type === 'string' ? x.type : 'outage',
    impact: typeof x.impact === 'string' ? x.impact : 'tbd',
    state: typeof x.state === 'string' ? x.state : 'staged',
    autoResolve: Boolean(x.auto_resolve),
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
    begins_at: fromDateInput(form.beginsAt),
    finished_at: fromDateInput(form.finishedAt),
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

function updatePayload(form: OutageFormState, outageId: number): OutageUpdatePayload {
  const duration = form.duration.trim() ? Number(form.duration) : null;
  return {
    outage: outageId,
    send_mail: form.sendMail,
    begins_at: fromDateInput(form.beginsAt),
    finished_at: fromDateInput(form.finishedAt),
    duration: Number.isFinite(duration) ? duration : null,
    impact: form.impact,
    state: form.state,
    en_summary: form.enSummary || undefined,
    en_description: form.enDescription || undefined,
    cs_summary: form.csSummary || undefined,
    cs_description: form.csDescription || undefined,
  };
}

function initSystemsForm(entities: OutageEntity[], handlers: OutageHandler[]): SystemsFormState {
  const ids = (name: string) =>
    entities
      .filter((e) => e.name === name && typeof e.entity_id === 'number')
      .map((e) => String(e.entity_id))
      .join(', ');
  const additional = entities
    .filter((e) => !['vpsAdmin', 'Cluster', 'Environment', 'Location', 'Node'].includes(e.name))
    .map((e) => e.name)
    .join(', ');
  return {
    vpsadmin: ids('vpsAdmin'),
    clusterWide: entities.some((e) => e.name === 'Cluster'),
    environments: ids('Environment'),
    locations: ids('Location'),
    nodes: ids('Node'),
    additional,
    handlers: handlers.map(outageHandlerUserId).filter(Boolean).join(', '),
  };
}

function desiredEntities(form: SystemsFormState): Array<{ name: string; entity_id: number | null }> {
  const out: Array<{ name: string; entity_id: number | null }> = [];
  for (const id of intList(form.vpsadmin)) out.push({ name: 'vpsAdmin', entity_id: id });
  if (form.clusterWide) out.push({ name: 'Cluster', entity_id: null });
  for (const id of intList(form.environments)) out.push({ name: 'Environment', entity_id: id });
  for (const id of intList(form.locations)) out.push({ name: 'Location', entity_id: id });
  for (const id of intList(form.nodes)) out.push({ name: 'Node', entity_id: id });
  for (const name of form.additional.split(',').map((s) => s.trim()).filter(Boolean)) out.push({ name, entity_id: null });
  return out;
}

function desiredSystems(form: SystemsFormState) {
  return {
    entities: desiredEntities(form),
    handlers: intList(form.handlers),
  };
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
              <Select testId="admin.outages.form.type" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} options={OUTAGE_TYPES.map((v) => ({ value: v, label: outageTypeLabel(t, v) }))} />
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

function appendIdList(value: string, id: number) {
  const ids = intList(value);
  if (!ids.includes(id)) ids.push(id);
  return ids.join(', ');
}

function SystemsEditor(props: {
  form: SystemsFormState;
  setForm: React.Dispatch<React.SetStateAction<SystemsFormState>>;
}) {
  const { t } = useI18n();
  const [nodeLookup, setNodeLookup] = useState('');
  const [handlerLookup, setHandlerLookup] = useState('');

  const environmentsQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'environments'],
    queryFn: async () => (await fetchEnvironments({ limit: 250 })).data,
    staleTime: 30_000,
  });
  const locationsQ = useQuery({
    queryKey: ['admin_outages', 'lookup', 'locations'],
    queryFn: async () => (await fetchLocations({ limit: 250 })).data,
    staleTime: 30_000,
  });

  const envOptions = [{ value: '', label: t('common.select') }, ...(environmentsQ.data ?? []).map((e) => ({ value: String(e.id), label: `${e.label ?? e.domain ?? `#${e.id}`} (#${e.id})` }))];
  const locationOptions = [{ value: '', label: t('common.select') }, ...(locationsQ.data ?? []).map((l) => ({ value: String(l.id), label: `${l.label ?? l.domain ?? `#${l.id}`} (#${l.id})` }))];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel label={t('admin.outages.systems.environments')}>
            <Select testId="admin.outages.systems.environments.select" value="" onChange={(e) => {
              const id = parsePositiveInt(e.target.value);
              if (id) props.setForm((p) => ({ ...p, environments: appendIdList(p.environments, id) }));
            }} options={envOptions} />
          </FieldLabel>
          <div className="mt-1 text-xs text-muted">{props.form.environments || t('admin.outages.systems.none_selected')}</div>
        </div>
        <div>
          <FieldLabel label={t('admin.outages.systems.locations')}>
            <Select testId="admin.outages.systems.locations.select" value="" onChange={(e) => {
              const id = parsePositiveInt(e.target.value);
              if (id) props.setForm((p) => ({ ...p, locations: appendIdList(p.locations, id) }));
            }} options={locationOptions} />
          </FieldLabel>
          <div className="mt-1 text-xs text-muted">{props.form.locations || t('admin.outages.systems.none_selected')}</div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">{t('admin.outages.systems.nodes')}</div>
          <div className="flex gap-2">
            <NodeLookupInput testId="admin.outages.systems.nodes.lookup" value={nodeLookup} onChange={setNodeLookup} onPick={(node) => {
              props.setForm((p) => ({ ...p, nodes: appendIdList(p.nodes, node.id) }));
              setNodeLookup('');
            }} placeholder={t('admin.outages.systems.node_lookup_placeholder')} className="min-w-0 flex-1" />
            <Button type="button" variant="secondary" testId="admin.outages.systems.nodes.add" onClick={() => {
              const id = parsePositiveInt(nodeLookup);
              if (id) {
                props.setForm((p) => ({ ...p, nodes: appendIdList(p.nodes, id) }));
                setNodeLookup('');
              }
            }}>{t('common.add')}</Button>
          </div>
          <div className="mt-1 text-xs text-muted">{props.form.nodes || t('admin.outages.systems.none_selected')}</div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">{t('admin.outages.systems.handlers')}</div>
          <div className="flex gap-2">
            <UserLookupInput testId="admin.outages.systems.handlers.lookup" value={handlerLookup} onChange={setHandlerLookup} onPick={(user) => {
              props.setForm((p) => ({ ...p, handlers: appendIdList(p.handlers, user.id) }));
              setHandlerLookup('');
            }} placeholder={t('admin.outages.systems.handler_lookup_placeholder')} className="min-w-0 flex-1" />
            <Button type="button" variant="secondary" testId="admin.outages.systems.handlers.add" onClick={() => {
              const id = parsePositiveInt(handlerLookup);
              if (id) {
                props.setForm((p) => ({ ...p, handlers: appendIdList(p.handlers, id) }));
                setHandlerLookup('');
              }
            }}>{t('common.add')}</Button>
          </div>
          <div className="mt-1 text-xs text-muted">{props.form.handlers || t('admin.outages.systems.none_selected')}</div>
        </div>
        <div>
          <FieldLabel label={t('admin.outages.systems.vpsadmin')}>
            <Input testId="admin.outages.systems.vpsadmin" value={props.form.vpsadmin} onChange={(e) => props.setForm((p) => ({ ...p, vpsadmin: e.target.value }))} />
          </FieldLabel>
          <div className="mt-1 text-xs text-muted">{t('admin.outages.systems.vpsadmin_help')}</div>
        </div>
        <div>
          <FieldLabel label={t('admin.outages.systems.additional')}>
            <Input testId="admin.outages.systems.additional" value={props.form.additional} onChange={(e) => props.setForm((p) => ({ ...p, additional: e.target.value }))} />
          </FieldLabel>
          <div className="mt-1 text-xs text-muted">{t('admin.outages.systems.additional_help')}</div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={props.form.clusterWide} onChange={(e) => props.setForm((p) => ({ ...p, clusterWide: e.target.checked }))} />{t('admin.outages.systems.cluster_wide')}</label>
      <div className="text-xs text-muted">{t('admin.outages.systems.help')}</div>
    </div>
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
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(searchParams.get('state') ?? '');
  const [type, setType] = useState(searchParams.get('type') ?? '');
  const vpsFilter = useMemo(() => parsePositiveInt(searchParams.get('vps')), [searchParams]);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(() => initOutageForm());
  const [systemsForm, setSystemsForm] = useState<SystemsFormState>(() => initSystemsForm([], []));
  const [formErrors, setFormErrors] = useState<OutageFormErrors>({});

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
    mutationFn: async () => createOutageWithSystems(formPayload(form), desiredSystems(systemsForm)),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['admin_outages'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.created') });
      setNewOpen(false);
      navigate(`/admin/outages/${res.data.id}`);
    },
    onError: (e) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) }),
  });

  const submitCreate = () => {
    const errors = validateOutageForm(form, t);
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    createM.mutate();
  };

  const rows = outagesQ.data ?? [];

  return (
    <div className="space-y-6" data-testid="admin.outages.page">
      <PageHeader
        title={t('admin.outages.title')}
        description={t('admin.outages.subtitle')}
        actions={<Button onClick={() => { setForm(initOutageForm()); setSystemsForm(initSystemsForm([], [])); setFormErrors({}); setNewOpen(true); }} testId="admin.outages.new">{t('admin.outages.action.new')}</Button>}
      />
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
      ) : (
        <TableCard testId="admin.outages.table" minWidth="lg">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('common.id')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.outages.field.begins_at')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.outages.field.state')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">{t('admin.outages.field.summary')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('admin.outages.field.users')}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted">{t('admin.outages.field.vps')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const badges = outageBadges(o, t);
              return (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-mono text-xs"><Link className="underline" to={`/admin/outages/${o.id}`}>#{o.id}</Link></td>
                  <td className="px-3 py-2 text-sm">{formatDateTime(o.begins_at)}</td>
                  <td className="px-3 py-2"><Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge></td>
                  <td className="px-3 py-2 text-sm">{String((o as any).en_summary || (o as any).cs_summary || t('public.outage.fallback_title', { id: o.id }))}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{o.state === 'staged' ? '—' : (o.affected_user_count ?? '—')}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{o.state === 'staged' ? '—' : (o.affected_direct_vps_count ?? '—')}</td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
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
          <Button onClick={submitCreate} loading={createM.isPending} testId="admin.outages.create.save">{t('common.create')}</Button>
        </div>
      }>
        {hasErrors(formErrors) ? <Alert variant="warn" title={t('common.validation_error')} testId="admin.outages.create.validation">{t('admin.outages.validation.body')}</Alert> : null}
        <div className="mt-4 space-y-6">
          <OutageForm form={form} setForm={setForm} errors={formErrors} />
          <div>
            <div className="mb-3 text-sm font-semibold text-fg">{t('admin.outages.section.systems')}</div>
            <SystemsEditor form={systemsForm} setForm={setSystemsForm} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AdminOutageDetailPage({ outageId }: { outageId: number | undefined }) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [form, setForm] = useState(() => initOutageForm());
  const [systemsForm, setSystemsForm] = useState<SystemsFormState>(() => initSystemsForm([], []));
  const [formErrors, setFormErrors] = useState<OutageFormErrors>({});
  const [stateWarning, setStateWarning] = useState('');
  const [confirmState, setConfirmState] = useState<string | null>(null);

  const enabled = Boolean(outageId);
  const outageQ = useQuery({ queryKey: ['outages', 'show', outageId], queryFn: async () => (await fetchOutage(outageId!)).data, enabled });
  const entitiesQ = useQuery({ queryKey: ['outages', outageId, 'entities'], queryFn: async () => (await fetchOutageEntities(outageId!)).data, enabled });
  const handlersQ = useQuery({ queryKey: ['outages', outageId, 'handlers'], queryFn: async () => (await fetchOutageHandlers(outageId!)).data, enabled });
  const updatesQ = useQuery({ queryKey: ['outages', outageId, 'updates'], queryFn: async () => (await fetchOutageUpdates(outageId!)).data, enabled });
  const usersQ = useQuery({ queryKey: ['outages', outageId, 'affected_users'], queryFn: async () => (await fetchUserOutages(outageId!)).data, enabled });
  const vpsQ = useQuery({ queryKey: ['outages', outageId, 'affected_vps'], queryFn: async () => (await fetchVpsOutages(outageId!)).data, enabled });
  const exportsQ = useQuery({ queryKey: ['outages', outageId, 'affected_exports'], queryFn: async () => (await fetchExportOutages(outageId!)).data, enabled });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['outages', outageId] });
    await qc.invalidateQueries({ queryKey: ['admin_outages'] });
  };

  const saveAttrsM = useMutation({
    mutationFn: async () => updateOutage(outageId!, formPayload(form)),
    onSuccess: async () => {
      await invalidate();
      pushToast({ variant: 'ok', title: t('admin.outages.toast.saved') });
      setEditOpen(false);
    },
    onError: (e) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) }),
  });

  const submitAttrs = () => {
    const errors = validateOutageForm(form, t);
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    saveAttrsM.mutate();
  };

  const postUpdateM = useMutation({
    mutationFn: async (payload?: OutageUpdatePayload) => createOutageUpdate(payload ?? updatePayload(form, outageId!)),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'updates'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.update_posted') });
      setUpdateOpen(false);
      setConfirmState(null);
    },
    onError: (e) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) }),
  });

  const submitUpdate = () => {
    const errors = validateOutageForm(form, t, { requireType: false });
    setFormErrors(errors);
    if (hasErrors(errors)) return;
    postUpdateM.mutate(undefined);
  };

  const saveSystemsM = useMutation({
    mutationFn: async () => {
      await applyOutageSystems(outageId!, entitiesQ.data ?? [], handlersQ.data ?? [], desiredSystems(systemsForm));
    },
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'entities'] });
      await qc.invalidateQueries({ queryKey: ['outages', outageId, 'handlers'] });
      pushToast({ variant: 'ok', title: t('admin.outages.toast.systems_saved') });
      setSystemsOpen(false);
    },
    onError: (e) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(e) }),
  });

  if (!outageId) return <ErrorState title={t('admin.outages.invalid.title')} message={t('admin.outages.invalid.body')} />;
  if (outageQ.isLoading) return <LoadingState />;
  if (outageQ.isError || !outageQ.data) return <ErrorState title={t('admin.outages.error.detail_title')} message={formatErrorMessage(outageQ.error)} onRetry={() => outageQ.refetch()} />;

  const outage = outageQ.data;
  const badges = outageBadges(outage, t);
  const entities = entitiesQ.data ?? [];
  const handlers = handlersQ.data ?? [];

  const openEdit = () => {
    setForm(initOutageForm(outage));
    setFormErrors({});
    setEditOpen(true);
  };
  const openUpdate = () => {
    setForm({ ...initOutageForm(outage), enSummary: '', enDescription: '', csSummary: '', csDescription: '', sendMail: true });
    setFormErrors({});
    setUpdateOpen(true);
  };
  const openSystems = () => {
    setSystemsForm(initSystemsForm(entities, handlers));
    setSystemsOpen(true);
  };
  const requestStateChange = (st: string) => {
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
        title={String((outage as any).en_summary || (outage as any).cs_summary || t('public.outage.fallback_title', { id: outage.id }))}
        description={`#${outage.id}`}
        actions={
          <>
            <LinkButton to="/admin/outages" variant="secondary">{t('admin.outages.back')}</LinkButton>
            <Button variant="secondary" onClick={openEdit} testId="admin.outages.detail.edit_attrs">{t('admin.outages.action.edit_attrs')}</Button>
            <Button variant="secondary" onClick={openSystems} testId="admin.outages.detail.edit_systems">{t('admin.outages.action.edit_systems')}</Button>
            <Button onClick={openUpdate} testId="admin.outages.detail.post_update">{t('admin.outages.action.post_update')}</Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge>
        {badges.type ? <Badge variant={badges.type.variant}>{badges.type.label}</Badge> : null}
        {badges.impact ? <Badge variant={badges.impact.variant}>{badges.impact.label}</Badge> : null}
      </div>

      {outage.state === 'staged' ? (
        <Card>
          <CardHeader title={t('admin.outages.change_state.title')} />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {['announced', 'cancelled', 'resolved'].map((st) => (
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
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('admin.outages.section.systems')} />
        <CardBody>
          {entitiesQ.isLoading ? <Spinner label={t('common.loading')} /> : entities.length ? (
            <div className="flex flex-wrap gap-2">{entities.map((e) => <Badge key={e.id} variant="neutral">{entityLabel(e)}</Badge>)}</div>
          ) : <div className="text-sm text-muted">{t('admin.outages.empty.systems')}</div>}
          <div className="mt-4 text-sm text-muted">{handlers.length ? handlers.map((h) => h.full_name || h.reporter_name || `#${outageHandlerUserId(h) ?? h.id}`).join(', ') : t('admin.outages.empty.handlers')}</div>
        </CardBody>
      </Card>

      <AffectedTables usersQ={usersQ} vpsQ={vpsQ} exportsQ={exportsQ} />

      <Card>
        <CardHeader title={t('admin.outages.section.updates')} />
        <CardBody>
          {updatesQ.isLoading ? <Spinner label={t('common.loading')} /> : updatesQ.data?.length ? (
            <div className="space-y-3">
              {updatesQ.data.map((u) => {
                const b = outageUpdateBadges(u, t);
                return (
                  <div key={u.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap gap-2"><Badge variant={b.lifecycle.variant}>{b.lifecycle.label}</Badge>{b.impact ? <Badge variant={b.impact.variant}>{b.impact.label}</Badge> : null}</div>
                    <div className="mt-2 text-sm font-medium">{String((u as any).en_summary || (u as any).cs_summary || t('public.outage_detail.updates.update_fallback', { id: u.id }))}</div>
                    <div className="mt-1 text-xs text-muted">{formatDateTime(u.created_at)} · {u.reporter_name || '—'}</div>
                  </div>
                );
              })}
            </div>
          ) : <div className="text-sm text-muted">{t('public.outage_detail.updates.empty')}</div>}
        </CardBody>
      </Card>

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

      <Modal open={systemsOpen} title={t('admin.outages.systems.title')} onClose={() => setSystemsOpen(false)} size="lg" testId="admin.outages.systems.modal" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSystemsOpen(false)} disabled={saveSystemsM.isPending}>{t('common.cancel')}</Button><Button onClick={() => saveSystemsM.mutate()} loading={saveSystemsM.isPending} testId="admin.outages.systems.save">{t('common.save')}</Button></div>}>
        {saveSystemsM.isError ? <Alert variant="danger" title={t('common.error')} testId="admin.outages.systems.error">{formatErrorMessage(saveSystemsM.error)}</Alert> : null}
        <SystemsEditor form={systemsForm} setForm={setSystemsForm} />
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmState)}
        testId="admin.outages.change_state.confirm"
        title={t('admin.outages.change_state.confirm_title')}
        description={t('admin.outages.change_state.confirm_body', { state: confirmState ? t(`admin.outages.state.${confirmState}`) : '' })}
        danger={confirmState === 'cancelled'}
        confirmLoading={postUpdateM.isPending}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const f = initOutageForm(outage);
          f.state = confirmState ?? f.state;
          f.enSummary = t('admin.outages.change_state.update_summary', { state: confirmState ? t(`admin.outages.state.${confirmState}`) : '' });
          f.csSummary = f.enSummary;
          f.sendMail = true;
          setForm(f);
          postUpdateM.mutate(updatePayload(f, outageId));
        }}
      />
    </div>
  );
}

function AffectedTables(props: { usersQ: any; vpsQ: any; exportsQ: any }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AffectedCard title={t('admin.outages.section.affected_users')} query={props.usersQ} render={(r: any) => `${r.user?.login || r.user?.label || `#${r.user?.id ?? r.id}`} · VPS ${r.vps_count ?? 0} · exports ${r.export_count ?? 0}`} />
      <AffectedCard title={t('admin.outages.section.affected_vps')} query={props.vpsQ} render={(r: any) => `${r.vps?.id ? `#${r.vps.id}` : `#${r.id}`} ${r.vps?.hostname || r.vps?.label || ''}${r.direct === false ? ` (${t('admin.outages.field.indirect')})` : ''}`} />
      <AffectedCard title={t('admin.outages.section.affected_exports')} query={props.exportsQ} render={(r: any) => `${r.export?.id ? `#${r.export.id}` : `#${r.id}`} ${r.export?.path || r.export?.label || ''}`} />
    </div>
  );
}

function AffectedCard(props: { title: string; query: any; render: (row: any) => string }) {
  const { t } = useI18n();
  const rows = props.query.data ?? [];
  return (
    <Card>
      <CardHeader title={props.title} />
      <CardBody>
        {props.query.isLoading ? <Spinner label={t('common.loading')} /> : props.query.isError ? (
          <div className="text-sm text-danger">{formatErrorMessage(props.query.error)}</div>
        ) : rows.length ? (
          <ul className="space-y-1 text-sm">{rows.slice(0, 20).map((r: any) => <li key={r.id}>{props.render(r)}</li>)}</ul>
        ) : <div className="text-sm text-muted">{t('common.none')}</div>}
      </CardBody>
    </Card>
  );
}

export default AdminOutagesPage;
