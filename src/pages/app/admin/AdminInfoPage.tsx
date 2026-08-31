import React, { useMemo } from 'react';

import { useAuth } from '../../../app/auth';
import { useAppMode } from '../../../app/appMode';
import { getRuntimeConfig } from '../../../app/config';
import { useUiSettings } from '../../../app/uiSettings';
import { useI18n } from '../../../app/i18n';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { LinkButton } from '../../../components/ui/LinkButton';
import { DetailShell } from '../../../components/layout/DetailShell';
import { PageHeader } from '../../../components/layout/PageHeader';


export function AdminInfoPage() {
  const auth = useAuth();
  const appMode = useAppMode();
  const ui = useUiSettings();
  const cfg = getRuntimeConfig();
  const { t } = useI18n();
  const authSummary = useMemo(() => {
    if (cfg.auth.kind === 'oauth2') {
      return { kind: 'oauth2', tokenPresent: cfg.auth.accessToken.length > 0 };
    }
    if (cfg.auth.kind === 'token') {
      return { kind: 'token', tokenPresent: cfg.auth.sessionToken.length > 0 };
    }
    return { kind: 'none', tokenPresent: false };
  }, [cfg.auth]);

  const authKindLabel =
    authSummary.kind === 'oauth2'
      ? t('admin.info.runtime.auth_kind.oauth2')
      : authSummary.kind === 'token'
        ? t('admin.info.runtime.auth_kind.token')
        : t('admin.info.runtime.auth_kind.none');

  const yesNo = (v: boolean) => (v ? t('common.yes') : t('common.no'));

  return (
    <DetailShell testId="admin.info.page" variant="wide">
      <PageHeader
        title={t('admin.info.title')}
        description={t('admin.info.subtitle')}
        testId="admin.info.header"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card testId="admin.info.session.card">
          <CardHeader
            title={t('admin.info.session.title')}
            subtitle={t('admin.info.session.subtitle')}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t('admin.info.session.field.login')}</dt>
              <dd className="font-medium">{auth.user?.login ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.session.field.user_id')}</dt>
              <dd className="font-medium">{auth.user?.id ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.session.field.level')}</dt>
              <dd className="font-medium">{auth.user?.level ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.session.field.role')}</dt>
              <dd className="font-medium">{auth.role}</dd>

              <dt className="text-muted">{t('admin.info.session.field.can_use_admin_ui')}</dt>
              <dd className="font-medium">{yesNo(auth.canUseAdminUi)}</dd>

              <dt className="text-muted">{t('admin.info.session.field.mode_base_path')}</dt>
              <dd className="font-medium">{appMode.basePath}</dd>
              <dt className="text-muted">{t('admin.info.session.field.sidebar_collapsed')}</dt>
              <dd className="font-medium">{yesNo(ui.settings.sidebarCollapsed)}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card testId="admin.info.runtime.card">
          <CardHeader
            title={t('admin.info.runtime.title')}
            subtitle={t('admin.info.runtime.subtitle')}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t('admin.info.runtime.field.api_url')}</dt>
              <dd className="font-medium break-all">{cfg.apiUrl}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.api_version')}</dt>
              <dd className="font-medium">{cfg.apiVersion}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.api_base_url')}</dt>
              <dd className="font-medium break-all">{cfg.apiBaseUrl}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.legacy_webui_url')}</dt>
              <dd className="font-medium break-all">{cfg.webuiUrl ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.router_basename')}</dt>
              <dd className="font-medium break-all">{cfg.routerBasename || t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.auth_kind')}</dt>
              <dd className="font-medium">{authKindLabel}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.token_present')}</dt>
              <dd className="font-medium">{yesNo(authSummary.tokenPresent)}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.forced_auth_header')}</dt>
              <dd className="font-medium break-all">{cfg.haveApi.authHeader ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.forced_meta_namespace')}</dt>
              <dd className="font-medium break-all">{cfg.haveApi.metaNamespace ?? t('common.na')}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.ui_settings_persistence')}</dt>
              <dd className="font-medium">{cfg.uiSettings.persistence}</dd>

              <dt className="text-muted">{t('admin.info.runtime.field.ui_settings_endpoint')}</dt>
              <dd className="font-medium break-all">{cfg.uiSettings.server.path}</dd>
            </dl>

            <div className="mt-4 rounded-md bg-surface-2 p-3 text-xs">
              <div className="font-semibold">{t('admin.info.runtime.server_sync.title')}</div>
              <div className="mt-1 text-muted">
                {t('admin.info.runtime.server_sync.namespace')} <span className="font-mono">{cfg.uiSettings.server.namespace}</span>
              </div>
              <div className="text-muted">
                {t('admin.info.runtime.server_sync.field')} <span className="font-mono">{cfg.uiSettings.server.field}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card testId="admin.info.shortcuts.card">
        <CardHeader title={t('admin.info.shortcuts.title')} subtitle={t('admin.info.shortcuts.subtitle')} />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/admin/transactions" variant="secondary" testId="admin.info.shortcuts.transactions">
              {t('nav.transactions')}
            </LinkButton>
            <LinkButton to="/admin/users" variant="secondary" testId="admin.info.shortcuts.users">
              {t('admin.users.title')}
            </LinkButton>
            <LinkButton to="/admin/ip-addresses" variant="secondary" testId="admin.info.shortcuts.ip_addresses">
              {t('admin.ip_addresses.title')}
            </LinkButton>
            <LinkButton to="/admin/vps" variant="secondary" testId="admin.info.shortcuts.vps">
              {t('nav.vps')}
            </LinkButton>
            <LinkButton to="/admin/datasets" variant="secondary" testId="admin.info.shortcuts.datasets">
              {t('nav.datasets')}
            </LinkButton>
            <LinkButton to="/admin/dns" variant="secondary" testId="admin.info.shortcuts.dns">
              {t('nav.dns')}
            </LinkButton>
            <LinkButton
              to="/app"
              variant="ghost"
              title={t('admin.info.shortcuts.user_workspace.title')}
              testId="admin.info.shortcuts.user_workspace"
            >
              {t('admin.info.shortcuts.user_workspace')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </DetailShell>
  );
}
