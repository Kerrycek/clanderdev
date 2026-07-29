import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../app/i18n';

import {
  closeUserSession,
  fetchUserSession,
  fetchUserSessions,
  updateUserSessionLabel,
  type UserSession,
} from '../../lib/api/userDossier';

import { cursorFromDescendingPage } from '../../lib/lockIndex';
import { useKeysetPagination } from '../../lib/hooks/useKeysetPagination';
import { useTierCIntervalMs } from '../../lib/refreshTiers';
import { formatErrorMessage } from '../../lib/errors';

import {
  buildUserSessionSummary,
  filterUserSessions,
  isUserSessionStateFilter,
  looksLikeSessionIpSearch,
  type UserSessionStateFilter,
} from './UserSessionsModel';
import { UserSessionCloseDialog, UserSessionRenameDialog } from './UserSessionsDialogs';
import {
  isUserSessionAuthFilter,
  SessionsEmptyState,
  SessionsFilters,
  type UserSessionAuthFilter,
} from './UserSessionsFilters';
import { UserSessionsList } from './UserSessionsList';
import { UserSecurityMetricGrid } from './UserSecurityMetricGrid';

import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { KeysetPagination } from '../ui/KeysetPagination';
import { Spinner } from '../ui/Spinner';

function parsePositiveInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

function likeSearch(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('%') || trimmed.includes('_')) return trimmed;
  return `%${trimmed}%`;
}

function textIncludes(value: unknown, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return String(value ?? '').toLowerCase().includes(n);
}

function sessionMatchesExactIdFilters(
  session: UserSession,
  filters: {
    authType: UserSessionAuthFilter;
    ipSearch?: string;
    userAgent: string;
    clientVersion: string;
    tokenFragment: string;
  }
): boolean {
  if (filters.authType !== 'all' && session.auth_type !== filters.authType) return false;

  if (filters.ipSearch) {
    const n = filters.ipSearch.trim().toLowerCase();
    const apiIp = String(session.api_ip_addr ?? '').toLowerCase();
    const clientIp = String(session.client_ip_addr ?? '').toLowerCase();
    if (!apiIp.includes(n) && !clientIp.includes(n)) return false;
  }

  if (!textIncludes(session.user_agent, filters.userAgent)) return false;
  if (!textIncludes(session.client_version, filters.clientVersion)) return false;

  const token = filters.tokenFragment.trim().toLowerCase();
  if (token && !String(session.token_fragment ?? '').toLowerCase().startsWith(token)) return false;

  return true;
}

