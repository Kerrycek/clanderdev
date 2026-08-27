import React from 'react';

import { useI18n } from '../../../app/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ChipLink } from '../../../components/ui/ChipLink';
import { Spinner } from '../../../components/ui/Spinner';
import { Table } from '../../../components/ui/Table';
import type { VpsMount } from '../../../lib/api/vpsMounts';
import { formatDateTime } from '../../../lib/format';
import { canonicalBool, datasetId, datasetLabel, mountStateTone } from './VpsStorageModel';

function MountBadges(props: { mount: VpsMount; canAdmin: boolean }) {
  const { t } = useI18n();
  const enabled = canonicalBool(props.mount.enabled, true);
  const masterEnabled = canonicalBool(props.mount.master_enabled, true);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Badge variant={enabled ? 'ok' : 'warn'}>{enabled ? t('common.enabled') : t('common.disabled')}</Badge>
      <Badge variant={mountStateTone(props.mount)}>{String(props.mount.current_state ?? t('common.na'))}</Badge>
      {props.canAdmin ? (
        <Badge variant={masterEnabled ? 'neutral' : 'warn'}>
          {t('vps.storage.mounts.master_short')}: {masterEnabled ? t('common.yes') : t('common.no')}
        </Badge>
      ) : null}
    </div>
  );
}

function MountDatasetLink(props: { basePath: string; mount: VpsMount; testId: string }) {
  const ds = datasetLabel(props.mount.dataset);
  const dsId = datasetId(props.mount.dataset);

  if (!dsId) return <>{ds}</>;

  return (
    <ChipLink to={`${props.basePath}/datasets/${dsId}`} data-testid={props.testId}>
      {ds}
    </ChipLink>
  );
}

export function VpsStorageMountsCard(props: {
  basePath: string;
  canAdmin: boolean;
  canMutate: boolean;
  mounts: VpsMount[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onEdit: (mount: VpsMount) => void;
  onDelete: (mount: VpsMount) => void;
}) {
  const { t } = useI18n();

  return (
    <Card testId="vps.storage.mounts">
      <CardHeader
        title={t('vps.storage.mounts.title')}
        subtitle={t('vps.storage.mounts.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={props.onRefresh}>
            {t('common.refresh')}
          </Button>
        }
      />

      <CardBody>
        {props.loading ? (
          <div className="py-2">
            <Spinner label={t('common.loading')} />
          </div>
        ) : props.error ? (
          <Alert title={t('vps.storage.mounts.load_error')} variant="danger">
            {props.error}
          </Alert>
        ) : props.mounts.length === 0 ? (
          <div className="py-2 text-sm text-muted">{t('vps.storage.mounts.empty')}</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {props.mounts.map((mount) => (
                <Card key={mount.id} testId={`vps.storage.mounts.card.${mount.id}`}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold">{String(mount.mountpoint ?? '—')}</div>
                        <div className="mt-1 text-xs text-muted">
                          <MountDatasetLink basePath={props.basePath} mount={mount} testId={`vps.storage.mounts.card.${mount.id}.dataset`} />
                        </div>
                      </div>
                      <MountBadges mount={mount} canAdmin={props.canAdmin} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{t('vps.storage.mounts.field.mode', { mode: String(mount.mode ?? '—') })}</span>
                      <span>{t('vps.storage.mounts.field.type', { type: String(mount.type ?? '—') })}</span>
                      <span>{t('vps.storage.mounts.field.on_start_fail', { value: String(mount.on_start_fail ?? '—') })}</span>
                      <span>
                        {t('vps.storage.mounts.field.default_map', {
                          value: canonicalBool(mount.use_default_map, true) ? t('common.yes') : t('common.no'),
                        })}
                      </span>
                      {mount.expiration_date ? <span>{t('vps.storage.mounts.field.expiration', { value: formatDateTime(mount.expiration_date) })}</span> : null}
                    </div>

                    {props.canMutate ? <div className="mt-3 flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" testId={`vps.storage.mounts.card.${mount.id}.edit`} onClick={() => props.onEdit(mount)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" size="sm" testId={`vps.storage.mounts.card.${mount.id}.delete`} onClick={() => props.onDelete(mount)}>
                        {t('common.delete')}
                      </Button>
                    </div> : null}
                  </CardBody>
                </Card>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table testId="vps.storage.mounts.table" minWidth="lg">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.mountpoint')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.dataset')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.mode_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.type_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.enabled_short')}</th>
                    {props.canAdmin ? <th className="px-4 py-3">{t('vps.storage.mounts.field.master_short')}</th> : null}
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.on_start_fail_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.default_map_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.current_state_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.expiration_short')}</th>
                    <th className="px-4 py-3">{t('vps.storage.mounts.field.updated')}</th>
                    {props.canMutate ? <th className="px-4 py-3"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {props.mounts.map((mount) => {
                    const enabledLabel = canonicalBool(mount.enabled, true) ? t('common.yes') : t('common.no');
                    const masterLabel = canonicalBool(mount.master_enabled, true) ? t('common.yes') : t('common.no');
                    return (
                      <tr key={mount.id} data-testid={`vps.storage.mounts.row.${mount.id}`} className="border-b border-border/60 last:border-b-0">
                        <td className="px-4 py-3 font-medium">{String(mount.mountpoint ?? '—')}</td>
                        <td className="px-4 py-3">
                          <MountDatasetLink basePath={props.basePath} mount={mount} testId={`vps.storage.mounts.row.${mount.id}.dataset`} />
                        </td>
                        <td className="px-4 py-3">{String(mount.mode ?? '—')}</td>
                        <td className="px-4 py-3">{String(mount.type ?? '—')}</td>
                        <td className="px-4 py-3">
                          <Badge variant={canonicalBool(mount.enabled, true) ? 'ok' : 'warn'}>{enabledLabel}</Badge>
                        </td>
                        {props.canAdmin ? (
                          <td className="px-4 py-3">
                            <Badge variant={canonicalBool(mount.master_enabled, true) ? 'neutral' : 'warn'}>{masterLabel}</Badge>
                          </td>
                        ) : null}
                        <td className="px-4 py-3">{String(mount.on_start_fail ?? '—')}</td>
                        <td className="px-4 py-3">{canonicalBool(mount.use_default_map, true) ? t('common.yes') : t('common.no')}</td>
                        <td className="px-4 py-3">{String(mount.current_state ?? '—')}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDateTime(mount.expiration_date)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDateTime(mount.updated_at)}</td>
                        {props.canMutate ? <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button variant="secondary" size="sm" testId={`vps.storage.mounts.row.${mount.id}.edit`} onClick={() => props.onEdit(mount)}>
                              {t('common.edit')}
                            </Button>
                            <Button variant="danger" size="sm" testId={`vps.storage.mounts.row.${mount.id}.delete`} onClick={() => props.onDelete(mount)}>
                              {t('common.delete')}
                            </Button>
                          </div>
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
