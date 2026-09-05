import React from 'react';

import { useI18n } from '../../../../app/i18n';
import type { MailRecipient } from '../../../../lib/api/mailer';
import { formatErrorMessage } from '../../../../lib/errors';

import { Alert } from '../../../../components/ui/Alert';
import { Badge } from '../../../../components/ui/Badge';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { Input } from '../../../../components/ui/Input';
import { LoadingState } from '../../../../components/ui/LoadingState';

import { MailTemplateRecipientRecoveryNotice } from './MailTemplateRecipientRecoveryNotice';

export function MailTemplateRecipientExistingPicker(props: {
  recipients: MailRecipient[];
  loading: boolean;
  loadFailed: boolean;
  loadError: unknown;
  onRetryLoad: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedRecipientId: number | null;
  onSelectRecipient: (recipientId: number) => void;
  associatedRecipientIds: Set<number>;
  pending: boolean;
  actionsBlocked: boolean;
  existingLinkUncertainRecipientId: number | null;
  addFailed: boolean;
  addError: unknown;
  onResetRetry: () => void;
  onUnlockUncertain: () => void;
}) {
  const { t } = useI18n();
  const recipientSearch = props.search.trim().toLowerCase();
  const filteredRecipients = props.recipients.filter((recipient) => {
    if (!recipientSearch) return true;
    const haystack = `${String(recipient.label ?? '')} ${String(recipient.to ?? '')} ${String(recipient.cc ?? '')} ${String(recipient.bcc ?? '')}`.toLowerCase();
    return haystack.includes(recipientSearch);
  });
  const pickerDisabled = props.actionsBlocked
    || props.pending
    || props.existingLinkUncertainRecipientId !== null;

  return (
    <>
      <div className="mb-3">
        <Input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          disabled={pickerDisabled}
          ariaLabel={t('mailer.templates.detail.recipients.modal.search')}
          placeholder={t('mailer.templates.detail.recipients.modal.search')}
          testId="admin.mailer.templates.detail.recipients.modal.search"
        />
      </div>

      {props.loading ? (
        <LoadingState testId="admin.mailer.templates.detail.recipients.modal.loading" />
      ) : props.loadFailed ? (
        <ErrorState
          testId="admin.mailer.templates.detail.recipients.modal.error"
          title={t('mailer.templates.detail.recipients.modal.load_error')}
          error={props.loadError}
          onRetry={props.onRetryLoad}
          detailsExtra={{ page: 'admin.mailer.templates.detail.recipients.modal' }}
        />
      ) : filteredRecipients.length === 0 ? (
        <div
          className="rounded-md border border-border bg-surface-2 p-4 text-sm text-muted"
          role="status"
          data-testid="admin.mailer.templates.detail.recipients.modal.empty"
        >
          {t(recipientSearch ? 'empty.list.no_matches.body' : 'empty.list.empty.body')}
        </div>
      ) : (
        <div className="max-h-scroll-registry overflow-auto rounded-md border border-border">
          {filteredRecipients.map((recipient) => {
            const recipientId = Number(recipient.id);
            const label = String(recipient.label ?? `#${recipientId}`);
            const to = String(recipient.to ?? '');
            const cc = String(recipient.cc ?? '');
            const bcc = String(recipient.bcc ?? '');
            const selected = props.selectedRecipientId === recipientId;
            const already = props.associatedRecipientIds.has(recipientId);

            return (
              <button
                key={recipientId}
                type="button"
                className={
                  'w-full border-b border-border px-3 py-2 text-left text-sm transition last:border-b-0 '
                  + (selected ? 'bg-surface-2' : 'hover:bg-surface-2')
                }
                onClick={() => props.onSelectRecipient(recipientId)}
                disabled={pickerDisabled || already}
                aria-pressed={selected}
                data-testid={`admin.mailer.templates.detail.recipients.modal.pick.${recipientId}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{label}</div>
                    <div className="mt-0.5 truncate text-xs text-muted" title={to}>
                      {to || t('common.na')}
                    </div>
                  </div>
                  {already ? <Badge variant="warn">{t('mailer.templates.detail.recipients.modal.already_added')}</Badge> : null}
                </div>
                {cc || bcc ? (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                    {cc ? <span className="truncate" title={cc}>CC: {cc}</span> : null}
                    {bcc ? <span className="truncate" title={bcc}>BCC: {bcc}</span> : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {props.selectedRecipientId && props.associatedRecipientIds.has(props.selectedRecipientId) ? (
        <div className="mt-3">
          <Alert variant="warn" title={t('mailer.templates.detail.recipients.modal.already_added')}>
            {t('mailer.templates.detail.recipients.modal.already_added_desc')}
          </Alert>
        </div>
      ) : null}
      {props.existingLinkUncertainRecipientId ? (
        <div className="mt-3">
          <MailTemplateRecipientRecoveryNotice
            recovery={{ phase: 'existing_link_uncertain', recipientId: props.existingLinkUncertainRecipientId }}
            pending={props.pending}
            onResetRetry={props.onResetRetry}
            onUnlockUncertain={props.onUnlockUncertain}
          />
        </div>
      ) : props.addFailed ? (
        <div className="mt-3">
          <Alert variant="danger" title={t('mailer.templates.detail.recipients.modal.add_error')}>
            {formatErrorMessage(props.addError)}
          </Alert>
        </div>
      ) : null}
      {props.recipients.length >= 500 ? (
        <div className="mt-3">
          <Alert variant="warn">{t('mailer.templates.detail.recipients.modal.fetch_limit_notice')}</Alert>
        </div>
      ) : null}
    </>
  );
}
