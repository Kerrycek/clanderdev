import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusDot } from '../../../components/ui/StatusDot';
import { Table } from '../../../components/ui/Table';
import { toneSurfaceClass } from '../../../components/ui/tone';
import type { IpAddress } from '../../../lib/api/ipAddresses';
import type { NetworkInterface } from '../../../lib/api/networkInterfaces';
import { formatMbpsFromBytesPerSec, ipAddressLabel, ipIsRouted, ipPurposeLabel } from './VpsNetworkModel';

export function VpsNetworkInterfacesCard(props: {
  canAdmin: boolean;
  canMutate: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  netifs: NetworkInterface[];
  ipByNetif: Map<number, IpAddress[]>;
  onRefresh: () => void;
  onEdit: (networkInterface: NetworkInterface) => void;
}) {
  const { t } = useI18n();

  return (
    <Card testId="vps.network.interfaces">
      <CardHeader
        title={t('vps.network.interfaces.title')}
        subtitle={props.canAdmin ? t('vps.network.interfaces.subtitle_admin') : t('vps.network.interfaces.subtitle_user')}
        actions={
          <Button variant="secondary" size="sm" onClick={props.onRefresh}>
            {t('common.refresh')}
          </Button>
        }
      />

      <CardBody>
        {props.isLoading ? (
          <div className="py-2">
            <Spinner label={t('common.loading')} />
          </div>
        ) : props.errorMessage ? (
          <Alert title={t('vps.network.interfaces.load_error')} variant="danger">
            {props.errorMessage}
          </Alert>
        ) : props.netifs.length === 0 ? (
          <div className="py-2 text-sm text-muted">{t('vps.network.interfaces.empty')}</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {props.netifs.map((ni) => {
                const ips = props.ipByNetif.get(ni.id) ?? [];
                const rowVariant = ni.enable === false ? 'warn' : 'ok';
                return (
                  <Card key={ni.id} testId={`vps.network.interfaces.card.${ni.id}`} className={ni.enable === false ? toneSurfaceClass('warn') : undefined}>
                    <CardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusDot variant={rowVariant} testId={`vps.network.interfaces.card.${ni.id}.dot`} />
                            <div className="truncate text-base font-semibold">{ni.name ?? t('vps.network.interfaces.unnamed')}</div>
                            <Badge variant="neutral">{String(ni.type ?? '—')}</Badge>
                            {props.canAdmin ? (
                              <Badge variant={ni.enable !== false ? 'ok' : 'warn'}>
                                {ni.enable !== false ? t('vps.network.interfaces.enabled') : t('vps.network.interfaces.disabled')}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted">{t('vps.network.interfaces.ip_count', { n: ips.length })}</div>
                        </div>

                        {props.canMutate ? <Button variant="secondary" size="sm" testId={`vps.network.interfaces.card.${ni.id}.edit`} onClick={() => props.onEdit(ni)}>
                          {t('common.edit')}
                        </Button> : null}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted">{t('vps.network.interfaces.max_tx')}</div>
                          <div className="font-mono">{formatMbpsFromBytesPerSec(ni.max_tx)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('vps.network.interfaces.max_rx')}</div>
                          <div className="font-mono">{formatMbpsFromBytesPerSec(ni.max_rx)}</div>
                        </div>
                      </div>

                      {ips.length > 0 ? (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-muted">{t('vps.network.ip_addresses.title')}</div>
                          <div className="mt-1 space-y-1">
                            {ips.map((ip) => (
                              <div key={ip.id} className="text-sm">
                                <span className="font-mono">{ipAddressLabel(ip)}</span>
                                {ipPurposeLabel(ip) !== '—' || ipIsRouted(ip) ? (
                                  <span className="ml-2 text-xs text-muted">
                                    {ipPurposeLabel(ip) !== '—' ? ipPurposeLabel(ip) : ''}
                                    {ipIsRouted(ip) ? ` · ${t('vps.network.ip_addresses.routed')}` : ''}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table testId="vps.network.interfaces.table" minWidth="md">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-3"></th>
                    <th className="px-4 py-3">{t('vps.network.interfaces.field.name')}</th>
                    <th className="px-4 py-3">{t('vps.network.interfaces.field.type')}</th>
                    <th className="px-4 py-3">{t('vps.network.interfaces.field.ip_count')}</th>
                    {props.canAdmin ? <th className="px-4 py-3">{t('vps.network.interfaces.field.enabled')}</th> : null}
                    <th className="px-4 py-3">{t('vps.network.interfaces.field.max_tx')}</th>
                    <th className="px-4 py-3">{t('vps.network.interfaces.field.max_rx')}</th>
                    {props.canMutate ? <th className="px-4 py-3"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {props.netifs.map((ni) => {
                    const ips = props.ipByNetif.get(ni.id) ?? [];
                    return (
                      <tr
                        key={ni.id}
                        data-testid={`vps.network.interfaces.row.${ni.id}`}
                        data-row-variant={ni.enable === false ? 'warn' : undefined}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          <StatusDot variant={ni.enable === false ? 'warn' : 'ok'} testId={`vps.network.interfaces.row.${ni.id}.dot`} />
                        </td>
                        <td className="px-4 py-3 font-medium">{ni.name ?? '—'}</td>
                        <td className="px-4 py-3">{String(ni.type ?? '—')}</td>
                        <td className="px-4 py-3">{ips.length}</td>
                        {props.canAdmin ? (
                          <td className="px-4 py-3">
                            <Badge variant={ni.enable !== false ? 'ok' : 'warn'}>
                              {ni.enable !== false ? t('vps.network.interfaces.enabled') : t('vps.network.interfaces.disabled')}
                            </Badge>
                          </td>
                        ) : null}
                        <td className="px-4 py-3 font-mono text-xs">{formatMbpsFromBytesPerSec(ni.max_tx)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{formatMbpsFromBytesPerSec(ni.max_rx)}</td>
                        {props.canMutate ? <td className="px-4 py-3 text-right">
                          <Button variant="secondary" size="sm" testId={`vps.network.interfaces.row.${ni.id}.edit`} onClick={() => props.onEdit(ni)}>
                            {t('common.edit')}
                          </Button>
                        </td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
