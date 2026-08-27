import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { createDnsZone } from '../../../lib/api/dns';
import { formatErrorMessage } from '../../../lib/errors';

import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';

import { canonicalDnsZoneName, isValidDnsZoneEmail } from './dnsZoneListSemantics';

export type DnsZoneCreateKind = 'primary' | 'secondary';

export interface DnsZoneCreatedResult {
  id: number | null;
  kind: DnsZoneCreateKind;
}

export function DnsZoneCreateModal(props: {
  mode: AppMode;
  open: boolean;
  onClose: () => void;
  onCreated: (result: DnsZoneCreatedResult) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<DnsZoneCreateKind>('primary');
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [dnssec, setDnssec] = useState(false);
  const [defaultTtl, setDefaultTtl] = useState('3600');

  const emailValue = email.trim();
  const defaultTtlValue = Number(defaultTtl);
  const validationError = (() => {
    if (!name.trim()) return t('dns.zones.create.validation.name_required');
    if (kind === 'primary' && !emailValue) return t('dns.zones.create.validation.email_required');
    if (kind === 'primary' && !isValidDnsZoneEmail(emailValue)) {
      return t('dns.zones.create.validation.email_invalid');
    }
    if (
      kind === 'primary' &&
      props.mode === 'admin' &&
      (!Number.isFinite(defaultTtlValue) || defaultTtlValue < 60)
    ) {
      return t('dns.zones.create.validation.ttl_invalid');
    }
    return '';
  })();

  const createMutation = useMutation({
    mutationFn: async () => {
      if (validationError) throw new Error(validationError);

      const payload: Parameters<typeof createDnsZone>[0] = {
        name: canonicalDnsZoneName(name),
        // HaveAPI and the legacy WebUI use `internal_source` for zones hosted
        // here and `external_source` for secondary zones loaded from a peer.
        source: kind === 'primary' ? 'internal_source' : 'external_source',
        enabled,
      };

      if (props.mode === 'admin' && userId) payload.user = userId;

      if (kind === 'primary') {
        payload.email = emailValue;
        payload.dnssec_enabled = dnssec;

        // Only admins may send default_ttl during creation. User-created zones
        // receive the backend default, matching the legacy WebUI.
        if (props.mode === 'admin') payload.default_ttl = defaultTtlValue;
      }

      return createDnsZone(payload);
    },
    onSuccess: (result) => {
      const createdKind = kind;
      const rawId = Number(result.data?.id);
      const createdId = Number.isFinite(rawId) && rawId > 0 ? rawId : null;

      setKind('primary');
      setUserId(null);
      setName('');
      setEmail('');
      setEnabled(true);
      setDnssec(false);
      setDefaultTtl('3600');
      props.onClose();
      props.onCreated({ id: createdId, kind: createdKind });
    },
  });

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t('dns.zones.create.title')}
      testId="dns.zones.create.modal"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={props.onClose}
            disabled={createMutation.isPending}
            testId="dns.zones.create.cancel"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || Boolean(validationError)}
            testId="dns.zones.create.submit"
          >
            {createMutation.isPending
              ? t('dns.zones.create.submit_creating')
              : t('dns.zones.create.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ZoneKindSelector value={kind} onChange={setKind} />

        {props.mode === 'admin' ? (
          <div>
            <UserLookupInput
              value={userId}
              onChange={(value) => setUserId(value ? Number(value) : null)}
              label={t('dns.zones.create.user.label')}
              ariaLabel={t('dns.zones.create.user.label')}
              placeholder={t('dns.zones.create.user.placeholder')}
              testId="dns.zones.create.user"
            />
            <div className="mt-1 text-xs text-muted">{t('dns.zones.create.user.help')}</div>
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-medium text-muted">
            {t('dns.zones.create.name.label')}
          </div>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('dns.zones.create.name.placeholder')}
            testId="dns.zones.create.name"
          />
          <div className="mt-1 text-xs text-muted">{t('dns.zones.create.name.help')}</div>
        </div>

        {kind === 'primary' ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              {t('dns.zones.create.email.label')}
            </div>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('dns.zones.create.email.placeholder')}
              testId="dns.zones.create.email"
              className={
                emailValue && !isValidDnsZoneEmail(emailValue)
                  ? 'border-danger-border'
                  : undefined
              }
            />
            <div className="mt-1 text-xs text-muted">{t('dns.zones.create.email.help')}</div>
          </div>
        ) : (
          <Alert title={t('dns.zones.create.secondary.info.title')} variant="info">
            {t('dns.zones.create.secondary.info.body')}
          </Alert>
        )}

        {props.mode === 'admin' && kind === 'primary' ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              {t('dns.zones.create.ttl.label')}
            </div>
            <Select
              value={defaultTtl}
              onChange={(event) => setDefaultTtl(event.target.value)}
              testId="dns.zones.create.ttl"
              options={['300', '600', '3600', '14400', '86400'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </div>
        ) : null}

        <Checkbox
          checked={enabled}
          onChange={setEnabled}
          testId="dns.zones.create.enabled"
          label={t('common.enabled')}
        />

        {kind === 'primary' ? (
          <Checkbox
            checked={dnssec}
            onChange={setDnssec}
            testId="dns.zones.create.dnssec"
            label={t('dns.zones.create.dnssec.label')}
          />
        ) : null}

        {validationError && (name.trim() || email.trim()) ? (
          <Alert title={t('dns.zones.create.validation.title')} variant="warn">
            {validationError}
          </Alert>
        ) : null}

        {createMutation.isError ? (
          <Alert title={t('dns.zones.create.failed')} variant="danger">
            {formatErrorMessage(createMutation.error)}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

function ZoneKindSelector(props: {
  value: DnsZoneCreateKind;
  onChange: (value: DnsZoneCreateKind) => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {t('dns.zones.create.kind.label')}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['primary', 'secondary'] as const).map((kind) => {
          const selected = props.value === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={selected}
              onClick={() => props.onChange(kind)}
              data-testid={`dns.zones.create.kind.${kind}`}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-border bg-surface-2 text-muted hover:border-accent/60'
              }`}
            >
              <div className="text-sm font-semibold">
                {t(`dns.zones.create.kind.${kind}.title`)}
              </div>
              <div className="mt-1 text-xs">
                {t(`dns.zones.create.kind.${kind}.description`)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
