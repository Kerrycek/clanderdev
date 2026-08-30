import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Table } from '../../../components/ui/Table';
import type { VpsSshHostKey } from '../../../lib/api/vpsAccess';
import { errorMessage } from './VpsAccessPrimitives';
import { hostKeyDisplayFingerprint, hostKeyDisplayType, hostKeyMaterial, hostKeyMeta } from './VpsAccessModel';

function valueString(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

export function VpsSshHostKeysCard(props: {
  hostKeys: VpsSshHostKey[];
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const hostKeys = props.hostKeys;

  return (
    <Card testId="vps.access.host_keys" className="relative min-w-0 max-w-full overflow-x-hidden">
      <CardHeader
        title={t('vps.access.host_keys.title')}
        subtitle={t('vps.access.host_keys.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={props.onRefresh} disabled={props.loading} testId="vps.access.host_keys.refresh">
            {props.loading ? t('vps.access.host_keys.loading') : t('vps.access.host_keys.refresh')}
          </Button>
        }
      />
      <CardBody className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
        {props.loading ? <Alert variant="info">{t('vps.access.host_keys.loading')}</Alert> : null}
        {props.error ? <Alert variant="danger">{errorMessage(props.error)}</Alert> : null}
        {!props.loading && !props.error && hostKeys.length === 0 ? (
          <Alert variant="warn" title={t('vps.access.host_keys.empty.title')}>
            {t('vps.access.host_keys.empty.description')}
          </Alert>
        ) : null}

        {hostKeys.length > 0 ? (
          <>
            <div className="grid gap-3 md:grid-cols-2" data-testid="vps.access.host_keys.fingerprints">
              {hostKeys.map((key, index) => {
                const rowId = valueString(key.id) ?? String(index + 1);
                const fingerprint = hostKeyDisplayFingerprint(key);

                return (
                  <div key={rowId} className="rounded-lg border border-border bg-surface p-3" data-testid={`vps.access.host_keys.fingerprint.${rowId}`}>
                    <div className="text-xs uppercase tracking-wide text-muted">{hostKeyDisplayType(key)}</div>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-fg">{fingerprint}</code>
                      {fingerprint !== '—' ? (
                        <CopyButton text={fingerprint} label={t('vps.access.host_keys.copy_fingerprint')} testId={`vps.access.host_keys.fingerprint.${rowId}.copy`} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="w-0 min-w-full max-w-full overflow-x-auto">
              <Table testId="vps.access.host_keys.table" minWidth="lg">
                <thead>
                  <tr>
                    <th className="px-4 py-3">{t('vps.access.host_keys.type')}</th>
                    <th className="px-4 py-3">{t('vps.access.host_keys.fingerprint')}</th>
                    <th className="px-4 py-3">{t('vps.access.host_keys.meta')}</th>
                    <th className="px-4 py-3">{t('vps.access.host_keys.public_key')}</th>
                  </tr>
                </thead>
                <tbody>
                  {hostKeys.map((key, index) => {
                    const material = hostKeyMaterial(key);
                    const rowId = valueString(key.id) ?? String(index + 1);

                    return (
                      <tr key={rowId} data-testid={`vps.access.host_keys.row.${rowId}`}>
                        <td className="px-4 py-3 font-mono text-xs text-fg">{hostKeyDisplayType(key)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-fg">{hostKeyDisplayFingerprint(key)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{hostKeyMeta(key)}</td>
                        <td className="px-4 py-3">
                          {material ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">{material}</code>
                              <CopyButton text={material} label={t('vps.access.host_keys.copy')} testId={`vps.access.host_keys.row.${rowId}.copy`} />
                            </div>
                          ) : (
                            <span className="text-xs text-muted">{t('common.na')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
