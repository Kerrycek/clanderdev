import React, { useMemo } from 'react';

import { useI18n } from '../../../app/i18n';
import { Select } from '../../../components/ui/Select';
import { TabsNav } from '../../../components/ui/TabsNav';

export function VpsTabsNav(props: { basePath: string; vpsId: number }) {
  const { t } = useI18n();
  const items = useMemo(() => [
    { label: t('vps.tabs.overview'), to: `${props.basePath}/vps/${props.vpsId}`, end: true },
    { label: t('vps.tabs.access'), to: `${props.basePath}/vps/${props.vpsId}/access`, end: true },
    { label: t('vps.tabs.network'), to: `${props.basePath}/vps/${props.vpsId}/network`, end: true },
    { label: t('vps.tabs.storage'), to: `${props.basePath}/vps/${props.vpsId}/storage`, end: true },
    { label: t('vps.tabs.maintenance'), to: `${props.basePath}/vps/${props.vpsId}/maintenance`, end: true },
    { label: t('vps.tabs.history'), to: `${props.basePath}/vps/${props.vpsId}/history`, end: true },
    { label: t('vps.tabs.console'), to: `${props.basePath}/vps/${props.vpsId}/console`, end: true },
  ], [props.basePath, props.vpsId, t]);

  return <TabsNav items={items} />;
}

export function VpsActionsMenu(props: {
  basePath: string;
  vpsId: number;
  canMutateVps: boolean;
  primaryHeaderAction: 'start' | 'console';
  startAllowed: boolean;
  restartAllowed: boolean;
  stopAllowed: boolean;
  passwordAllowed: boolean;
  showTasks: boolean;
  showAdminActions: boolean;
  onSelect: (value: string) => void;
}) {
  const { t } = useI18n();
  const vpsPath = `${props.basePath}/vps/${props.vpsId}`;

  return (
    <Select
      value=""
      ariaLabel={t('vps.actions.menu.label')}
      testId="vps.actions.menu"
      className="w-full sm:!w-48"
      onChange={(event) => props.onSelect(event.target.value)}
    >
      <option value="">{t('vps.actions.more.placeholder')}</option>
      {props.canMutateVps ? (
        <optgroup label={t('vps.actions.more.group.daily')}>
          {props.primaryHeaderAction !== 'start' ? (
            <option value="action:start" disabled={!props.startAllowed}>{t('action.vps.start.label')}</option>
          ) : null}
          <option value="action:restart" disabled={!props.restartAllowed}>{t('action.vps.restart.label')}</option>
          <option value="action:stop" disabled={!props.stopAllowed}>{t('action.vps.stop.label')}</option>
          <option value="action:root_password" disabled={!props.passwordAllowed}>{t('vps.power.root_password.button')}</option>
          {props.showTasks ? <option value="tasks">{t('common.open_tasks')}</option> : null}
        </optgroup>
      ) : null}
      <optgroup label={t('vps.actions.more.group.sections')}>
        <option value={`${vpsPath}/access`}>{t('vps.tabs.access')}</option>
        <option value={`${vpsPath}/config`}>{t('vps.tabs.config')}</option>
        <option value={`${vpsPath}/network`}>{t('vps.tabs.network')}</option>
        <option value={`${vpsPath}/storage`}>{t('vps.tabs.storage')}</option>
        <option value={`${vpsPath}/features`}>{t('vps.tabs.features')}</option>
        <option value={`${vpsPath}/maintenance`}>{t('vps.tabs.maintenance')}</option>
        <option value={`${vpsPath}/history`}>{t('vps.tabs.history')}</option>
        <option value={`${props.basePath}/transactions/items?vps=${props.vpsId}`}>{t('vps.overview.admin_actions.transaction_log')}</option>
      </optgroup>
      {props.canMutateVps ? (
        <optgroup label={t('vps.actions.more.group.lifecycle')}>
          <option value={`${vpsPath}/lifecycle/reinstall`}>{t('action.vps.reinstall.label')}</option>
          <option value={`${vpsPath}/lifecycle/clone`}>{t('action.vps.clone.label')}</option>
          <option value={`${vpsPath}/lifecycle/swap`}>{t('action.vps.swap.label')}</option>
          <option value={`${vpsPath}/lifecycle/delete`}>{t('action.vps.delete.label')}</option>
        </optgroup>
      ) : null}
      {props.showAdminActions ? (
        <optgroup label={t('vps.actions.more.group.admin')}>
          <option value={`${vpsPath}/lifecycle/lifetime`}>{t('action.vps.lifecycle.label')}</option>
          <option value={`${vpsPath}/lifecycle/template`}>{t('action.vps.template.label')}</option>
          <option value={`${vpsPath}/lifecycle/boot`}>{t('action.vps.boot.label')}</option>
          <option value={`${vpsPath}/lifecycle/replace`}>{t('action.vps.replace.label')}</option>
          <option value={`${vpsPath}/lifecycle/migrate`}>{t('action.vps.migrate.label')}</option>
        </optgroup>
      ) : null}
    </Select>
  );
}
