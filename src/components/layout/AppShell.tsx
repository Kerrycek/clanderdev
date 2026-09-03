import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../app/auth';
import { AppModeProvider, type AppMode } from '../../app/appMode';
import { useI18n } from '../../app/i18n';
import { getRuntimeConfig } from '../../app/config';

import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { LinkButton } from '../ui/LinkButton';
import { Spinner } from '../ui/Spinner';

import { formatErrorMessage } from '../../lib/errors';
import { withRouterBasename, withSameOriginNextParam } from '../../lib/routerPaths';

import { AppLayout, taskStorageScopeForUser } from './AppLayout';
import { SessionTokenKeepalive } from './SessionTokenKeepalive';

function LoginRequired() {
  const auth = useAuth();
  const cfg = getRuntimeConfig();
  const { t } = useI18n();

  const loginHref = auth.loginUrl || `${cfg.routerBasename}/oauth/login`;
  const title = auth.status === 'expired' ? t('auth.session_expired.title') : t('auth.login_required.title');
  const body = auth.status === 'expired' ? t('auth.session_expired.body') : t('auth.login_required.body');

  return (
    <div className="mx-auto max-w-content-lg p-6" data-testid="auth.login-required">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>

          {auth.error ? <p className="text-sm text-danger">{formatErrorMessage(auth.error)}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button as="a" href={loginHref} variant="primary">
              {t('auth.action.sign_in')}
            </Button>
            <LinkButton to="/" variant="secondary">
              {t('auth.action.go_to_status')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AuthCheckFailed() {
  const auth = useAuth();
  const cfg = getRuntimeConfig();
  const { t } = useI18n();

  const loginHref = auth.loginUrl || `${cfg.routerBasename}/oauth/login`;

  return (
    <div className="mx-auto max-w-content-lg p-6" data-testid="auth.session-error">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{t('auth.session_error.title')}</h1>
            <p className="mt-2 text-sm text-muted">{t('auth.session_error.body')}</p>
          </div>

          {auth.error ? <p className="text-sm text-danger">{formatErrorMessage(auth.error)}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('common.reload')}
            </Button>
            <Button as="a" href={loginHref} variant="secondary">
              {t('auth.action.try_sign_in')}
            </Button>
            <LinkButton to="/" variant="ghost">
              {t('auth.action.go_to_status')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AccountForbidden() {
  const auth = useAuth();
  const cfg = getRuntimeConfig();
  const { t } = useI18n();

  const logoutPath = cfg.logoutUrl || withRouterBasename('/oauth/logout', cfg.routerBasename);
  const homePath = withRouterBasename('/', cfg.routerBasename);
  const localLogoutHref = withSameOriginNextParam(logoutPath, homePath);

  return (
    <div className="mx-auto max-w-content-lg p-6" data-testid="auth.forbidden">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{t('auth.forbidden.title')}</h1>
            <p className="mt-2 text-sm text-muted">{t('auth.forbidden.body')}</p>
          </div>

          {auth.error ? <p className="text-sm text-danger">{formatErrorMessage(auth.error)}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button as="a" href={localLogoutHref} variant="secondary">
              {t('auth.action.sign_out')}
            </Button>
            <LinkButton to="/" variant="ghost">
              {t('auth.action.go_to_status')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AdminAccessRequired() {
  const auth = useAuth();
  const { t } = useI18n();

  const login = auth.user?.login ?? t('auth.user.fallback');

  return (
    <div className="mx-auto max-w-content-lg p-6" data-testid="auth.admin-required">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{t('auth.admin_required.title')}</h1>
            <p className="mt-2 text-sm text-muted">{t('auth.admin_required.body', { login })}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <LinkButton to="/app" variant="primary">
              {t('auth.action.go_to_my_view')}
            </LinkButton>
            <LinkButton to="/" variant="secondary">
              {t('auth.action.go_to_status')}
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export function AppShell(props: { mode: AppMode }) {
  // Subscribe to navigation changes so the shell updates chrome state immediately.
  useLocation();
  const auth = useAuth();

  return (
    <AppModeProvider mode={props.mode}>
      <AuthGate mode={props.mode}>
        <AppLayout key={taskStorageScopeForUser(auth.user?.id)}>
          <Outlet />
        </AppLayout>
      </AuthGate>
    </AppModeProvider>
  );
}

function AuthGate(props: { children: React.ReactNode; mode: AppMode }) {
  const auth = useAuth();
  const { t } = useI18n();

  if (auth.status === 'loading') {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted" data-testid="auth.loading">
        <Spinner />
        <span className="ml-2">{t('common.loading')}</span>
      </div>
    );
  }

  if (auth.status === 'anonymous' || auth.status === 'expired') {
    return <LoginRequired />;
  }

  if (auth.status === 'forbidden') {
    return <AccountForbidden />;
  }

  if (auth.status === 'error') {
    return <AuthCheckFailed />;
  }

  if (props.mode === 'admin' && !auth.canUseAdminUi) {
    return <AdminAccessRequired />;
  }

  // Authenticated
  return (
    <>
      <SessionTokenKeepalive />
      {props.children}
    </>
  );
}
