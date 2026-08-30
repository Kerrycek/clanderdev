import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Maximize2, Minimize2, PlugZap, RotateCw, Trash2 } from 'lucide-react';

import { useI18n } from '../../../app/i18n';
import { createConsoleToken, deleteConsoleToken } from '../../../lib/api/vps';
import { HaveApiError } from '../../../lib/api/haveapi';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CopyButton } from '../../../components/ui/CopyButton';
import { Spinner } from '../../../components/ui/Spinner';
import { clsx } from '../../../components/ui/clsx';
import {
  buildConsoleUrl,
  isConsoleTokenExpired,
  millisecondsUntilConsoleTokenExpiry,
  normalizeConsoleToken,
  normalizeRemoteConsoleServer,
} from '../../../lib/consoleToken';
import {
  CONSOLE_CONNECTION_STATE_VARIANT,
  consoleMutationErrorMessage,
  formatConsoleExpiration,
  getConsoleConnectionState,
  hasKnownConsoleToken,
  isConsoleSessionStateUncertain,
  markConsoleSessionStateUncertain,
} from './VpsConsoleModel';
import { useVps } from './VpsContext';

export function VpsConsolePage() {
  const { canMutateVps } = useVps();
  const { t } = useI18n();

  if (!canMutateVps) {
    return (
      <div className="space-y-3" data-testid="vps.console.page">
        <div>
          <h2 className="text-base font-semibold">{t('vps.console.title')}</h2>
          <div className="mt-1 text-sm text-muted">{t('vps.console.subtitle')}</div>
        </div>
        <Alert variant="warn" title={t('gate.blocked.permission.title')} testId="vps.console.read_only">
          {t('gate.blocked.permission.body')}
        </Alert>
      </div>
    );
  }

  return <MutableVpsConsolePage />;
}

