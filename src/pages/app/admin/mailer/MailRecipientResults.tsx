import React from 'react';

import { useI18n } from '../../../../app/i18n';
import type { MailRecipient } from '../../../../lib/api/mailer';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { TableCard } from '../../../../components/ui/TableCard';

export function MailRecipientResults(props: {
  rows: MailRecipient[];
  canPaginate: boolean;
  onEdit: (recipient: MailRecipient) => void;
  renderPagination: (testId: string) => React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <>
      {/* Mobile */}
      <div className="grid gap-3 md:hidden">
        {props.rows.map((recipient) => {
          const id = Number(recipient.id);
          const label = String(recipient.label ?? `#${id}`);
          const to = String(recipient.to ?? '');
          const cc = String(recipient.cc ?? '');
          const bcc = String(recipient.bcc ?? '');

          return (
            <Card key={id} className="p-4" testId={`admin.mailer.recipients.card.${id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-2 grid gap-1 text-xs text-muted">
                    <div className="truncate" title={to}>
                      <span className="font-medium">{t('mailer.recipients.fields.to')}:</span> {to || t('common.na')}
                    </div>
                    <div className="truncate" title={cc}>
                      <span className="font-medium">{t('mailer.recipients.fields.cc')}:</span> {cc || t('common.na')}
                    </div>
                    <div className="truncate" title={bcc}>
                      <span className="font-medium">{t('mailer.recipients.fields.bcc')}:</span> {bcc || t('common.na')}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button variant="secondary" size="sm" onClick={() => props.onEdit(recipient)} testId={`admin.mailer.recipients.edit.${id}`}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled
                    disabledReason={t('mailer.recipients.delete.blocked_body')}
                    testId={`admin.mailer.recipients.delete.${id}.blocked`}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}

        {props.canPaginate ? (
          <Card className="md:hidden">
            {props.renderPagination('admin.mailer.recipients.pagination.mobile')}
          </Card>
        ) : null}
      </div>

      {/* Desktop */}
      <TableCard
        className="hidden md:block"
        minWidth="xl"
        tableTestId="admin.mailer.recipients.table"
        footer={props.canPaginate
          ? props.renderPagination('admin.mailer.recipients.pagination.desktop')
          : null}
      >
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-4 py-2">{t('common.label')}</th>
            <th className="px-4 py-2">{t('mailer.recipients.fields.to')}</th>
            <th className="px-4 py-2">{t('mailer.recipients.fields.cc')}</th>
            <th className="px-4 py-2">{t('mailer.recipients.fields.bcc')}</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {props.rows.map((recipient) => {
            const id = Number(recipient.id);
            const label = String(recipient.label ?? `#${id}`);
            const to = String(recipient.to ?? '');
            const cc = String(recipient.cc ?? '');
            const bcc = String(recipient.bcc ?? '');

            return (
              <tr key={id} className="border-b border-border" data-testid={`admin.mailer.recipients.row.${id}`}>
                <td className="px-4 py-2 text-sm font-medium">{label}</td>
                <td className="max-w-sm truncate px-4 py-2 text-sm font-mono" title={to}>
                  {to || <span className="text-muted">{t('common.na')}</span>}
                </td>
                <td className="max-w-sm truncate px-4 py-2 text-sm font-mono" title={cc}>
                  {cc || <span className="text-muted">{t('common.na')}</span>}
                </td>
                <td className="max-w-sm truncate px-4 py-2 text-sm font-mono" title={bcc}>
                  {bcc || <span className="text-muted">{t('common.na')}</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => props.onEdit(recipient)} testId={`admin.mailer.recipients.edit.${id}`}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled
                      disabledReason={t('mailer.recipients.delete.blocked_body')}
                      testId={`admin.mailer.recipients.delete.${id}.blocked`}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
