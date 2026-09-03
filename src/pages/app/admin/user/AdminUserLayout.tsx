import React from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';

import { DetailShell } from '../../../../components/layout/DetailShell';

import { fetchUser, type User } from '../../../../lib/api/users';
import { roleFromLevel } from '../../../../lib/roles';

import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { LinkButton } from '../../../../components/ui/LinkButton';
import { LoadingState } from '../../../../components/ui/LoadingState';
import { ObjectHeader } from '../../../../components/ui/ObjectHeader';
import { TabsNav } from '../../../../components/ui/TabsNav';

export interface AdminUserOutletContext {
  user: User;
  userId: number;
  refetch: () => Promise<void>;
}

export function useAdminUserContext() {
  return useOutletContext<AdminUserOutletContext>();
}

function parseIdParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function AdminUserLayout() {
  const { basePath } = useAppMode();
  const { t } = useI18n();

  const params = useParams();
  const userId = parseIdParam(params['userId']);

  const q = useQuery({
    queryKey: ['users', userId],
    queryFn: async () => {
      if (!userId) throw new Error(t('admin.user.invalid_id'));
      return (await fetchUser(userId)).data;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const u = q.data ?? null;
  const isLoading = Boolean(userId) && q.isLoading;
  const isError = Boolean(userId) && (q.isError || !u);

  return (
    <DetailShell
      testId="admin.user.page"
      header={
        !userId ? null : isLoading || isError || !u ? null : (() => {
          const role = roleFromLevel(u.level);
          const roleVariant = role === 'admin' ? 'black' : role === 'support' ? 'warn' : 'neutral';
          const title = String(u.login ?? `#${u.id}`);

          return (
            <ObjectHeader
              testId="admin.user.header"
              title={title}
              titleAfter={
                <>
                  <Badge variant="neutral">#{u.id}</Badge>
                  <Badge variant={roleVariant}>{role}</Badge>
                </>
              }
              kicker={
                <>
                  <Link className="underline" to={`${basePath}/users`}>
                    {t('admin.users.title')}
                  </Link>
                  <span className="text-faint"> · </span>
                  <span>#{u.id}</span>
                </>
              }
              meta={u.full_name ? String(u.full_name) : u.email ? String(u.email) : ' '}
              actions={
                <>
                  <CopyButton text={title} />
                  <LinkButton
                    to={`${basePath}/vps?user=${u.id}`}
                    variant="secondary"
                    testId="admin.user.action.vps"
                  >
                    {t('nav.vps')}
                  </LinkButton>
                  <LinkButton
                    to={`${basePath}/datasets?user=${u.id}`}
                    variant="secondary"
                    testId="admin.user.action.datasets"
                  >
                    {t('nav.datasets')}
                  </LinkButton>
                  <LinkButton
                    to={`${basePath}/dns?user=${u.id}`}
                    variant="secondary"
                    testId="admin.user.action.dns"
                  >
                    {t('nav.dns')}
                  </LinkButton>
                  <LinkButton
                    to={`${basePath}/requests?user=${u.id}`}
                    variant="secondary"
                    testId="admin.user.action.requests"
                  >
                    {t('nav.requests')}
                  </LinkButton>
                  <LinkButton
                    to={`${basePath}/user-namespaces/maps?user=${u.id}`}
                    variant="secondary"
                    testId="admin.user.action.user_namespaces"
                  >
                    {t('nav.user_namespaces')}
                  </LinkButton>
                  <Button testId="admin.user.refresh" variant="secondary" onClick={() => void q.refetch()}>
                    {t('common.refresh')}
                  </Button>
                </>
              }
            />
          );
        })()
      }
      tabs={
        !userId || isLoading || isError || !u ? null : (
          <TabsNav
            items={[
              { to: `${basePath}/users/${u.id}`, label: t('admin.user.tabs.overview'), end: true },
              { to: `${basePath}/users/${u.id}/resources/usage`, label: t('admin.user.tabs.resource_usage'), end: true },
              { to: `${basePath}/users/${u.id}/resources`, label: t('admin.user.tabs.resources'), end: true },
              { to: `${basePath}/users/${u.id}/payments`, label: t('admin.user.tabs.payments') },
              {
                to: `${basePath}/users/${u.id}/environment-configs`,
                label: t('admin.user.tabs.environment_configs'),
              },
              { to: `${basePath}/users/${u.id}/security`, label: t('admin.user.tabs.security') },
              { to: `${basePath}/users/${u.id}/mfa`, label: t('admin.user.tabs.mfa') },
              { to: `${basePath}/users/${u.id}/sessions`, label: t('admin.user.tabs.sessions') },
              { to: `${basePath}/users/${u.id}/keys`, label: t('admin.user.tabs.keys') },
              { to: `${basePath}/users/${u.id}/metrics`, label: t('admin.user.tabs.metrics') },
              { to: `${basePath}/users/${u.id}/mail`, label: t('admin.user.tabs.mail') },
              { to: `${basePath}/users/${u.id}/user-data`, label: t('admin.user.tabs.user_data') },
              { to: `${basePath}/users/${u.id}/history`, label: t('admin.user.tabs.history') },
            ]}
          />
        )
      }
    >
      {!userId ? (
        <ErrorState
          testId="admin.user.invalid_id"
          kindOverride="not_found"
          title={t('admin.user.invalid_id')}
          body={t('error.not_found.body')}
          backTo={`${basePath}/users`}
          showStatusLink={false}
          showDetails={false}
          detailsExtra={{ page: 'admin.user.detail', userId: null }}
        />
      ) : isLoading ? (
        <LoadingState testId="admin.user.loading" />
      ) : isError ? (
        <ErrorState
          testId="admin.user.error"
          title={t('admin.user.load_error')}
          error={q.error}
          onRetry={() => void q.refetch()}
          backTo={`${basePath}/users`}
          detailsExtra={{ page: 'admin.user.detail', userId }}
        />
      ) : u ? (
        <Outlet
          context={{
            user: u,
            userId,
            refetch: async () => {
              const result = await q.refetch();
              if (result.isError || !result.data) {
                throw result.error ?? new Error(t('admin.user.load_error'));
              }
            },
          }}
        />
      ) : null}
    </DetailShell>
  );
}
