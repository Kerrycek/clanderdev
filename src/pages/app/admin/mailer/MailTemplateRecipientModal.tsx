import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import {
  addMailTemplateRecipient,
  createMailRecipient,
  fetchMailRecipients,
} from '../../../../lib/api/mailer';
import { isAmbiguousMutationError } from '../../../../lib/api/haveapi';
import { formatErrorMessage } from '../../../../lib/errors';

import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';

import {
  canSubmitMailRecipientCreate,
  emptyMailRecipientDraft,
  isMailRecipientDraftLocked,
  retryMailRecipientId,
  type MailRecipientCreateRecovery,
  type MailRecipientDraft,
} from './MailTemplateRecipientCreateModel';
import {
  clearMailRecipientCreateGuard,
  clearMailTemplateRecipientGuard,
  persistMailRecipientCreateGuard,
  persistMailTemplateRecipientGuard,
  readMailRecipientCreateGuard,
  readMailTemplateRecipientGuard,
  type MailTemplateRecipientGuardState,
} from './mailRecipientMutationGuardStorage';
import { MailTemplateRecipientRecoveryNotice } from './MailTemplateRecipientRecoveryNotice';
import { MailTemplateRecipientExistingPicker } from './MailTemplateRecipientExistingPicker';
import { MailRecipientDraftFields } from './MailRecipientDraftFields';
import { strictPositiveIntegerId } from './mailerMutationSafety';

function sameRecipientDraft(left: MailRecipientDraft, right: MailRecipientDraft): boolean {
  return left.label === right.label
    && left.to === right.to
    && left.cc === right.cc
    && left.bcc === right.bcc;
}

