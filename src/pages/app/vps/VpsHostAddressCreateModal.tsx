import { useMemo } from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Textarea } from '../../../components/ui/Textarea';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import { ipAddressLabel, validateHostAddressInput } from './VpsNetworkModel';

export function parseHostAddressLines(raw: string): string[] {
  return [...new Set(raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}

export class HostAddressBatchCreateError extends Error {
  readonly createdAddresses: string[];
  readonly failedAddress: string;
  readonly retryAddresses: string[];
  override readonly cause: unknown;

  constructor(args: {
    createdAddresses: string[];
    failedAddress: string;
    retryAddresses: string[];
    cause: unknown;
  }) {
    const causeMessage = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super(causeMessage, { cause: args.cause });
    this.name = 'HostAddressBatchCreateError';
    this.createdAddresses = args.createdAddresses;
    this.failedAddress = args.failedAddress;
    this.retryAddresses = args.retryAddresses;
    this.cause = args.cause;

    const code = (args.cause as { code?: unknown } | null)?.code;
    if (code !== undefined) (this as Error & { code?: unknown }).code = code;
  }
}

export async function createHostAddressesSequentially(
  addresses: string[],
  createOne: (address: string) => Promise<unknown>,
): Promise<string[]> {
  const createdAddresses: string[] = [];

  for (const [index, address] of addresses.entries()) {
    try {
      await createOne(address);
      createdAddresses.push(address);
    } catch (cause) {
      throw new HostAddressBatchCreateError({
        createdAddresses: [...createdAddresses],
        failedAddress: address,
        retryAddresses: addresses.slice(index),
        cause,
      });
    }
  }

  return createdAddresses;
}

export function hostAddressBatchSettlementError(error: unknown): unknown {
  return error instanceof HostAddressBatchCreateError ? error.cause : error;
}

export function VpsHostAddressCreateModal(props: {
  route: IpAddress | null;
  saving: boolean;
  value: string;
  errorMessage?: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onSubmit: (addresses: string[]) => void;
}) {
  const { t } = useI18n();
  const validation = useMemo(() => validateHostAddressInput(props.value), [props.value]);
  const addresses = useMemo(() => parseHostAddressLines(props.value), [props.value]);

  const close = () => {
    if (props.saving) return;
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
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          label={t('vps.network.host_addresses.create.addresses')}
          testId="vps.network.host_addresses.create.addresses"
          disabled={props.saving}
        />
        <div className="text-xs text-muted">{t('vps.network.host_addresses.create.help')}</div>
      </div>
    </Modal>
  );
}