function MutableVpsConsolePage() {
  const { vps, sshCommand } = useVps();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [newSessionConfirmOpen, setNewSessionConfirmOpen] = useState(false);
  const [revokeSessionConfirmOpen, setRevokeSessionConfirmOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeProblem, setIframeProblem] = useState(false);
  const [frameNonce, setFrameNonce] = useState(0);
  const [manualReconnect, setManualReconnect] = useState(false);
  const [sessionSuspended, setSessionSuspended] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const tokenQueryKey = ['vps', vps.id, 'consoleToken'] as const;
  const server = normalizeRemoteConsoleServer((vps.node as any)?.location?.remote_console_server);
  const canCreateSession = Boolean(server);

  const createFreshConsoleToken = async () => {
    const normalized = normalizeConsoleToken((await createConsoleToken(vps.id)).data);
    if (!normalized) throw new Error('Console token response did not include a usable token.');
    return normalized;
  };

  const tokenQ = useQuery({
    queryKey: tokenQueryKey,
    queryFn: createFreshConsoleToken,
    // A console token is a server-side session and its creation is a mutation.
    // Keep route navigation and reload read-only; the user must explicitly ask
    // for a session with the action below.
    enabled: false,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const resetFrameState = () => {
    setFrameNonce((value) => value + 1);
    setIframeLoaded(false);
    setIframeProblem(false);
    setManualReconnect(false);
  };

  const revokeSessionM = useMutation({
    mutationFn: async () => deleteConsoleToken(vps.id),
    onSuccess: () => {
      qc.setQueryData(tokenQueryKey, null);
      setSessionSuspended(true);
      resetFrameState();
    },
  });

  const newSessionM = useMutation({
    mutationFn: async () => {
      // The backend `Create` can return an existing valid token. Invalidate a
      // token only when this client actually knows about one; after a revoke,
      // creating the replacement session needs just the explicit POST.
      const invalidatesKnownSession = hasKnownConsoleToken(qc.getQueryData(tokenQueryKey));

      if (invalidatesKnownSession) {
        try {
          await deleteConsoleToken(vps.id);
        } catch (error) {
          // A transport failure cannot prove that the backend did not revoke
          // the token. Stop and hide the cached console instead of showing a
          // potentially invalid session as connected.
          throw markConsoleSessionStateUncertain(error);
        }
      }

      try {
        return await createFreshConsoleToken();
      } catch (error) {
        throw invalidatesKnownSession ? markConsoleSessionStateUncertain(error) : error;
      }
    },
    onMutate: () => {
      revokeSessionM.reset();
    },
    onSuccess: (data) => {
      qc.setQueryData(tokenQueryKey, data);
      setSessionSuspended(false);
      resetFrameState();
    },
    onError: (error) => {
      if (isConsoleSessionStateUncertain(error)) {
        qc.setQueryData(tokenQueryKey, null);
        setSessionSuspended(true);
        resetFrameState();
      }
    },
  });

  const activeToken = sessionSuspended ? null : (tokenQ.data ?? null);

  const consoleUrl = useMemo(
    () => buildConsoleUrl(server, vps.id, activeToken?.token),
    [activeToken?.token, server, vps.id]
  );

  useEffect(() => {
    setIframeLoaded(false);
    setIframeProblem(false);
  }, [consoleUrl]);

  useEffect(() => {
    const currentNow = Date.now();
    setNow(currentNow);

    const msUntilExpiry = millisecondsUntilConsoleTokenExpiry(activeToken?.expiration, currentNow);
    if (msUntilExpiry === null) return undefined;

    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(msUntilExpiry + 250, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [activeToken?.expiration, activeToken?.token]);

  useEffect(() => {
    if (!consoleUrl || iframeLoaded) return;
    const timer = window.setTimeout(() => setIframeProblem(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [consoleUrl, frameNonce, iframeLoaded]);

  useEffect(() => {
    if (!manualReconnect) return;
    const timer = window.setTimeout(() => setManualReconnect(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [manualReconnect]);

  const techError = tokenQ.error instanceof HaveApiError ? tokenQ.error : null;

  const tokenExpired = isConsoleTokenExpired(activeToken?.expiration, now);
  const hasActiveLiveToken = Boolean(activeToken?.token && !tokenExpired);
  const hasConsoleUrl = Boolean(consoleUrl && !tokenExpired);
  const sessionActionPending = newSessionM.isPending || revokeSessionM.isPending;
  const disabledNewSession = !canCreateSession || tokenQ.isFetching || sessionActionPending;
  const disabledRevokeSession = !hasActiveLiveToken || sessionActionPending;

  const reconnect = () => {
    setManualReconnect(true);
    setIframeLoaded(false);
    setIframeProblem(false);
    setFrameNonce((value) => value + 1);
  };

  const connectionState = getConsoleConnectionState({
    hasServer: Boolean(server), sessionActionPending, manualReconnect, tokenError: tokenQ.isError,
    sessionSuspended, tokenExpired, tokenFetching: tokenQ.isFetching,
    hasActiveToken: Boolean(activeToken?.token), iframeProblem, iframeLoaded,
  });
  const expiresAt = formatConsoleExpiration(activeToken?.expiration);

  return (
    <div className="space-y-3" data-testid="vps.console.page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t('vps.console.title')}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{t('vps.console.subtitle')}</span>
            {expiresAt ? <span>{t('vps.console.expires_at', { time: expiresAt })}</span> : null}
          </div>
          <div
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg"
            data-testid="vps.console.connection_state"
          >
            <span className={clsx('h-2.5 w-2.5 rounded-full', CONSOLE_CONNECTION_STATE_VARIANT[connectionState])} aria-hidden="true" />
            {t(`vps.console.state.${connectionState}` as any)}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            testId="vps.console.new_session"
            onClick={() => {
              if (sessionSuspended) {
                newSessionM.mutate();
              } else if (hasActiveLiveToken) {
                setNewSessionConfirmOpen(true);
              } else {
                void tokenQ.refetch();
              }
            }}
            disabled={disabledNewSession}
            title={t('vps.console.new_session.title_hint')}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            {t('vps.console.new_session.label')}
          </Button>
          {hasConsoleUrl ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={reconnect}
                testId="vps.console.reconnect"
                title={t('vps.console.reconnect.title_hint')}
              >
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                {t('vps.console.reconnect.label')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRevokeSessionConfirmOpen(true)}
                testId="vps.console.revoke_session"
                title={t('vps.console.revoke_session.title_hint')}
                disabled={disabledRevokeSession}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t('vps.console.revoke_session.label')}
              </Button>
              <Button
                variant={focused ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFocused((value) => !value)}
                testId={focused ? 'vps.console.exit_focus' : 'vps.console.focus'}
                title={focused ? t('vps.console.exit_focus.title_hint') : t('vps.console.focus.title_hint')}
                ariaLabel={focused ? t('vps.console.exit_focus.label') : t('vps.console.focus.label')}
              >
                {focused ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
                {focused ? t('vps.console.exit_focus.label') : t('vps.console.focus.label')}
              </Button>
              {sshCommand ? (
                <CopyButton
                  text={sshCommand}
                  variant="secondary"
                  size="sm"
                  label={t('vps.console.copy_ssh')}
                  testId="vps.console.copy_ssh"
                />
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                as="a"
                href={consoleUrl!}
                target="_blank"
                rel="noreferrer"
                testId="vps.console.open_new_tab"
                title={t('vps.console.open_new_tab.title_hint')}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t('vps.console.open_new_tab')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {!server ? (
        <div data-testid="vps.console.server_missing">
          <Alert variant="warn" title={t('vps.console.server_missing.title')}>
            {t('vps.console.server_missing.body')}
          </Alert>
        </div>
      ) : null}

      {server && !activeToken && !sessionSuspended && !tokenQ.isFetching && !tokenQ.isError ? (
        <Alert variant="info" title={t('vps.console.not_started.title')} testId="vps.console.not_started">
          {t('vps.console.not_started.body')}
        </Alert>
      ) : null}

      {sessionSuspended ? (
        <Alert variant="ok" title={t('vps.console.revoked.title')} testId="vps.console.revoked">
          <div className="space-y-3">
            <div>{t('vps.console.revoked.body')}</div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => newSessionM.mutate()}
              disabled={disabledNewSession}
              loading={newSessionM.isPending}
              testId="vps.console.revoked.new_session"
            >
              {t('vps.console.new_session.label')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {newSessionM.isError ? (
        <Alert variant="danger" title={t('vps.console.new_session.error_title')} testId="vps.console.new_session_error">
          <div className="space-y-1">
            <div>{t('vps.console.new_session.error_body')}</div>
            <div className="font-mono text-xs">{consoleMutationErrorMessage(newSessionM.error)}</div>
          </div>
        </Alert>
      ) : null}

      {revokeSessionM.isError ? (
        <Alert variant="danger" title={t('vps.console.revoke_error.title')} testId="vps.console.revoke_error">
          <div className="space-y-1">
            <div>{t('vps.console.revoke_error.body')}</div>
            <div className="font-mono text-xs">{consoleMutationErrorMessage(revokeSessionM.error)}</div>
          </div>
        </Alert>
      ) : null}

      {tokenQ.isFetching && !activeToken ? (
        <div
          className="flex min-h-48 items-center justify-center rounded-md border border-border bg-code text-sm text-muted"
          data-testid="vps.console.loading"
        >
          <div className="flex items-center gap-2">
            <Spinner /> {t('vps.console.creating')}
          </div>
        </div>
      ) : null}

      {tokenQ.isError ? (
        <div data-testid="vps.console.error">
          <Alert variant="danger" title={t('vps.console.error.title')}>
            <div className="space-y-2">
              <div>{t('vps.console.error.body')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => tokenQ.refetch()}
                  disabled={tokenQ.isFetching}
                  testId="vps.console.retry"
                >
                  {t('common.retry')}
                </Button>
              </div>

              <details className="rounded-md border border-border bg-surface-2 p-3">
                <summary className="cursor-pointer text-sm font-medium">{t('vps.console.technical_details')}</summary>
                <div className="mt-2 space-y-1 text-xs text-muted">
                  {techError?.httpStatus ? (
                    <div>
                      <span className="font-medium">{t('vps.console.tech.http')}</span>: {techError.httpStatus}
                    </div>
                  ) : null}
                  <div>
                    <span className="font-medium">{t('vps.console.tech.message')}</span>:{' '}
                    {String((tokenQ.error as any)?.message ?? tokenQ.error)}
                  </div>
                  {server ? (
                    <div>
                      <span className="font-medium">{t('vps.console.tech.server')}</span>: {server}
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          </Alert>
        </div>
      ) : null}

      {tokenExpired && consoleUrl ? (
        <div data-testid="vps.console.expired">
          <Alert variant="warn" title={t('vps.console.expired.title')}>
            <div className="space-y-3">
              <div>{t('vps.console.expired.body')}</div>
              <Button
                variant="secondary"
                size="sm"
                testId="vps.console.expired.new_session"
                onClick={() => newSessionM.mutate()}
                disabled={disabledNewSession}
                loading={newSessionM.isPending}
              >
                {t('vps.console.new_session.label')}
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {hasConsoleUrl ? (
        <div
          className={clsx(
            'overflow-hidden rounded-md border bg-code shadow-card transition-shadow',
            focused ? 'border-accent shadow-panel' : 'border-border'
          )}
          data-testid="vps.console.frame"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-black px-3 py-2 text-xs text-white">
            <div className="flex min-w-0 items-center gap-2">
              <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', CONSOLE_CONNECTION_STATE_VARIANT[connectionState])} aria-hidden="true" />
              <span className="truncate font-mono">{vps.hostname ?? `vps-${vps.id}`}</span>
            </div>
            <div className="text-white/70" data-testid="vps.console.frame_status">
              {t(`vps.console.state.${connectionState}` as any)}
            </div>
          </div>
          <div className="relative bg-black">
            {!iframeLoaded && !iframeProblem ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-black text-sm text-white/75"
                data-testid="vps.console.iframe_loading"
              >
                <div className="flex items-center gap-2">
                  <Spinner /> {t('vps.console.loading_frame')}
                </div>
              </div>
            ) : null}
            {iframeProblem ? (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-black p-6 text-center text-sm text-white/80"
                data-testid="vps.console.embed_fallback"
              >
                <div className="max-w-md space-y-3">
                  <div className="text-base font-semibold text-white">{t('vps.console.embed_fallback.title')}</div>
                  <div>{t('vps.console.embed_fallback.body')}</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" size="sm" onClick={reconnect} testId="vps.console.fallback.reconnect">
                      {t('vps.console.reconnect.label')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      as="a"
                      href={consoleUrl!}
                      target="_blank"
                      rel="noreferrer"
                      testId="vps.console.fallback.open_external"
                    >
                      {t('vps.console.open_new_tab')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            <iframe
              key={`${consoleUrl}-${frameNonce}`}
              title={t('vps.console.iframe_title', { id: vps.id })}
              src={consoleUrl!}
              className={clsx('block w-full border-0 bg-black', focused ? 'h-console-focus' : 'h-console')}
              allow="clipboard-read; clipboard-write"
              data-testid="vps.console.iframe"
              onLoad={() => {
                setIframeLoaded(true);
                setIframeProblem(false);
              }}
            />
          </div>
          <div className="border-t border-border bg-black px-3 py-2 text-xs text-white/65">
            {t('vps.console.session_hint')}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={newSessionConfirmOpen}
        testId="vps.console.new_session_dialog"
        title={t('vps.console.new_session.confirm_title')}
        description={t('vps.console.new_session.confirm_body')}
        confirmLabel={t('vps.console.new_session.confirm')}
        confirmLoading={newSessionM.isPending}
        cancelDisabled={newSessionM.isPending}
        onCancel={() => {
          if (newSessionM.isPending) return;
          setNewSessionConfirmOpen(false);
        }}
        onConfirm={() => {
          newSessionM.mutate(undefined, {
            onSettled: () => setNewSessionConfirmOpen(false),
          });
        }}
      />

      <ConfirmDialog
        open={revokeSessionConfirmOpen}
        testId="vps.console.revoke_session_dialog"
        title={t('vps.console.revoke_session.confirm_title')}
        description={t('vps.console.revoke_session.confirm_body')}
        confirmLabel={t('vps.console.revoke_session.confirm')}
        confirmVariant="danger"
        confirmLoading={revokeSessionM.isPending}
        cancelDisabled={revokeSessionM.isPending}
        onCancel={() => {
          if (revokeSessionM.isPending) return;
          setRevokeSessionConfirmOpen(false);
        }}
        onConfirm={() => {
          revokeSessionM.mutate(undefined, {
            onSettled: () => setRevokeSessionConfirmOpen(false),
          });
        }}
      />
    </div>
  );
}
