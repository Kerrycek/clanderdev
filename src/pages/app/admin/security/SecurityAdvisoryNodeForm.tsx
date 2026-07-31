import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Textarea } from '../../../../components/ui/Textarea';
import {
  type SecurityAdvisoryNodeStatus,
  type SecurityAdvisoryNodeStatusCreatePayload,
} from '../../../../lib/api/securityAdvisories';
import { isoToLocalInput, localInputToIso } from '../../../../lib/datetimeLocal';

const NODE_STATES = ['unknown', 'not_affected', 'vulnerable', 'mitigated'] as const;
type KnownNodeState = (typeof NODE_STATES)[number];

export interface SecurityAdvisoryNodeFormValues {
  state: KnownNodeState;
  vulnerableUntil: string;
  mitigatedSince: string;
  note: string;
}

export type SecurityAdvisoryNodePayloadResult =
  | { valid: true; payload: SecurityAdvisoryNodeStatusCreatePayload }
  | { valid: false; reason: 'vulnerable_until_required' | 'mitigated_since_required' | 'invalid_date' };

export function securityAdvisoryNodeStatusNodeId(status: SecurityAdvisoryNodeStatus): number | null {
  if (typeof status.node_id === 'number' && Number.isFinite(status.node_id)) return status.node_id;
  if (typeof status.node === 'number' && Number.isFinite(status.node)) return status.node;
  if (status.node && typeof status.node === 'object') {
    const id = status.node.id;
    if (typeof id === 'number' && Number.isFinite(id)) return id;
  }
  return null;
}

export function buildSecurityAdvisoryNodeStatusPayload(
  nodeId: number,
  values: SecurityAdvisoryNodeFormValues,
): SecurityAdvisoryNodePayloadResult {
  if (values.state === 'not_affected' || values.state === 'unknown') {
    return {
      valid: true,
      payload: {
        node: nodeId,
        state: values.state,
        vulnerable_until: null,
        mitigated_since: null,
        note: values.note.trim() || null,
      },
    };
  }

  if (values.state === 'mitigated' && !values.vulnerableUntil.trim()) {
    return { valid: false, reason: 'vulnerable_until_required' };
  }
  if (values.state === 'mitigated' && !values.mitigatedSince.trim()) {
    return { valid: false, reason: 'mitigated_since_required' };
  }

  const vulnerableUntil = localInputToIso(values.vulnerableUntil);
  const mitigatedSince = localInputToIso(values.mitigatedSince);
  if (!vulnerableUntil.valid || !mitigatedSince.valid) return { valid: false, reason: 'invalid_date' };

  return {
    valid: true,
    payload: {
      node: nodeId,
      state: values.state,
      vulnerable_until: vulnerableUntil.iso,
      mitigated_since: values.state === 'mitigated' ? mitigatedSince.iso : null,
      note: values.note.trim() || null,
    },
  };
}

export function remainingSecurityAdvisoryBulkNodeIds(
  nodeIds: number[],
  completedNodeIds: ReadonlySet<number>,
): number[] {
  return nodeIds.filter((nodeId) => !completedNodeIds.has(nodeId));
}

export function securityAdvisoryNodeFormValues(
  status?: SecurityAdvisoryNodeStatus | null,
): SecurityAdvisoryNodeFormValues {
  const state = NODE_STATES.includes(String(status?.state ?? '') as KnownNodeState)
    ? (String(status?.state) as KnownNodeState)
    : 'unknown';
  return {
    state,
    vulnerableUntil: isoToLocalInput(status?.vulnerable_until),
    mitigatedSince: isoToLocalInput(status?.mitigated_since),
    note: String(status?.note ?? ''),
  };
}

export function SecurityAdvisoryNodeFormFields(props: {
  values: SecurityAdvisoryNodeFormValues;
  onChange: (values: SecurityAdvisoryNodeFormValues) => void;
  testId: string;
}) {
  const { t } = useI18n();
  const payload = buildSecurityAdvisoryNodeStatusPayload(0, props.values);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted">
          {t('admin.security_advisories.nodes.field.state')}
        </span>
        <Select
          ariaLabel={t('admin.security_advisories.nodes.field.state')}
          value={props.values.state}
          onChange={(event) => props.onChange({ ...props.values, state: event.target.value as KnownNodeState })}
          options={NODE_STATES.map((state) => ({
            value: state,
            label: t(`admin.security_advisories.nodes.state.${state}`),
          }))}
          testId={`${props.testId}.state`}
        />
      </label>

      {props.values.state === 'vulnerable' || props.values.state === 'mitigated' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              {t('admin.security_advisories.nodes.field.vulnerable_until')}
            </span>
            <Input
              type="datetime-local"
              ariaLabel={t('admin.security_advisories.nodes.field.vulnerable_until')}
              value={props.values.vulnerableUntil}
              onChange={(event) => props.onChange({ ...props.values, vulnerableUntil: event.target.value })}
              testId={`${props.testId}.vulnerable_until`}
            />
          </label>
          {props.values.state === 'mitigated' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">
                {t('admin.security_advisories.nodes.field.mitigated_since')}
              </span>
              <Input
                type="datetime-local"
                ariaLabel={t('admin.security_advisories.nodes.field.mitigated_since')}
                value={props.values.mitigatedSince}
                onChange={(event) => props.onChange({ ...props.values, mitigatedSince: event.target.value })}
                testId={`${props.testId}.mitigated_since`}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div>
        <Textarea
          label={t('admin.security_advisories.nodes.field.note')}
          value={props.values.note}
          onChange={(event) => props.onChange({ ...props.values, note: event.target.value })}
          rows={3}
          testId={`${props.testId}.note`}
        />
        <p className="mt-1 text-xs text-muted">
          {t('admin.security_advisories.nodes.field.note_help')}
        </p>
      </div>

      {!payload.valid ? (
        <Alert variant="warn" title={t('admin.security_advisories.nodes.validation.title')}>
          {t(`admin.security_advisories.nodes.validation.${payload.reason}`)}
        </Alert>
      ) : null}
    </div>
  );
}