export function MailTemplateRecipientModal(props: {
  open: boolean;
  templateId: number;
  guardScope: string | number;
  actionsBlocked: boolean;
  associatedRecipientIds: Set<number>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [initialGuards] = useState(() => {
    const templateGuard = readMailTemplateRecipientGuard(props.guardScope, props.templateId);
    const globalCreateGuard = readMailRecipientCreateGuard(props.guardScope);
    const sameNestedCreate = Boolean(
      templateGuard
      && globalCreateGuard
      && templateGuard.recovery.phase === 'create_uncertain'
      && sameRecipientDraft(templateGuard.draft, globalCreateGuard),
    );
    const globalGuard: MailTemplateRecipientGuardState | null = globalCreateGuard
      ? {
          draft: globalCreateGuard,
          recovery: { phase: 'create_uncertain' },
          existingLinkUncertainRecipientId: null,
        }
      : null;
    return {
      activeGuard: globalGuard ?? templateGuard,
      globalRecoveryActive: globalGuard !== null,
      retainedTemplateGuard: globalGuard && templateGuard && !sameNestedCreate ? templateGuard : null,
    };
  });
  const initialGuard = initialGuards.activeGuard;
  const [mode, setMode] = useState<'existing' | 'create'>(
    initialGuard && initialGuard.recovery.phase !== 'draft' ? 'create' : 'existing',
  );
  const [search, setSearch] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null);
  const [existingLinkUncertainRecipientId, setExistingLinkUncertainRecipientId] = useState<number | null>(
    initialGuard?.existingLinkUncertainRecipientId ?? null,
  );
  const [createRecovery, setCreateRecovery] = useState<MailRecipientCreateRecovery>(
    initialGuard?.recovery ?? { phase: 'draft' },
  );
  const [draft, setDraft] = useState<MailRecipientDraft>(initialGuard?.draft ?? emptyMailRecipientDraft);
  const createSubmitRef = useRef(false);
  const existingSubmitRef = useRef(false);
  const globalRecoveryActiveRef = useRef(initialGuards.globalRecoveryActive);
  const retainedTemplateGuardRef = useRef(initialGuards.retainedTemplateGuard);

  const allRecipientsQ = useQuery({
    queryKey: ['mailer', 'mail_recipients', 'index', { limit: 500 }],
    enabled: props.open,
    queryFn: async () => (await fetchMailRecipients({ limit: 500 })).data,
    staleTime: 30_000,
  });

  const resetAfterSuccess = () => {
    clearMailRecipientCreateGuard(props.guardScope);
    clearMailTemplateRecipientGuard(props.guardScope, props.templateId);
    globalRecoveryActiveRef.current = false;
    retainedTemplateGuardRef.current = null;
    setSelectedRecipientId(null);
    setExistingLinkUncertainRecipientId(null);
    setCreateRecovery({ phase: 'draft' });
    setSearch('');
    setMode('existing');
    setDraft(emptyMailRecipientDraft());
    props.onClose();
  };

  const persistGuard = (
    recovery: MailRecipientCreateRecovery,
    existingId: number | null,
    nextDraft: MailRecipientDraft = draft,
  ) => persistMailTemplateRecipientGuard(props.guardScope, props.templateId, {
    draft: nextDraft,
    recovery,
    existingLinkUncertainRecipientId: existingId,
  });

  const clearCreateGuards = () => {
    clearMailRecipientCreateGuard(props.guardScope);
    clearMailTemplateRecipientGuard(props.guardScope, props.templateId);
    globalRecoveryActiveRef.current = false;
    retainedTemplateGuardRef.current = null;
  };

  const persistCreateGuards = (nextDraft: MailRecipientDraft) => {
    const globalPersisted = persistMailRecipientCreateGuard(props.guardScope, nextDraft);
    const templatePersisted = persistGuard({ phase: 'create_uncertain' }, null, nextDraft);
    if (globalPersisted && templatePersisted) {
      globalRecoveryActiveRef.current = true;
      retainedTemplateGuardRef.current = null;
      return true;
    }

    // The POST has not started yet, so a partial guard can be safely removed.
    clearCreateGuards();
    return false;
  };

  const addRecipientM = useMutation({
    mutationFn: async (attempt: { mailRecipientId: number; source: 'existing' | 'created' }) => {
      const guardedRecovery: MailRecipientCreateRecovery = attempt.source === 'created'
        ? { phase: 'link_uncertain', recipientId: attempt.mailRecipientId }
        : { phase: 'draft' };
      const guardedExistingId = attempt.source === 'existing' ? attempt.mailRecipientId : null;
      if (!persistGuard(guardedRecovery, guardedExistingId)) {
        throw new Error(t('mailer.templates.detail.recipients.modal.guard_storage_error'));
      }
      const linked = (await addMailTemplateRecipient(props.templateId, attempt.mailRecipientId)).data;
      const linkId = strictPositiveIntegerId(linked?.id);
      if (linkId === null) {
        throw new TypeError('Malformed mail template recipient response: missing id');
      }
      return { ...linked, id: linkId };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'recipients'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'show'] });
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'index'] });
      resetAfterSuccess();
    },
    onSettled: () => {
      existingSubmitRef.current = false;
    },
  });

  const createRecipientM = useMutation({
    mutationFn: async (payload: MailRecipientDraft) => {
      if (!persistCreateGuards(payload)) {
        throw new Error(t('mailer.templates.detail.recipients.modal.guard_storage_error'));
      }
      const created = (await createMailRecipient({
        label: payload.label,
        to: payload.to || undefined,
        cc: payload.cc || undefined,
        bcc: payload.bcc || undefined,
      })).data;
      const createdId = strictPositiveIntegerId(created?.id);
      if (createdId === null) {
        throw new TypeError('Malformed mail recipient create response: missing id');
      }
      return { ...created, id: createdId };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['mailer', 'mail_recipients', 'index'] });
    },
  });

  const pending = createRecipientM.isPending || addRecipientM.isPending;
  const draftLocked = isMailRecipientDraftLocked(createRecovery);
  const recoveryLocked = existingLinkUncertainRecipientId !== null || createRecovery.phase !== 'draft';
  const canSubmitCreate = !props.actionsBlocked && canSubmitMailRecipientCreate({
    draft,
    recovery: createRecovery,
    pending,
  });
  const resetCreate = () => {
    if (pending) return;
    createSubmitRef.current = false;
    clearCreateGuards();
    setCreateRecovery({ phase: 'draft' });
    setDraft(emptyMailRecipientDraft());
    createRecipientM.reset();
    addRecipientM.reset();
    window.setTimeout(() => {
      const target = props.actionsBlocked
        ? 'admin.mailer.templates.detail.recipients.modal.cancel'
        : 'admin.mailer.templates.detail.recipients.modal.mode.create';
      document.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus();
    }, 0);
  };

  const unlockUncertain = () => {
    if (pending) return;
    if (globalRecoveryActiveRef.current && retainedTemplateGuardRef.current) {
      const retainedGuard = retainedTemplateGuardRef.current;
      clearMailRecipientCreateGuard(props.guardScope);
      globalRecoveryActiveRef.current = false;
      retainedTemplateGuardRef.current = null;
      setMode(retainedGuard.recovery.phase === 'draft' ? 'existing' : 'create');
      setExistingLinkUncertainRecipientId(retainedGuard.existingLinkUncertainRecipientId);
      setCreateRecovery(retainedGuard.recovery);
      setSelectedRecipientId(null);
      setDraft(retainedGuard.draft);
      createRecipientM.reset();
      addRecipientM.reset();
      return;
    }
    clearCreateGuards();
    setExistingLinkUncertainRecipientId(null);
    setCreateRecovery({ phase: 'draft' });
    setSelectedRecipientId(null);
    setDraft(emptyMailRecipientDraft());
    createRecipientM.reset();
    addRecipientM.reset();
    window.setTimeout(() => {
      const target = props.actionsBlocked
        ? 'admin.mailer.templates.detail.recipients.modal.cancel'
        : `admin.mailer.templates.detail.recipients.modal.mode.${mode}`;
      document.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus();
    }, 0);
  };

  useEffect(() => {
    const reconciledExisting = existingLinkUncertainRecipientId
      && props.associatedRecipientIds.has(existingLinkUncertainRecipientId);
    const reconciledCreated = createRecovery.phase === 'link_uncertain'
      && props.associatedRecipientIds.has(createRecovery.recipientId);
    if (reconciledExisting || reconciledCreated) {
      resetAfterSuccess();
    }
    // resetAfterSuccess intentionally reacts only to a reconciled relation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRecovery, existingLinkUncertainRecipientId, props.associatedRecipientIds]);

  const close = () => {
    if (!pending) props.onClose();
  };

  const submitExisting = async () => {
    if (
      !selectedRecipientId
      || props.actionsBlocked
      || pending
      || existingSubmitRef.current
      || existingLinkUncertainRecipientId !== null
      || createRecovery.phase !== 'draft'
      || props.associatedRecipientIds.has(selectedRecipientId)
    ) return;

    existingSubmitRef.current = true;
    try {
      await addRecipientM.mutateAsync({ mailRecipientId: selectedRecipientId, source: 'existing' });
    } catch (error) {
      if (isAmbiguousMutationError(error)) {
        setExistingLinkUncertainRecipientId(selectedRecipientId);
        void qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'recipients'] });
      } else {
        clearMailTemplateRecipientGuard(props.guardScope, props.templateId);
      }
    } finally {
      existingSubmitRef.current = false;
    }
  };

  const submitCreateAndAdd = async () => {
    if (props.actionsBlocked || pending || createSubmitRef.current || !canSubmitCreate) return;
    createSubmitRef.current = true;

    try {
      let recipientId = retryMailRecipientId(createRecovery);

      if (!recipientId) {
        try {
          const createDraft = {
            label: draft.label.trim(),
            to: draft.to.trim(),
            cc: draft.cc.trim(),
            bcc: draft.bcc.trim(),
          };
          const created = await createRecipientM.mutateAsync(createDraft);
          recipientId = strictPositiveIntegerId(created.id);
          if (recipientId === null) {
            setCreateRecovery({ phase: 'create_uncertain' });
            return;
          }
          const linkRetry: MailRecipientCreateRecovery = { phase: 'link_retry', recipientId };
          if (!persistGuard(linkRetry, null, createDraft)) {
            setCreateRecovery({ phase: 'create_uncertain' });
            return;
          }
          clearMailRecipientCreateGuard(props.guardScope);
          globalRecoveryActiveRef.current = false;
          setCreateRecovery(linkRetry);
        } catch (error) {
          if (isAmbiguousMutationError(error)) {
            setCreateRecovery({ phase: 'create_uncertain' });
            void qc.invalidateQueries({ queryKey: ['mailer', 'mail_recipients', 'index'] });
          } else {
            clearCreateGuards();
          }
          return;
        }
      }

      try {
        await addRecipientM.mutateAsync({ mailRecipientId: recipientId, source: 'created' });
      } catch (error) {
        if (isAmbiguousMutationError(error)) {
          const linkUncertain: MailRecipientCreateRecovery = { phase: 'link_uncertain', recipientId };
          setCreateRecovery(linkUncertain);
          void qc.invalidateQueries({ queryKey: ['mailer', 'mail_templates', 'recipients'] });
        } else {
          const linkRetry: MailRecipientCreateRecovery = { phase: 'link_retry', recipientId };
          persistGuard(linkRetry, null);
          setCreateRecovery(linkRetry);
        }
      }
    } finally {
      createSubmitRef.current = false;
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={t('mailer.templates.detail.recipients.add')}
      size="lg"
      testId="admin.mailer.templates.detail.recipients.modal"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted">{t('mailer.templates.detail.recipients.modal.hint')}</div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={close}
              disabled={pending}
              testId="admin.mailer.templates.detail.recipients.modal.cancel"
            >
              {t('common.cancel')}
            </Button>
            {mode === 'existing' ? (
              <Button
                variant="primary"
                onClick={() => void submitExisting()}
                loading={addRecipientM.isPending}
                disabled={
                  pending
                  || props.actionsBlocked
                  || existingLinkUncertainRecipientId !== null
                  || !selectedRecipientId
                  || props.associatedRecipientIds.has(selectedRecipientId)
                }
                testId="admin.mailer.templates.detail.recipients.modal.add"
              >
                {t('common.add')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void submitCreateAndAdd()}
                loading={pending}
                disabled={!canSubmitCreate}
                testId="admin.mailer.templates.detail.recipients.modal.create"
              >
                {createRecovery.phase === 'link_retry'
                  ? t('mailer.templates.detail.recipients.modal.retry_link')
                  : t('mailer.templates.detail.recipients.modal.create_and_add')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant={mode === 'existing' ? 'primary' : 'secondary'}
          onClick={() => setMode('existing')}
          disabled={props.actionsBlocked || pending || recoveryLocked}
          aria-pressed={mode === 'existing'}
          size="sm"
          testId="admin.mailer.templates.detail.recipients.modal.mode.existing"
        >
          {t('mailer.templates.detail.recipients.modal.mode.existing')}
        </Button>
        <Button
          variant={mode === 'create' ? 'primary' : 'secondary'}
          onClick={() => setMode('create')}
          disabled={props.actionsBlocked || pending || recoveryLocked}
          aria-pressed={mode === 'create'}
          size="sm"
          testId="admin.mailer.templates.detail.recipients.modal.mode.create"
        >
          {t('mailer.templates.detail.recipients.modal.mode.create')}
        </Button>
      </div>

      {mode === 'existing' ? (
        <MailTemplateRecipientExistingPicker
          recipients={allRecipientsQ.data ?? []}
          loading={allRecipientsQ.isLoading}
          loadFailed={allRecipientsQ.isError}
          loadError={allRecipientsQ.error}
          onRetryLoad={() => void allRecipientsQ.refetch()}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setSelectedRecipientId(null);
            addRecipientM.reset();
          }}
          selectedRecipientId={selectedRecipientId}
          onSelectRecipient={(recipientId) => {
            setSelectedRecipientId(recipientId);
            addRecipientM.reset();
          }}
          associatedRecipientIds={props.associatedRecipientIds}
          pending={pending}
          actionsBlocked={props.actionsBlocked}
          existingLinkUncertainRecipientId={existingLinkUncertainRecipientId}
          addFailed={addRecipientM.isError}
          addError={addRecipientM.error}
          onResetRetry={resetCreate}
          onUnlockUncertain={unlockUncertain}
        />
      ) : (
        <div className="grid gap-3">
          <MailRecipientDraftFields
            draft={draft}
            disabled={props.actionsBlocked || draftLocked || pending}
            testIdPrefix="admin.mailer.templates.detail.recipients.modal.create"
            onChange={setDraft}
          />
          <Alert variant="info" title={t('mailer.templates.detail.recipients.modal.create_info')}>
            {t('mailer.templates.detail.recipients.modal.create_info_desc')}
          </Alert>

          <MailTemplateRecipientRecoveryNotice
            recovery={createRecovery}
            pending={pending}
            onResetRetry={resetCreate}
            onUnlockUncertain={unlockUncertain}
          />
          {createRecipientM.isError || addRecipientM.isError ? (
            <Alert variant="danger" title={t('mailer.templates.detail.recipients.modal.create_error')}>
              {formatErrorMessage(createRecipientM.error ?? addRecipientM.error)}
            </Alert>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
