import React from 'react';
import { AlertCircle, CheckCircle2, Circle, HardDrive, KeyRound, Network, Plus, Server, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import type { Location } from '../../../lib/api/infra';
import type { Node } from '../../../lib/api/nodes';
import type { OsTemplate } from '../../../lib/api/osTemplates';
import { isMissingActionStateError } from '../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../lib/errors';
import {
  formatMib,
  labelOf,
  matchingResourcePreset,
  nodeLabel,
  RESOURCE_PRESETS,
  templateLabel,
  type FormState,
  type HiddenAdminTarget,
} from './VpsCreateModel';
import { VpsCreateOutcomeAlert } from './VpsCreateOutcomeAlert';
type UpdateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
type TemplateGroup = [string, OsTemplate[]];
function fieldLabel(text: string) {
  return <label className="mb-1 block text-sm font-medium text-fg">{text}</label>;
}

function SummaryRow(props: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={props.testId} className="grid gap-1 border-b border-border/70 py-2 last:border-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{props.label}</dt>
      <dd className="min-w-0 text-sm text-fg">{props.value}</dd>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: string;
  min: string;
  max: string;
  testId: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      {fieldLabel(props.label)}
      <Input
        type="number"
        min={props.min}
        max={props.max}
        step="1"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        testId={props.testId}
      />
    </div>
  );
}

function stepIsDone(done: boolean, active: boolean) {
  if (done) return <CheckCircle2 className="h-4 w-4 text-ok" />;
  if (active) return <AlertCircle className="h-4 w-4 text-info" />;
  return <Circle className="h-4 w-4 text-muted" />;
}

