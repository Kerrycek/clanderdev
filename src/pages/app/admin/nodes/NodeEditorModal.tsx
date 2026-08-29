import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useI18n, type I18nContextValue } from '../../../../app/i18n';
import { fetchLocations, type Location } from '../../../../lib/api/infra';
import {
  nodeCreateCapacityRequirements,
  nodeUpdateNullability,
  NodeCreateIndeterminateError,
  type Node,
  type NodeCreateInput,
  type NodeUpdateInput,
  type NodeWriteCapabilityDescription,
} from '../../../../lib/api/nodes';
import { formatErrorMessage } from '../../../../lib/errors';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { Input, type InputProps } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';

import {
  NODE_ROLES,
  buildNodeCreateInput,
  buildNodeUpdateInput,
  createReviewChanges,
  emptyNodeCreateDraft,
  hasNodeUpdateChanges,
  nodeEditDraft,
  updateReviewChanges,
  type NodeCreateDraft,
  type NodeEditDraft,
  type NodeRole,
  type NodeReviewChange,
} from './NodeLifecycleModel';

export type NodeEditorMutationResult = { data?: Node | void; meta?: Record<string, unknown> };
type Translate = I18nContextValue['t'];

function locationText(location: Location): string {
  const locationLabel = String(location.label ?? `#${location.id}`);
  const environment = location.environment;
  const environmentLabel = environment ? String(environment.label ?? `#${environment.id}`) : '';
  return environmentLabel ? `${environmentLabel} · ${locationLabel}` : locationLabel;
}

function fieldLabel(t: Translate, key: string): string {
  return t(`admin.node.editor.field.${key}`);
}

function isNodeRole(value: string): value is NodeRole {
  return NODE_ROLES.some((role) => role === value);
}

function reviewValue(t: Translate, key: string, value: string | undefined): string {
  if (value === undefined) return '—';
  if ((key === 'active' || key === 'maintenance') && (value === 'true' || value === 'false')) {
    return t(value === 'true' ? 'common.yes' : 'common.no');
  }
  if (key === 'type' && isNodeRole(value)) {
    return t(`admin.node.editor.role.${value}`);
  }
  if (key === 'hypervisor_type' && value === 'vpsadminos') {
    return t('admin.node.editor.hypervisor.vpsadminos');
  }
  return value;
}

function validationMessage(t: Translate, error: unknown): string {
  const field = error instanceof Error ? error.message : '';
  if (field) return t('admin.node.editor.validation.field', { field: fieldLabel(t, field) });
  return t('admin.node.editor.validation.generic');
}

