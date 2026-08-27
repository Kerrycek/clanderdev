import React, { useMemo, useState } from 'react';
import { Layers3, Pencil, Trash2 } from 'lucide-react';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { Modal } from '../../../../components/ui/Modal';
import { TableCard } from '../../../../components/ui/TableCard';
import {
  createSecurityAdvisoryNodeStatus,
  deleteSecurityAdvisoryNodeStatus,
  updateSecurityAdvisoryNodeStatus,
  type SecurityAdvisoryNodeStatus,
  type SecurityAdvisoryNodeStatusCreatePayload,
} from '../../../../lib/api/securityAdvisories';
import type { Node } from '../../../../lib/api/nodes';
import { formatErrorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { relevantSecurityAdvisoryNodes } from './securityAdvisoryAdminModel';
import {
  buildSecurityAdvisoryNodeStatusPayload,
  remainingSecurityAdvisoryBulkNodeIds,
  SecurityAdvisoryNodeFormFields,
  securityAdvisoryNodeFormValues,
  securityAdvisoryNodeStatusNodeId,
  type SecurityAdvisoryNodeFormValues,
} from './SecurityAdvisoryNodeForm';

export {
  buildSecurityAdvisoryNodeStatusPayload,
  remainingSecurityAdvisoryBulkNodeIds,
  securityAdvisoryNodeStatusNodeId,
  type SecurityAdvisoryNodeFormValues,
} from './SecurityAdvisoryNodeForm';

function nodeLabel(node: Node): string {
  return String(node.domain_name ?? node.fqdn ?? node.name ?? `#${node.id}`);
}

function nodeStatusMap(statuses: SecurityAdvisoryNodeStatus[]): Map<number, SecurityAdvisoryNodeStatus> {
  const result = new Map<number, SecurityAdvisoryNodeStatus>();
  for (const status of [...statuses].sort((a, b) => a.id - b.id)) {
    const nodeId = securityAdvisoryNodeStatusNodeId(status);
    if (nodeId !== null) result.set(nodeId, status);
  }
  return result;
}

function stateBadgeVariant(state: string): 'neutral' | 'ok' | 'warn' | 'danger' {
  if (state === 'not_affected') return 'ok';
  if (state === 'mitigated') return 'warn';
  if (state === 'vulnerable') return 'danger';
  return 'neutral';
}

function withoutNode(payload: SecurityAdvisoryNodeStatusCreatePayload) {
  const { node: _node, ...update } = payload;
  return update;
}

export function SecurityAdvisoryNodesPanel(props: {
  advisoryId: number;
  nodes: Node[];
  statuses: SecurityAdvisoryNodeStatus[];
  loading?: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const relevantNodes = useMemo(() => relevantSecurityAdvisoryNodes(props.nodes), [props.nodes]);
  const statusesByNode = useMemo(() => nodeStatusMap(props.statuses), [props.statuses]);

  const [editor, setEditor] = useState<{ node: Node; status: SecurityAdvisoryNodeStatus | null } | null>(null);
  const [editorValues, setEditorValues] = useState<SecurityAdvisoryNodeFormValues>(() => securityAdvisoryNodeFormValues());
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ node: Node; status: SecurityAdvisoryNodeStatus } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkValues, setBulkValues] = useState<SecurityAdvisoryNodeFormValues>(() => securityAdvisoryNodeFormValues());
  const [bulkTargetIds, setBulkTargetIds] = useState<number[]>([]);
  const [bulkCompleted, setBulkCompleted] = useState<Set<number>>(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const editorPayload = editor ? buildSecurityAdvisoryNodeStatusPayload(editor.node.id, editorValues) : null;
  const bulkPayload = buildSecurityAdvisoryNodeStatusPayload(relevantNodes[0]?.id ?? 0, bulkValues);
  const remainingBulkIds = remainingSecurityAdvisoryBulkNodeIds(bulkTargetIds, bulkCompleted);

  const stateLabel = (state: string) => t(`admin.security_advisories.nodes.state.${state}`);
  const openEditor = (node: Node, status: SecurityAdvisoryNodeStatus | null) => {
    setEditor({ node, status });
    setEditorValues(securityAdvisoryNodeFormValues(status));
    setEditorError(null);
  };

  const saveEditor = async () => {
    if (!editor || !editorPayload?.valid) return;
    setEditorSaving(true);
    setEditorError(null);
    try {
      if (editor.status) {
        await updateSecurityAdvisoryNodeStatus(props.advisoryId, editor.status.id, withoutNode(editorPayload.payload));
      } else {
        await createSecurityAdvisoryNodeStatus(props.advisoryId, editorPayload.payload);
      }
      props.onChanged();
      setEditor(null);
      pushToast({ variant: 'ok', title: t('admin.security_advisories.nodes.toast.saved') });
    } catch (error) {
      const message = formatErrorMessage(error);
      setEditorError(message);
      pushToast({ variant: 'danger', title: t('admin.security_advisories.nodes.toast.save_failed'), body: message });
    } finally {
      setEditorSaving(false);
    }
  };

  const deleteStatus = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSecurityAdvisoryNodeStatus(props.advisoryId, deleteTarget.status.id);
      setDeleteTarget(null);
      props.onChanged();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.nodes.toast.deleted') });
    } catch (error) {
      pushToast({
        variant: 'danger',
        title: t('admin.security_advisories.nodes.toast.delete_failed'),
        body: formatErrorMessage(error),
      });
    } finally {
      setDeleting(false);
    }
  };

  const openBulk = () => {
    setBulkOpen(true);
    setBulkConfirm(false);
    setBulkValues(securityAdvisoryNodeFormValues());
    setBulkTargetIds(relevantNodes.map((node) => node.id));
    setBulkCompleted(new Set());
    setBulkError(null);
  };

  const runBulk = async () => {
    const parsed = buildSecurityAdvisoryNodeStatusPayload(0, bulkValues);
    if (!parsed.valid) return;

    setBulkConfirm(false);
    setBulkRunning(true);
    setBulkError(null);
    const completed = new Set(bulkCompleted);
    let changed = false;

    try {
      for (const nodeId of remainingSecurityAdvisoryBulkNodeIds(bulkTargetIds, completed)) {
        const payload = { ...parsed.payload, node: nodeId };
        const existing = statusesByNode.get(nodeId);
        if (existing) {
          await updateSecurityAdvisoryNodeStatus(props.advisoryId, existing.id, withoutNode(payload));
        } else {
          await createSecurityAdvisoryNodeStatus(props.advisoryId, payload);
        }
        changed = true;
        completed.add(nodeId);
        setBulkCompleted(new Set(completed));
      }

      if (changed) props.onChanged();
      setBulkOpen(false);
      pushToast({ variant: 'ok', title: t('admin.security_advisories.nodes.toast.bulk_saved') });
    } catch (error) {
      if (changed) props.onChanged();
      const message = formatErrorMessage(error);
      setBulkError(message);
      pushToast({
        variant: 'danger',
        title: t('admin.security_advisories.nodes.toast.bulk_failed'),
        body: message,
        autoDismissMs: false,
      });
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <Card testId="admin.security_advisories.nodes.panel">
      <CardHeader
        title={t('admin.security_advisories.nodes.title')}
        subtitle={t('admin.security_advisories.nodes.subtitle')}
        actions={
          <Button
            variant="secondary"
            onClick={openBulk}
            disabled={props.loading || relevantNodes.length === 0}
            testId="admin.security_advisories.nodes.bulk.open"
          >
            <Layers3 size={16} /> {t('admin.security_advisories.nodes.action.bulk')}
          </Button>
        }
      />

      {props.loading ? (
        <CardBody><LoadingState /></CardBody>
      ) : relevantNodes.length === 0 ? (
        <CardBody>
          <Alert variant="neutral" title={t('admin.security_advisories.nodes.empty.title')}>
            {t('admin.security_advisories.nodes.empty.body')}
          </Alert>
        </CardBody>
      ) : (
        <TableCard className="rounded-none border-0 shadow-none" minWidth="lg" testId="admin.security_advisories.nodes.table">
          <thead>
            <tr>
              <th>{t('admin.security_advisories.nodes.table.node')}</th>
              <th>{t('admin.security_advisories.nodes.table.type')}</th>
              <th>{t('admin.security_advisories.nodes.table.state')}</th>
              <th>{t('admin.security_advisories.nodes.table.vulnerable_until')}</th>
              <th>{t('admin.security_advisories.nodes.table.mitigated_since')}</th>
              <th>{t('admin.security_advisories.nodes.table.note')}</th>
              <th className="text-right">{t('admin.security_advisories.nodes.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {relevantNodes.map((node) => {
              const status = statusesByNode.get(node.id) ?? null;
              const state = String(status?.state ?? 'missing');
              return (
                <tr key={node.id} className="table-row-tone" data-testid={`admin.security_advisories.nodes.row.${node.id}`}>
                  <td>
                    <div className="font-semibold">{nodeLabel(node)}</div>
                    <div className="text-xs text-faint">#{node.id}</div>
                  </td>
                  <td>{t(`admin.security_advisories.nodes.type.${String(node.type ?? 'node')}`)}</td>
                  <td>
                    <Badge variant={stateBadgeVariant(state)}>
                      {state === 'missing' ? t('admin.security_advisories.nodes.state.missing') : stateLabel(state)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap text-sm text-muted">
                    {status?.vulnerable_until ? formatDateTime(status.vulnerable_until) : '—'}
                  </td>
                  <td className="whitespace-nowrap text-sm text-muted">
                    {status?.mitigated_since ? formatDateTime(status.mitigated_since) : '—'}
                  </td>
                  <td className="max-w-xs break-words text-sm text-muted">{status?.note || '—'}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditor(node, status)}
                        testId={`admin.security_advisories.nodes.row.${node.id}.edit`}
                      >
                        <Pencil size={14} /> {t('admin.security_advisories.nodes.action.edit')}
                      </Button>
                      {status ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setDeleteTarget({ node, status })}
                          testId={`admin.security_advisories.nodes.row.${node.id}.delete`}
                        >
                          <Trash2 size={14} /> {t('admin.security_advisories.nodes.action.delete')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <Modal
        open={editor !== null}
        onClose={() => !editorSaving && setEditor(null)}
        title={t('admin.security_advisories.nodes.editor.title', { node: editor ? nodeLabel(editor.node) : '' })}
        testId="admin.security_advisories.nodes.editor"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditor(null)} disabled={editorSaving}>
              {t('admin.security_advisories.nodes.action.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={saveEditor}
              loading={editorSaving}
              disabled={!editorPayload?.valid}
              testId="admin.security_advisories.nodes.editor.save"
            >
              {t('admin.security_advisories.nodes.action.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editorError ? <Alert variant="danger" title={t('admin.security_advisories.nodes.error.title')}>{editorError}</Alert> : null}
          <SecurityAdvisoryNodeFormFields
            values={editorValues}
            onChange={setEditorValues}
            testId="admin.security_advisories.nodes.editor"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('admin.security_advisories.nodes.delete.title')}
        description={t('admin.security_advisories.nodes.delete.description', {
          node: deleteTarget ? nodeLabel(deleteTarget.node) : '',
        })}
        danger
        confirmLabel={t('admin.security_advisories.nodes.action.delete')}
        confirmLoading={deleting}
        onConfirm={deleteStatus}
        onCancel={() => setDeleteTarget(null)}
        testId="admin.security_advisories.nodes.delete"
      />

      <Modal
        open={bulkOpen}
        onClose={() => !bulkRunning && setBulkOpen(false)}
        title={t('admin.security_advisories.nodes.bulk.title')}
        testId="admin.security_advisories.nodes.bulk"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {t('admin.security_advisories.nodes.bulk.progress', {
                completed: bulkCompleted.size,
                total: bulkTargetIds.length,
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setBulkOpen(false)} disabled={bulkRunning}>
                {t('admin.security_advisories.nodes.action.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => setBulkConfirm(true)}
                loading={bulkRunning}
                disabled={!bulkPayload.valid || remainingBulkIds.length === 0}
                testId="admin.security_advisories.nodes.bulk.apply"
              >
                {bulkError && bulkCompleted.size > 0
                  ? t('admin.security_advisories.nodes.action.continue_remaining')
                  : t('admin.security_advisories.nodes.action.apply')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert variant="warn" title={t('admin.security_advisories.nodes.bulk.warning_title')}>
            {t('admin.security_advisories.nodes.bulk.warning_body', { count: bulkTargetIds.length })}
          </Alert>
          {bulkError ? (
            <Alert variant="danger" title={t('admin.security_advisories.nodes.bulk.partial_failure_title')}>
              {t('admin.security_advisories.nodes.bulk.partial_failure_body', {
                completed: bulkCompleted.size,
                remaining: remainingBulkIds.length,
              })}
              <div className="mt-1">{bulkError}</div>
            </Alert>
          ) : null}
          <SecurityAdvisoryNodeFormFields
            values={bulkValues}
            onChange={setBulkValues}
            testId="admin.security_advisories.nodes.bulk"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={bulkConfirm}
        title={t('admin.security_advisories.nodes.bulk.confirm_title')}
        description={t('admin.security_advisories.nodes.bulk.confirm_description', {
          count: remainingBulkIds.length,
          state: stateLabel(bulkValues.state),
        })}
        danger
        confirmLabel={t('admin.security_advisories.nodes.action.apply')}
        onConfirm={runBulk}
        onCancel={() => setBulkConfirm(false)}
        testId="admin.security_advisories.nodes.bulk.confirm"
      />
    </Card>
  );
}