export function CreateStepRail(props: {
  form: FormState;
  isAdminMode: boolean;
  hiddenAdminTarget?: HiddenAdminTarget;
  selectedTemplate?: OsTemplate;
  validationKeys: string[];
}) {
  const { t } = useI18n();
  const targetDone = Boolean(
    props.form.locationId &&
      (!props.isAdminMode || (props.form.userId && props.form.nodeId)) &&
      (!props.hiddenAdminTarget || (props.hiddenAdminTarget.userId && props.hiddenAdminTarget.nodeId))
  );
  const steps = [
    { key: 'target', complete: targetDone },
    { key: 'system', complete: Boolean(props.selectedTemplate) },
    { key: 'resources', complete: props.validationKeys.every((key) => !key.includes('cpu') && !key.includes('memory') && !key.includes('diskspace') && !key.includes('swap')) },
    { key: 'network', complete: props.validationKeys.every((key) => !key.includes('ipv4') && !key.includes('ipv6')) },
    { key: 'review', complete: props.validationKeys.length === 0 },
  ];
  const activeIndex = Math.max(0, steps.findIndex((step) => !step.complete));

  return (
    <Card testId="vps.create.steps">
      <CardHeader title={t('vps.create.steps.title')} subtitle={t('vps.create.steps.subtitle')} />
      <CardBody className="space-y-2">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          return (
            <div
              key={step.key}
              className="flex items-start gap-3 rounded-md border border-border bg-surface-2 px-3 py-2"
              data-testid={`vps.create.step.${step.key}`}
            >
              <div className="mt-0.5">{stepIsDone(step.complete, active)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{t(`vps.create.steps.${step.key}`)}</div>
                <div className="text-xs text-muted">{t(`vps.create.steps.${step.key}_help`)}</div>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

export function CreateTargetCard(props: {
  form: FormState;
  isAdminMode: boolean;
  isAdminAccount: boolean;
  locations: Location[];
  nodes: Node[];
  selectedLocation?: Location;
  selectedLocationId?: number;
  hiddenAdminTarget?: HiddenAdminTarget;
  onUpdate: UpdateForm;
  onLocationChange: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.target">
      <CardHeader title={t('vps.create.section.target')} subtitle={t('vps.create.section.target_help')} />
      <CardBody className="space-y-4">
        {props.isAdminMode ? (
          <div>
            {fieldLabel(t('vps.create.field.user'))}
            <UserLookupInput
              value={props.form.userId}
              onChange={(v) => props.onUpdate('userId', v)}
              testId="vps.create.user"
              placeholder={t('vps.create.placeholder.user')}
              loadingLabel={t('common.loading')}
              noResultsLabel={t('palette.empty.no_results')}
            />
          </div>
        ) : null}
        {!props.isAdminMode && props.isAdminAccount ? (
          <Alert variant="info" title={t('vps.create.admin_target.title')} testId="vps.create.admin_target">
            {t('vps.create.admin_target.description')}
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            {fieldLabel(t('vps.create.field.location'))}
            <Select
              value={props.form.locationId}
              onChange={(e) => props.onLocationChange(e.target.value)}
              testId="vps.create.location"
              options={[{ value: '', label: t('common.select') }, ...props.locations.map((l) => ({ value: String(l.id), label: labelOf(l) }))]}
            />
            {props.selectedLocation?.environment ? (
              <p className="mt-1 text-xs text-muted">
                {t('vps.create.location_environment', { environment: labelOf(props.selectedLocation.environment) })}
              </p>
            ) : null}
          </div>
          {props.isAdminMode ? (
            <div>
              {fieldLabel(t('vps.create.field.node'))}
              <Select
                value={props.form.nodeId}
                onChange={(e) => props.onUpdate('nodeId', e.target.value)}
                testId="vps.create.node"
                disabled={!props.selectedLocationId}
                options={[{ value: '', label: t('common.select') }, ...props.nodes.map((n) => ({ value: String(n.id), label: nodeLabel(n) }))]}
              />
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function CreateSystemCard(props: {
  form: FormState;
  templatesByFamily: TemplateGroup[];
  selectedTemplate?: OsTemplate;
  onUpdate: UpdateForm;
}) {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.system">
      <CardHeader title={t('vps.create.section.system')} subtitle={t('vps.create.section.system_help')} />
      <CardBody className="space-y-3">
        <div>
          {fieldLabel(t('vps.create.field.os_template'))}
          <Select value={props.form.osTemplateId} onChange={(e) => props.onUpdate('osTemplateId', e.target.value)} testId="vps.create.os_template">
            <option value="">{t('common.select')}</option>
            {props.templatesByFamily.map(([family, templates]) => (
              <optgroup key={family} label={family}>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={String(tpl.id)}>
                    {templateLabel(tpl)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        {props.selectedTemplate ? (
          <div className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted" data-testid="vps.create.system.preview">
            <div className="font-medium text-fg">{templateLabel(props.selectedTemplate)}</div>
            <div>{t('vps.create.system.preview_help')}</div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function CreateIdentityCard(props: { form: FormState; isAdminMode: boolean; onUpdate: UpdateForm }) {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.identity">
      <CardHeader title={t('vps.create.section.identity')} subtitle={t('vps.create.section.identity_help')} />
      <CardBody className="space-y-4">
        <div>
          {fieldLabel(t('vps.create.field.hostname'))}
          <Input
            value={props.form.hostname}
            onChange={(e) => props.onUpdate('hostname', e.target.value)}
            testId="vps.create.hostname"
            placeholder={t('vps.create.placeholder.hostname')}
            autoComplete="off"
          />
        </div>
        <Checkbox checked={props.form.start} onChange={(v) => props.onUpdate('start', v)} label={t('vps.create.field.start')} testId="vps.create.start" />
        {props.isAdminMode ? (
          <div>
            {fieldLabel(t('vps.create.field.info'))}
            <Textarea value={props.form.info} onChange={(e) => props.onUpdate('info', e.target.value)} testId="vps.create.info" rows={4} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function CreateResourcesCard(props: { form: FormState; onApplyPreset: (presetId: string) => void; onUpdate: UpdateForm }) {
  const { t } = useI18n();
  const activePreset = matchingResourcePreset(props.form);

  return (
    <Card testId="vps.create.resources">
      <CardHeader title={t('vps.create.section.resources')} subtitle={t('vps.create.section.resources_help')} />
      <CardBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3" data-testid="vps.create.resource_presets">
          {RESOURCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => props.onApplyPreset(preset.id)}
              className="rounded-lg border border-border bg-surface-2 p-3 text-left transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-focus/35"
              data-testid={`vps.create.preset.${preset.id}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{t(`vps.create.preset.${preset.id}`)}</span>
                {activePreset === preset.id ? <Badge variant="ok">{t('vps.create.preset.selected')}</Badge> : null}
              </div>
              <div className="text-xs text-muted">{t(`vps.create.preset.${preset.id}_help`)}</div>
              <div className="mt-2 text-xs text-muted">
                {t('vps.create.preset.resources', {
                  cpu: preset.cpu,
                  memory: formatMib(preset.memory),
                  disk: formatMib(preset.diskspace),
                })}
              </div>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label={t('vps.create.field.cpu')} value={props.form.cpu} min="1" max="32" testId="vps.create.cpu" onChange={(v) => props.onUpdate('cpu', v)} />
          <NumberField label={t('vps.create.field.memory')} value={props.form.memory} min="1024" max="131072" testId="vps.create.memory" onChange={(v) => props.onUpdate('memory', v)} />
          <NumberField label={t('vps.create.field.diskspace')} value={props.form.diskspace} min="1024" max="10485760" testId="vps.create.diskspace" onChange={(v) => props.onUpdate('diskspace', v)} />
          <NumberField label={t('vps.create.field.swap')} value={props.form.swap} min="0" max="12288" testId="vps.create.swap" onChange={(v) => props.onUpdate('swap', v)} />
        </div>
      </CardBody>
    </Card>
  );
}

export function CreateNetworkCard(props: { form: FormState; onUpdate: UpdateForm }) {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.network">
      <CardHeader title={t('vps.create.section.network')} subtitle={t('vps.create.section.network_help')} />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <NumberField label={t('vps.create.field.ipv4')} value={props.form.ipv4} min="0" max="64" testId="vps.create.ipv4" onChange={(v) => props.onUpdate('ipv4', v)} />
        <NumberField label={t('vps.create.field.ipv6')} value={props.form.ipv6} min="0" max="64" testId="vps.create.ipv6" onChange={(v) => props.onUpdate('ipv6', v)} />
        <NumberField label={t('vps.create.field.ipv4_private')} value={props.form.ipv4Private} min="0" max="64" testId="vps.create.ipv4_private" onChange={(v) => props.onUpdate('ipv4Private', v)} />
      </CardBody>
    </Card>
  );
}

export function CreateAccessHintCard() {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.access_hint">
      <CardHeader title={t('vps.create.section.access')} subtitle={t('vps.create.section.access_help')} />
      <CardBody className="grid gap-3 md:grid-cols-3">
        <div className="flex gap-3 rounded-md border border-border bg-surface-2 p-3">
          <KeyRound className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.access.ssh_keys')}</div>
            <div className="text-xs text-muted">{t('vps.create.access.ssh_keys_help')}</div>
          </div>
        </div>
        <div className="flex gap-3 rounded-md border border-border bg-surface-2 p-3">
          <Server className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.access.root_password')}</div>
            <div className="text-xs text-muted">{t('vps.create.access.root_password_help')}</div>
          </div>
        </div>
        <div className="flex gap-3 rounded-md border border-border bg-surface-2 p-3">
          <KeyRound className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.access.host_keys')}</div>
            <div className="text-xs text-muted">{t('vps.create.access.host_keys_help')}</div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function CreateReviewCard(props: {
  form: FormState;
  isAdminMode: boolean;
  selectedLocation?: Location;
  selectedTemplate?: OsTemplate;
  selectedNode?: Node;
  validationKeys: string[];
  submitted: boolean;
  createError: unknown;
  outcomePending?: boolean;
  outcomePhase?: 'uncertain' | 'accepted';
  outcomeActionStateId?: number;
  outcomeReviewed?: boolean;
  outcomeReviewPending?: boolean;
  outcomeReviewError?: string | null;
  outcomeCandidateVpsId?: number | null;
  isPending: boolean;
  submitDisabled?: boolean;
  onReviewUncertain?: () => void;
  onAcknowledgeUncertain?: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const missing = <span className="text-muted">{t('vps.create.review.missing')}</span>;
  const resourceLine = t('vps.create.review.resources_line', {
    cpu: props.form.cpu || '0',
    memory: formatMib(props.form.memory),
    disk: formatMib(props.form.diskspace),
    swap: formatMib(props.form.swap),
  });
  const networkLine = t('vps.create.review.network_line', {
    ipv4: props.form.ipv4 || '0',
    ipv6: props.form.ipv6 || '0',
    privateIpv4: props.form.ipv4Private || '0',
  });

  return (
    <Card testId="vps.create.confirm">
      <CardHeader
        title={t('vps.create.section.confirm')}
        subtitle={t('vps.create.section.confirm_help')}
        actions={props.validationKeys.length === 0 ? <Badge variant="ok">{t('vps.create.review.ready_badge')}</Badge> : <Badge variant="warn">{t('vps.create.review.needs_input_badge')}</Badge>}
      />
      <CardBody className="space-y-4">
        <dl className="rounded-md border border-border bg-surface-2 px-3" data-testid="vps.create.review">
          {props.isAdminMode ? <SummaryRow label={t('vps.create.review.owner')} value={props.form.userId || missing} /> : null}
          <SummaryRow label={t('vps.create.review.hostname')} value={props.form.hostname.trim() || missing} testId="vps.create.review.hostname" />
          <SummaryRow label={t('vps.create.review.location')} value={props.selectedLocation ? labelOf(props.selectedLocation) : missing} />
          {props.isAdminMode ? <SummaryRow label={t('vps.create.review.node')} value={props.selectedNode ? nodeLabel(props.selectedNode) : missing} /> : null}
          <SummaryRow label={t('vps.create.review.template')} value={props.selectedTemplate ? templateLabel(props.selectedTemplate) : missing} />
          <SummaryRow label={t('vps.create.review.resources')} value={resourceLine} />
          <SummaryRow label={t('vps.create.review.network')} value={networkLine} />
          <SummaryRow label={t('vps.create.review.start')} value={props.form.start ? t('common.yes') : t('common.no')} />
        </dl>

        {props.validationKeys.length === 0 ? (
          <Alert variant="info" title={t('vps.create.review.ready_title')} testId="vps.create.ready">
            {t('vps.create.review.ready_description')}
          </Alert>
        ) : null}

        {(props.submitted || props.createError) && props.validationKeys.length > 0 ? (
          <Alert variant="warn" title={t('common.validation_error')} testId="vps.create.validation">
            <ul className="list-disc space-y-1 pl-5">
              {props.validationKeys.map((key) => <li key={key}>{t(key)}</li>)}
            </ul>
          </Alert>
        ) : null}

        {props.outcomePending ? (
          <Alert variant="info" title={t('vps.create.pending.title')} testId="vps.create.pending">
            {t('vps.create.pending.body')}
          </Alert>
        ) : props.outcomePhase ? (
          <VpsCreateOutcomeAlert
            phase={props.outcomePhase}
            error={props.createError}
            actionStateId={props.outcomeActionStateId}
            reviewed={Boolean(props.outcomeReviewed)}
            reviewPending={Boolean(props.outcomeReviewPending)}
            reviewError={props.outcomeReviewError}
            candidateVpsId={props.outcomeCandidateVpsId}
            onReview={props.onReviewUncertain}
            onAcknowledge={props.onAcknowledgeUncertain}
          />
        ) : props.createError && props.validationKeys.length === 0 ? (
          <Alert variant="danger" title={t('vps.create.error.title')} testId="vps.create.error">
            {isMissingActionStateError(props.createError)
              ? t('vps.create.error.missing_action_state')
              : formatErrorMessage(props.createError)}
          </Alert>
        ) : null}

        <Button
          onClick={props.onSubmit}
          disabled={props.isPending || props.submitDisabled}
          loading={props.isPending}
          testId="vps.create.submit"
          className="w-full justify-center"
        >
          <Plus className="h-4 w-4" />
          {props.isPending ? t('common.creating') : t('vps.create.submit')}
        </Button>
      </CardBody>
    </Card>
  );
}

export function CreatePageIntroCard() {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.intro">
      <CardBody className="grid gap-3 md:grid-cols-3">
        <div className="flex gap-3">
          <Server className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.intro.target')}</div>
            <div className="text-xs text-muted">{t('vps.create.intro.target_help')}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <HardDrive className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.intro.resources')}</div>
            <div className="text-xs text-muted">{t('vps.create.intro.resources_help')}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <Network className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="text-sm font-medium text-fg">{t('vps.create.intro.review')}</div>
            <div className="text-xs text-muted">{t('vps.create.intro.review_help')}</div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function CreateAdvancedHintCard() {
  const { t } = useI18n();

  return (
    <Card testId="vps.create.advanced_hint">
      <CardBody className="flex gap-3 text-sm text-muted">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{t('vps.create.advanced_hint')}</div>
      </CardBody>
    </Card>
  );
}