function Review(props: {
  changes: NodeReviewChange[];
  edit: boolean;
  t: Translate;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border" data-testid="admin.node.editor.review">
      <div className="bg-surface-2 px-3 py-2 text-sm font-semibold">{props.t('admin.node.editor.review.title')}</div>
      <dl className="divide-y divide-border">
        {props.changes.map((change) => (
          <div key={change.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-xs font-semibold text-muted">{fieldLabel(props.t, change.key)}</dt>
            <dd className="min-w-0 text-sm">
              {props.edit ? <span className="break-all text-faint line-through">{reviewValue(props.t, change.key, change.before)}</span> : null}
              {props.edit ? <span className="mx-2 text-faint" aria-hidden="true">→</span> : null}
              <span className="break-all font-medium text-fg">{reviewValue(props.t, change.key, change.after)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function NodeFieldInput({ inputId, label, ...inputProps }: Omit<InputProps, 'inputId' | 'label'> & {
  inputId: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-muted">
        {label}
      </label>
      <Input {...inputProps} inputId={inputId} />
    </div>
  );
}

export function NodeEditorModal(props: {
  mode: 'create' | 'edit';
  open: boolean;
  node?: Node;
  capabilityAvailable: boolean;
  createCapability?: NodeWriteCapabilityDescription;
  updateCapability?: NodeWriteCapabilityDescription;
  capabilityError?: unknown;
  onClose: () => void;
  onSubmit: (payload: NodeCreateInput | NodeUpdateInput) => Promise<NodeEditorMutationResult>;
  onSuccess: (result: NodeEditorMutationResult) => void;
  onCreateIndeterminate?: (error: NodeCreateIndeterminateError, payload: NodeCreateInput) => void;
}) {
  const { t } = useI18n();
  const [createDraft, setCreateDraft] = useState<NodeCreateDraft>(emptyNodeCreateDraft);
  const [editDraft, setEditDraft] = useState<NodeEditDraft>(() => nodeEditDraft(props.node ?? { id: 0 }));
  const [review, setReview] = useState(false);
  const [payload, setPayload] = useState<NodeCreateInput | NodeUpdateInput | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const editSessionRef = useRef<string | null>(null);
  const capacityRequirements = useMemo(
    () => nodeCreateCapacityRequirements(props.createCapability),
    [props.createCapability]
  );
  const capacityIsRequired = capacityRequirements.cpus
    || capacityRequirements.total_memory
    || capacityRequirements.total_swap;
  const updateNullability = useMemo(
    () => nodeUpdateNullability(props.updateCapability),
    [props.updateCapability]
  );

  const locationsQ = useQuery({
    queryKey: ['locations', 'node_editor', { limit: 500, includes: 'environment' }],
    queryFn: async () => (await fetchLocations({ limit: 500, includes: 'environment' })).data,
    enabled: props.open && props.mode === 'create' && props.capabilityAvailable,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!props.open) {
      editSessionRef.current = null;
      return;
    }
    const sessionKey = props.mode === 'create'
      ? 'create'
      : `edit:${String(props.node?.id ?? 'unknown')}`;
    if (editSessionRef.current === sessionKey) return;
    editSessionRef.current = sessionKey;
    setCreateDraft(emptyNodeCreateDraft());
    setEditDraft(nodeEditDraft(props.node ?? { id: 0 }));
    setReview(false);
    setPayload(null);
    setValidationError(null);
    setSubmitError(null);
    setSubmitting(false);
  }, [props.node?.id, props.open, props.mode]);

  const locationOptions = useMemo(
    () =>
      [...(locationsQ.data ?? [])]
        .sort((a, b) => locationText(a).localeCompare(locationText(b)))
        .map((location) => ({ value: String(location.id), label: locationText(location) })),
    [locationsQ.data]
  );

  const reviewChanges = useMemo(() => {
    if (!payload) return [];
    if (props.mode === 'edit') return updateReviewChanges(props.node ?? { id: 0 }, payload as NodeUpdateInput);
    const selected = locationsQ.data?.find((location) => String(location.id) === createDraft.locationId);
    return createReviewChanges(payload as NodeCreateInput, selected ? locationText(selected) : '—');
  }, [createDraft.locationId, locationsQ.data, payload, props.mode, props.node]);

  const safeClose = () => {
    if (!submitting) props.onClose();
  };

  const continueToReview = () => {
    setValidationError(null);
    setSubmitError(null);
    try {
      const next =
        props.mode === 'create'
          ? buildNodeCreateInput(createDraft, capacityRequirements)
          : buildNodeUpdateInput(props.node ?? { id: 0 }, editDraft, updateNullability);
      if (props.mode === 'edit' && !hasNodeUpdateChanges(next as NodeUpdateInput)) {
        setValidationError(t('admin.node.editor.validation.no_changes'));
        return;
      }
      setPayload(next);
      setReview(true);
    } catch (error) {
      setValidationError(validationMessage(t, error));
    }
  };

  const submit = async () => {
    if (!payload || submitting || !props.capabilityAvailable) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await props.onSubmit(payload);
      props.onSuccess(result);
      props.onClose();
    } catch (error) {
      if (props.mode === 'create' && error instanceof NodeCreateIndeterminateError) {
        props.onCreateIndeterminate?.(error, payload as NodeCreateInput);
      } else {
        setSubmitError(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={safeClose} disabled={submitting} testId="admin.node.editor.cancel">
        {t('common.cancel')}
      </Button>
      {review ? (
        <Button variant="secondary" onClick={() => setReview(false)} disabled={submitting} testId="admin.node.editor.back">
          {t('common.back')}
        </Button>
      ) : null}
      <Button
        variant="primary"
        onClick={review ? () => void submit() : continueToReview}
        loading={submitting}
        disabled={!props.capabilityAvailable || (props.mode === 'create' && locationsQ.isLoading)}
        testId={review ? 'admin.node.editor.submit' : 'admin.node.editor.continue'}
      >
        {review
          ? t(props.mode === 'create' ? 'admin.node.editor.action.create' : 'admin.node.editor.action.save')
          : t('common.continue')}
      </Button>
    </div>
  );

  return (
    <Modal
      open={props.open}
      onClose={safeClose}
      title={t(props.mode === 'create' ? 'admin.node.editor.create.title' : 'admin.node.editor.edit.title')}
      size="lg"
      mobileFullScreen
      testId="admin.node.editor.modal"
      footer={footer}
    >
      <div className="space-y-4">
        {!props.capabilityAvailable ? (
          <Alert variant="warn" title={t('admin.node.editor.capability_unavailable.title')} testId="admin.node.editor.capability_error">
            {t('admin.node.editor.capability_unavailable.body')}
          </Alert>
        ) : null}

        {validationError ? (
          <Alert variant="warn" title={validationError} testId="admin.node.editor.validation_error" />
        ) : null}
        {submitError ? (
          <Alert variant="danger" title={t('admin.node.editor.submit_failed')} testId="admin.node.editor.submit_error">
            {formatErrorMessage(submitError)}
          </Alert>
        ) : null}

        {review ? (
          <>
            <p className="text-sm text-muted">{t('admin.node.editor.review.description')}</p>
            <Review changes={reviewChanges} edit={props.mode === 'edit'} t={t} />
          </>
        ) : props.mode === 'create' ? (
          <>
            <p className="text-sm text-muted">{t('admin.node.editor.create.description')}</p>
            {locationsQ.isError ? (
              <Alert variant="danger" title={t('admin.node.editor.locations_failed')}>
                {formatErrorMessage(locationsQ.error)}
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <NodeFieldInput inputId="admin-node-editor-create-name" label={fieldLabel(t, 'name')} value={createDraft.name} onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))} testId="admin.node.editor.name" />
              <div>
                <label htmlFor="admin-node-editor-create-role" className="mb-1 block text-xs font-semibold text-muted">
                  {fieldLabel(t, 'type')}
                </label>
                <Select
                  selectId="admin-node-editor-create-role"
                  value={createDraft.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (isNodeRole(role)) setCreateDraft((d) => ({ ...d, role }));
                  }}
                  options={NODE_ROLES.map((role) => ({ value: role, label: t(`admin.node.editor.role.${role}`) }))}
                  testId="admin.node.editor.role"
                />
              </div>
              <div>
                <label htmlFor="admin-node-editor-create-location" className="mb-1 block text-xs font-semibold text-muted">
                  {fieldLabel(t, 'location')}
                </label>
                <Select
                  selectId="admin-node-editor-create-location"
                  value={createDraft.locationId}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, locationId: e.target.value }))}
                  options={[{ value: '', label: t('admin.node.editor.location.select') }, ...locationOptions]}
                  disabled={locationsQ.isLoading || locationsQ.isError}
                  testId="admin.node.editor.location"
                />
              </div>
              <NodeFieldInput inputId="admin-node-editor-create-ip" label={fieldLabel(t, 'ip_addr')} value={createDraft.ipAddress} onChange={(e) => setCreateDraft((d) => ({ ...d, ipAddress: e.target.value }))} inputMode="decimal" testId="admin.node.editor.ip" />
              {createDraft.role === 'node' ? (
                <NodeFieldInput inputId="admin-node-editor-create-max-vps" label={fieldLabel(t, 'max_vps')} value={createDraft.maxVps} onChange={(e) => setCreateDraft((d) => ({ ...d, maxVps: e.target.value }))} type="number" min={0} testId="admin.node.editor.max_vps" />
              ) : null}
              <NodeFieldInput inputId="admin-node-editor-create-max-tx" label={fieldLabel(t, 'max_tx')} value={createDraft.maxTx} onChange={(e) => setCreateDraft((d) => ({ ...d, maxTx: e.target.value }))} type="number" min={0} />
              <NodeFieldInput inputId="admin-node-editor-create-max-rx" label={fieldLabel(t, 'max_rx')} value={createDraft.maxRx} onChange={(e) => setCreateDraft((d) => ({ ...d, maxRx: e.target.value }))} type="number" min={0} />
            </div>
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="font-semibold">{t('admin.node.editor.bootstrap.title')}</div>
              <p className="mt-1 text-xs text-muted" data-testid="admin.node.editor.bootstrap.description">
                {t(capacityIsRequired
                  ? 'admin.node.editor.bootstrap.description.required'
                  : 'admin.node.editor.bootstrap.description.optional')}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <NodeFieldInput inputId="admin-node-editor-create-cpus" label={`${fieldLabel(t, 'cpus')}${capacityRequirements.cpus ? ' *' : ''}`} value={createDraft.cpus} onChange={(e) => setCreateDraft((d) => ({ ...d, cpus: e.target.value }))} type="number" min={1} testId="admin.node.editor.cpus" />
                <NodeFieldInput inputId="admin-node-editor-create-memory" label={`${fieldLabel(t, 'total_memory')}${capacityRequirements.total_memory ? ' *' : ''}`} value={createDraft.totalMemory} onChange={(e) => setCreateDraft((d) => ({ ...d, totalMemory: e.target.value }))} type="number" min={1} testId="admin.node.editor.memory" />
                <NodeFieldInput inputId="admin-node-editor-create-swap" label={`${fieldLabel(t, 'total_swap')}${capacityRequirements.total_swap ? ' *' : ''}`} value={createDraft.totalSwap} onChange={(e) => setCreateDraft((d) => ({ ...d, totalSwap: e.target.value }))} type="number" min={0} testId="admin.node.editor.swap" />
              </div>
            </div>
            <Checkbox
              checked={createDraft.maintenance}
              onChange={(maintenance) => setCreateDraft((d) => ({ ...d, maintenance }))}
              label={t('admin.node.editor.maintenance.label')}
              description={t('admin.node.editor.maintenance.description')}
              testId="admin.node.editor.maintenance"
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t('admin.node.editor.edit.description')}</p>
            <Alert variant="neutral" title={t('admin.node.editor.immutable.title')}>
              {t('admin.node.editor.immutable.body')}
            </Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <NodeFieldInput inputId="admin-node-editor-edit-name" label={fieldLabel(t, 'name')} value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} testId="admin.node.editor.name" />
              <NodeFieldInput inputId="admin-node-editor-edit-ip" label={fieldLabel(t, 'ip_addr')} value={editDraft.ipAddress} onChange={(e) => setEditDraft((d) => ({ ...d, ipAddress: e.target.value }))} inputMode="decimal" testId="admin.node.editor.ip" />
              {props.node?.type === 'node' ? (
                <NodeFieldInput inputId="admin-node-editor-edit-max-vps" label={fieldLabel(t, 'max_vps')} value={editDraft.maxVps} onChange={(e) => setEditDraft((d) => ({ ...d, maxVps: e.target.value }))} type="number" min={0} testId="admin.node.editor.max_vps" />
              ) : null}
              <NodeFieldInput inputId="admin-node-editor-edit-max-tx" label={fieldLabel(t, 'max_tx')} value={editDraft.maxTx} onChange={(e) => setEditDraft((d) => ({ ...d, maxTx: e.target.value }))} type="number" min={0} />
              <NodeFieldInput inputId="admin-node-editor-edit-max-rx" label={fieldLabel(t, 'max_rx')} value={editDraft.maxRx} onChange={(e) => setEditDraft((d) => ({ ...d, maxRx: e.target.value }))} type="number" min={0} />
            </div>
            <Checkbox checked={editDraft.active} onChange={(active) => setEditDraft((d) => ({ ...d, active }))} label={fieldLabel(t, 'active')} testId="admin.node.editor.active" />
          </>
        )}
      </div>
    </Modal>
  );
}