export function UserSessionsPanel(props: {
  /** Admin-only: show sessions for this user. */
  userId?: number;
  /** Test id prefix, e.g. "profile.sessions" or "admin.user.sessions" */
  testIdPrefix: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sessionsState, setSessionsState] = useState<UserSessionStateFilter>(() => {
    const value = searchParams.get('state');
    return isUserSessionStateFilter(value) ? value : 'all';
  });
  const [sessionsSearch, setSessionsSearch] = useState(() => searchParams.get('q') ?? '');
  const [exactId, setExactId] = useState(() => searchParams.get('id') ?? '');
  const [authType, setAuthType] = useState<UserSessionAuthFilter>(() => {
    const value = searchParams.get('auth_type');
    return isUserSessionAuthFilter(value) ? value : 'all';
  });
  const [userAgent, setUserAgent] = useState(() => searchParams.get('user_agent') ?? '');
  const [clientVersion, setClientVersion] = useState(() => searchParams.get('client_version') ?? '');
  const [tokenFragment, setTokenFragment] = useState(() => searchParams.get('token') ?? '');
  const [detailedOutput, setDetailedOutput] = useState(() => searchParams.get('details') !== '0');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (sessionsSearch.trim()) next.set('q', sessionsSearch.trim());
    else next.delete('q');

    if (sessionsState && sessionsState !== 'all') next.set('state', sessionsState);
    else next.delete('state');

    if (exactId.trim()) next.set('id', exactId.trim());
    else next.delete('id');

    if (authType !== 'all') next.set('auth_type', authType);
    else next.delete('auth_type');

    if (userAgent.trim()) next.set('user_agent', userAgent.trim());
    else next.delete('user_agent');

    if (clientVersion.trim()) next.set('client_version', clientVersion.trim());
    else next.delete('client_version');

    if (tokenFragment.trim()) next.set('token', tokenFragment.trim());
    else next.delete('token');

    if (detailedOutput) next.delete('details');
    else next.set('details', '0');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    authType,
    clientVersion,
    detailedOutput,
    exactId,
    searchParams,
    sessionsSearch,
    sessionsState,
    setSearchParams,
    tokenFragment,
    userAgent,
  ]);

  const searchTrim = sessionsSearch.trim();
  const ipSearch = looksLikeSessionIpSearch(searchTrim) ? searchTrim : undefined;
  const exactIdNumber = parsePositiveInt(exactId);

  const pagination = useKeysetPagination({
    id: `${props.testIdPrefix}.pagination`,
    filterKey: JSON.stringify({
      userId: props.userId ?? null,
      state: sessionsState,
      q: searchTrim,
      id: exactIdNumber ?? null,
      authType,
      userAgent: userAgent.trim(),
      clientVersion: clientVersion.trim(),
      tokenFragment: tokenFragment.trim(),
    }),
    searchParams,
    setSearchParams,
    defaultLimit: 25,
    allowedLimits: [25, 50, 100],
  });

  const interval = useTierCIntervalMs();

  const sessionsQ = useQuery({
    queryKey: [
      'user_sessions',
      {
        userId: props.userId ?? null,
        state: sessionsState,
        q: searchTrim,
        ip: ipSearch ?? null,
        id: exactIdNumber ?? null,
        authType,
        userAgent: userAgent.trim() || null,
        clientVersion: clientVersion.trim() || null,
        tokenFragment: tokenFragment.trim() || null,
        fromId: pagination.fromId ?? null,
        limit: pagination.limit,
      },
    ],
    queryFn: async () => {
      if (exactIdNumber !== undefined) {
        const res = await fetchUserSession(exactIdNumber);
        if (props.userId !== undefined && res.data.user?.id !== props.userId) return [];
        if (
          !sessionMatchesExactIdFilters(res.data, {
            authType,
            ipSearch,
            userAgent,
            clientVersion,
            tokenFragment,
          })
        ) {
          return [];
        }
        return [res.data];
      }

      const res = await fetchUserSessions({
        userId: props.userId,
        state: sessionsState,
        limit: pagination.limit,
        fromId: pagination.fromId,
        ip_addr: ipSearch ? likeSearch(ipSearch) : undefined,
        auth_type: authType === 'all' ? undefined : authType,
        user_agent: userAgent.trim() ? likeSearch(userAgent) : undefined,
        client_version: clientVersion.trim() ? likeSearch(clientVersion) : undefined,
        token_fragment: tokenFragment.trim() || undefined,
      });
      return res.data;
    },
    refetchInterval: interval,
  });

  const pageCursor = useMemo(() => cursorFromDescendingPage(sessionsQ.data, (session) => session.id), [sessionsQ.data]);
  const hasMore = (sessionsQ.data ?? []).length >= pagination.limit;
  const sessions = useMemo(
    () => filterUserSessions(sessionsQ.data, sessionsState, searchTrim),
    [searchTrim, sessionsQ.data, sessionsState]
  );
  const sessionSummary = useMemo(() => buildUserSessionSummary(sessionsQ.data), [sessionsQ.data]);
  const hasFilters =
    Boolean(searchTrim) ||
    sessionsState !== 'all' ||
    Boolean(exactId.trim()) ||
    authType !== 'all' ||
    Boolean(userAgent.trim()) ||
    Boolean(clientVersion.trim()) ||
    Boolean(tokenFragment.trim());

  const [renamingSession, setRenamingSession] = useState<UserSession | null>(null);
  const [sessionLabel, setSessionLabel] = useState('');
  const [sessionLabelError, setSessionLabelError] = useState<string | null>(null);
  const [closeSession, setCloseSession] = useState<UserSession | null>(null);

  const renameM = useMutation({
    mutationFn: async () => {
      if (!renamingSession) return;
      const label = sessionLabel.trim();
      if (!label) throw new Error(t('profile.sessions.validation.label_required'));
      await updateUserSessionLabel(renamingSession.id, label);
    },
    onSuccess: async () => {
      closeRenameDialog();
      await qc.invalidateQueries({ queryKey: ['user_sessions'] });
    },
    onError: (e) => {
      setSessionLabelError(formatErrorMessage(e));
    },
  });

  const closeM = useMutation({
    mutationFn: async (id: number) => closeUserSession(id),
    onSuccess: async () => {
      setCloseSession(null);
      await qc.invalidateQueries({ queryKey: ['user_sessions'] });
    },
  });

  function startRename(session: UserSession) {
    setRenamingSession(session);
    setSessionLabel(String(session.label ?? ''));
    setSessionLabelError(null);
  }

  function closeRenameDialog() {
    setRenamingSession(null);
    setSessionLabel('');
    setSessionLabelError(null);
  }

  function clearFilters() {
    setSessionsSearch('');
    setSessionsState('all');
    setExactId('');
    setAuthType('all');
    setUserAgent('');
    setClientVersion('');
    setTokenFragment('');
  }

  const prefix = props.testIdPrefix;

  return (
    <>
      <Card testId={`${prefix}.card`}>
        <CardHeader
          title={t('profile.sessions.title')}
          subtitle={t('profile.sessions.subtitle')}
          actions={
            <Button
              variant="secondary"
              onClick={() => void sessionsQ.refetch()}
              disabled={sessionsQ.isFetching}
              testId={`${prefix}.refresh`}
            >
              {t('common.refresh')}
            </Button>
          }
        />

        <CardBody>
          <SessionsFilters
            state={sessionsState}
            search={sessionsSearch}
            exactId={exactId}
            authType={authType}
            userAgent={userAgent}
            clientVersion={clientVersion}
            tokenFragment={tokenFragment}
            detailedOutput={detailedOutput}
            testIdPrefix={prefix}
            onStateChange={setSessionsState}
            onSearchChange={setSessionsSearch}
            onExactIdChange={setExactId}
            onAuthTypeChange={setAuthType}
            onUserAgentChange={setUserAgent}
            onClientVersionChange={setClientVersion}
            onTokenFragmentChange={setTokenFragment}
            onDetailedOutputChange={setDetailedOutput}
          />

          <UserSecurityMetricGrid
            testId={`${prefix}.summary`}
            items={[
              { key: 'open', label: t('profile.sessions.summary.open'), value: sessionSummary.open },
              { key: 'current', label: t('profile.sessions.summary.current'), value: sessionSummary.current },
              { key: 'token', label: t('profile.sessions.summary.tokens'), value: sessionSummary.token },
              { key: 'closed', label: t('profile.sessions.summary.closed'), value: sessionSummary.closed },
            ]}
          />

          {sessionsQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : sessionsQ.isError ? (
            <Alert variant="danger" title={t('profile.sessions.load_failed')}>
              {formatErrorMessage(sessionsQ.error)}
            </Alert>
          ) : sessions.length === 0 ? (
            <SessionsEmptyState hasFilters={hasFilters} testIdPrefix={prefix} onClearFilters={clearFilters} />
          ) : (
            <UserSessionsList
              sessions={sessions}
              testIdPrefix={prefix}
              detailedOutput={detailedOutput}
              onRename={startRename}
              onClose={setCloseSession}
            />
          )}
        </CardBody>

        <KeysetPagination
          page={pagination.page}
          pageCount={pagination.stack.length}
          canPrev={pagination.canPrev}
          canNext={pagination.hasForward || (hasMore && pageCursor !== null)}
          onPrev={pagination.goPrev}
          onNext={() => pagination.goNext(pageCursor)}
          onGoToPage={pagination.goToPage}
          limit={pagination.limit}
          allowedLimits={pagination.allowedLimits}
          onLimitChange={pagination.setLimit}
          testId={`${prefix}.pagination`}
        />
      </Card>

      <UserSessionRenameDialog
        open={renamingSession !== null}
        label={sessionLabel}
        error={sessionLabelError}
        saving={renameM.isPending}
        testIdPrefix={prefix}
        onLabelChange={setSessionLabel}
        onCancel={() => {
          if (renameM.isPending) return;
          closeRenameDialog();
        }}
        onSave={() => renameM.mutate()}
      />

      <UserSessionCloseDialog
        session={closeSession}
        closing={closeM.isPending}
        testIdPrefix={prefix}
        onCancel={() => {
          if (closeM.isPending) return;
          setCloseSession(null);
        }}
        onConfirm={() => {
          if (!closeSession) return;
          closeM.mutate(closeSession.id);
        }}
      />
    </>
  );
}
