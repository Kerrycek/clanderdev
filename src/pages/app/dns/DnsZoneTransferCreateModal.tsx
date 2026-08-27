import React from 'react';

import { useI18n } from '../../../app/i18n';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { HostIpLookupInput } from '../../../components/ui/HostIpLookupInput';
import { Modal } from '../../../components/ui/Modal';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { formatErrorMessage } from '../../../lib/errors';

export function DnsZoneTransferCreateModal(props: {
  open: boolean;
  onClose: () => void;
  ownerUserId?: number;
  hostIpId: number | null;
  onHostIpIdChange: (value: number | null) => void;
  tsigKeyId: string;
  onTsigKeyIdChange: (value: string) => void;
  tsigOptions: SelectOption[];
  tsigLoading: boolean;
  tsigError: unknown;
  onRetryTsig: () => void;
  createPending: boolean;
  createError: unknown;
  onSubmit: () => void;
}) {
  const { t } = useI18n();

  return (
    <Modal open={props.open} onClose={props.onClose} title={t('dns.zone.transfers.create.title')}>
      <div className="space-y-4">
        {props.createError ? (
          <Alert variant="danger" title={t('dns.zone.transfers.create.failed')}>
            {formatErrorMessage(props.createError)}
          </Alert>
        ) : null}

        <HostIpLookupInput
          value={props.hostIpId}
          onChange={props.onHostIpIdChange}
          userId={props.ownerUserId}
          filters={{ purpose: 'vps', routed: true }}
          ariaLabel={t('dns.zone.transfers.field.host_ip')}
          label={t('dns.zone.transfers.field.host_ip')}
          invalidSelectionMessage={t('dns.zone.transfers.field.host_ip_ineligible')}
          placeholder={t('dns.zone.transfers.field.host_ip_placeholder')}
          testId="dns.transfers.create.host_ip"
        />

        {props.tsigError ? (
          <Alert
            variant="danger"
            title={t('dns.zone.transfers.create.tsig_load_failed')}
            testId="dns.transfers.create.tsig_error"
          >
            <div>{formatErrorMessage(props.tsigError)}</div>
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={props.onRetryTsig}
                testId="dns.transfers.create.tsig_retry"
              >
                {t('common.retry')}
              </Button>
            </div>
          </Alert>
        ) : null}

        <Select
          label={t('dns.zone.transfers.field.tsig_key')}
          value={props.tsigKeyId}
          onChange={(event) => props.onTsigKeyIdChange(event.target.value)}
          options={props.tsigOptions}
          disabled={props.tsigLoading || Boolean(props.tsigError)}
          testId="dns.transfers.create.tsig"
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <ActionButton
            onClick={props.onSubmit}
            loading={props.createPending}
            disabled={!props.hostIpId}
            testId="dns.transfers.create.submit"
          >
            {t('common.create')}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
