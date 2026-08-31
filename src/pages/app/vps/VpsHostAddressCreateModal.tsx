import { useMemo, useState } from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Textarea } from '../../../components/ui/Textarea';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import { ipAddressLabel, validateHostAddressInput } from './VpsNetworkModel';

export function parseHostAddressLines(raw: string): string[] {
  return raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

export function VpsHostAddressCreateModal(props: {
  route: IpAddress | null;
  saving: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (addresses: string[]) => void;
}) {
  const { t } = useI18n();
  const [raw, setRaw] = useState('');
  const validation = useMemo(() => validateHostAddressInput(raw), [raw]);
  const addresses = useMemo(() => parseHostAddressLines(raw), [raw]);

  const close = () => {
    if (props.saving) return;
    setRaw('');
    props.onClose();
  };

  return (
    <Modal
      open={Boolean(props.route)}
      onClose={close}
      title={t('vps.network.host_addresses.create.title')}
      testId="vps.network.host_addresses.create"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={props.saving}>{t('common.cancel')}</Button>
          <Button
            onClick={() => props.onSubmit(addresses)}
            loading={props.saving}
            disabled={addresses.length === 0 || !validation.ok}
            testId="vps.network.host_addresses.create.submit"
          >
            {t('vps.network.host_addresses.create.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {props.route ? t('vps.network.host_addresses.create.route', { route: ipAddressLabel(props.route) }) : null}
        </div>
        {props.errorMessage ? <Alert variant="danger" title={t('common.error')}>{props.errorMessage}</Alert> : null}
        {!validation.ok ? (
          <Alert variant="danger" title={t('vps.network.host_addresses.create.invalid', { address: validation.invalidValue })} />
        ) : null}
        <Textarea
          rows={7}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          label={t('vps.network.host_addresses.create.addresses')}
          testId="vps.network.host_addresses.create.addresses"
          disabled={props.saving}
        />
        <div className="text-xs text-muted">{t('vps.network.host_addresses.create.help')}</div>
      </div>
    </Modal>
  );
}
