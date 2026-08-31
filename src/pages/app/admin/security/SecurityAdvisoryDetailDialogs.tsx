import { Send } from 'lucide-react';

import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';
import type { Language } from '../../../../lib/api/languages';
import type {
  SecurityAdvisory,
  SecurityAdvisoryOutageLink,
  SecurityAdvisoryUpdate,
} from '../../../../lib/api/securityAdvisories';
import { localInputToIso } from '../../../../lib/datetimeLocal';
import {
  SecurityAdvisoryEditorModal,
  type SecurityAdvisoryEditorValues,
} from './SecurityAdvisoryEditorModal';
import {
  SecurityAdvisoryUpdateModal,
  type SecurityAdvisoryUpdateValues,
} from './SecurityAdvisoryUpdateModal';

export function SecurityAdvisoryDetailDialogs(props: {
  advisory: SecurityAdvisory;
  advisoryId: number;
  state: string;
  canEditParent: boolean;
  canPostUpdate: boolean;
  languages: Language[];
  cves: string[];
  editorOpen: boolean;
  editorError: string | null;
  editorSaving: boolean;
  onEditorClose: () => void;
  onEditorSubmit: (values: SecurityAdvisoryEditorValues, cves: string[]) => void;
  publishOpen: boolean;
  publishAt: string;
  publishMail: boolean;
  publishError: string | null;
  publishSaving: boolean;
  publishBlocked: boolean;
  onPublishClose: () => void;
  onPublishAtChange: (value: string) => void;
  onPublishMailChange: (value: boolean) => void;
  onPublishConfirm: () => void;
  rebuildOpen: boolean;
  rebuildSaving: boolean;
  onRebuildClose: () => void;
  onRebuildConfirm: () => void;
  updateEditorOpen: boolean;
  editingUpdate: SecurityAdvisoryUpdate | null;
  deleteUpdateTarget: SecurityAdvisoryUpdate | null;
  updateError: string | null;
  updateSaving: boolean;
  onUpdateEditorClose: () => void;
  onUpdateSubmit: (values: SecurityAdvisoryUpdateValues) => void;
  onEditUpdateClose: () => void;
  onEditUpdateSubmit: (values: SecurityAdvisoryUpdateValues) => void;
  onDeleteUpdateClose: () => void;
  onDeleteUpdateConfirm: () => void;
  deleteUpdateSaving: boolean;
  updateConfirmOpen: boolean;
  pendingUpdate: SecurityAdvisoryUpdateValues | null;
  onUpdateConfirmClose: () => void;
  onUpdateConfirm: () => void;
  unlinkTarget: SecurityAdvisoryOutageLink | null;
  unlinkSaving: boolean;
  onUnlinkClose: () => void;
  onUnlinkConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <SecurityAdvisoryEditorModal
        open={props.editorOpen && props.canEditParent}
        mode="edit"
        advisory={props.advisory}
        languages={props.languages}
        cves={props.cves}
        error={props.editorError}
        saving={props.editorSaving}
        onClose={props.onEditorClose}
        onSubmit={props.onEditorSubmit}
      />

      <Modal
        open={props.publishOpen}
        onClose={props.onPublishClose}
        title={t('admin.security_advisories.publish.title')}
        size="sm"
        testId="admin.security_advisory.publish_dialog"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={props.onPublishClose} disabled={props.publishSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={props.onPublishConfirm}
              loading={props.publishSaving}
              disabled={props.publishBlocked || !localInputToIso(props.publishAt).valid}
              testId="admin.security_advisory.publish_dialog.confirm"
            >
              <Send size={16} /> {t('admin.security_advisories.action.publish')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Alert variant="warn" title={t('admin.security_advisories.publish.warning_title')}>
            {t('admin.security_advisories.publish.warning_body', { cves: props.cves.join(', ') })}
          </Alert>
          {props.publishError ? <Alert variant="danger" title={t('common.error')}>{props.publishError}</Alert> : null}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              {t('admin.security_advisories.field.published_at')}
            </span>
            <Input
              type="datetime-local"
              value={props.publishAt}
              onChange={(event) => props.onPublishAtChange(event.target.value)}
              testId="admin.security_advisory.publish_dialog.published_at"
            />
          </label>
          <Checkbox
            checked={props.publishMail}
            onChange={props.onPublishMailChange}
            label={t('admin.security_advisories.publish.send_mail')}
            description={t('admin.security_advisories.publish.send_mail_help')}
            testId="admin.security_advisory.publish_dialog.send_mail"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={props.rebuildOpen}
        onCancel={props.onRebuildClose}
        onConfirm={props.onRebuildConfirm}
        title={t('admin.security_advisories.rebuild.title')}
        description={t('admin.security_advisories.rebuild.body')}
        confirmLabel={t('admin.security_advisories.action.rebuild')}
        confirmLoading={props.rebuildSaving}
        testId="admin.security_advisory.rebuild_dialog"
      />

      <SecurityAdvisoryUpdateModal
        open={props.updateEditorOpen && props.canPostUpdate}
        mode="create"
        advisoryId={props.advisoryId}
        advisoryPublishedAt={props.advisory.published_at}
        currentState={props.state}
        update={null}
        languages={props.languages}
        saving={props.updateSaving}
        error={props.updateError}
        onClose={props.onUpdateEditorClose}
        onSubmit={props.onUpdateSubmit}
      />

      <SecurityAdvisoryUpdateModal
        open={Boolean(props.editingUpdate)}
        mode="edit"
        advisoryId={props.advisoryId}
        currentState={props.state}
        update={props.editingUpdate}
        languages={props.languages}
        saving={props.updateSaving}
        error={props.updateError}
        onClose={props.onEditUpdateClose}
        onSubmit={props.onEditUpdateSubmit}
      />

      <ConfirmDialog
        open={Boolean(props.deleteUpdateTarget)}
        onCancel={props.onDeleteUpdateClose}
        onConfirm={props.onDeleteUpdateConfirm}
        title={t('admin.security_advisories.update.delete_title')}
        description={t('admin.security_advisories.update.delete_body')}
        confirmLabel={t('common.delete')}
        confirmLoading={props.deleteUpdateSaving}
        danger
        testId="admin.security_advisory.update.delete_confirm"
      />

      <ConfirmDialog
        open={props.updateConfirmOpen}
        onCancel={props.onUpdateConfirmClose}
        onConfirm={props.onUpdateConfirm}
        title={
          props.pendingUpdate?.state === 'retracted'
            ? t('admin.security_advisories.update.retract_confirm_title')
            : t('admin.security_advisories.update.mail_confirm_title')
        }
        description={
          props.pendingUpdate?.state === 'retracted'
            ? t('admin.security_advisories.update.retract_confirm_body')
            : t('admin.security_advisories.update.mail_confirm_body')
        }
        danger={props.pendingUpdate?.state === 'retracted'}
        confirmLoading={props.updateSaving}
        testId="admin.security_advisory.update.confirm"
      />

      <ConfirmDialog
        open={Boolean(props.unlinkTarget)}
        onCancel={props.onUnlinkClose}
        onConfirm={props.onUnlinkConfirm}
        title={t('admin.security_advisories.outages.unlink_title')}
        description={t('admin.security_advisories.outages.unlink_body')}
        danger
        confirmLoading={props.unlinkSaving}
        testId="admin.security_advisory.outages.unlink"
      />
    </>
  );
}
