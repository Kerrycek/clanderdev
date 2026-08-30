import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { fetchActionState } from '../../../lib/api/actionStates';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import {
  deployVpsPublicKey,
  getCurrentUser,
  listUserPublicKeys,
  listVpsSshHostKeys,
  resetVpsRootPassword,
  type ApiResult,
  type UserIdentity,
  type VpsGeneratedPassword,
  type VpsPasswordType,
  type VpsPublicKey,
  type VpsSshHostKey,
} from '../../../lib/api/vpsAccess';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { objectRef } from '../../../lib/objectRef';
import { useFastPollIntervalMs } from '../../../lib/refreshTiers';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import { freezeVpsMutationSnapshot, type VpsMutationSnapshot } from './VpsMutationSnapshot';
import {
  actionStateFailed,
  actionStateFinished,
  boolValue,
  errorMessage,
  extractPassword,
  isBusyError,
  PasswordBox,
  publicKeyLabel,
  recordField,
  resourceId,
  resourceLabel,
  type GeneratedCredential,
  type PendingGeneratedCredential,
  type PendingPublicKeyDeployment,
} from './VpsAccessPrimitives';
import { buildVpsAccessChecklist, findDuplicatePublicKeyGroups } from './VpsAccessModel';
import { VpsAccessMutationGuardAlerts } from './VpsAccessMutationGuardAlerts';
import { VpsAccessChecklistCard, VpsAccessStatusCard } from './VpsAccessSummary';
import { VpsSshHostKeysCard } from './VpsSshHostKeysCard';
export function VpsAccessPage() {
  const { basePath, mode } = useAppMode();
  const chrome = useChrome();
  const qc = useQueryClient();
  const fastPollMs = useFastPollIntervalMs();
  const { t } = useI18n();
  const { vps, canMutateVps, busyTransaction, busyLocalLock } = useVps();
  const vpsId = Number(vps.id);
  const vpsData = vps as Record<string, unknown>;
  const objectLabel = String(vpsData['hostname'] ?? '') || `#${vpsId}`;
  const isRunning = boolValue(vpsData['is_running']);
  const ownerUserId = resourceId(vpsData['user']);
  const ownerLabel = resourceLabel(vpsData['user']);
  const [passwordType, setPasswordType] = useState<VpsPasswordType>('secure');
  const [pendingPasswordType, setPendingPasswordType] = useState<{ vpsId: number; type: VpsPasswordType } | null>(null);
  const [selectedPublicKeyId, setSelectedPublicKeyId] = useState<number | null>(null); const [pendingPublicKeyId, setPendingPublicKeyId] = useState<number | null>(null);
  const [generated, setGenerated] = useState<(GeneratedCredential & { vpsId: number }) | null>(null);
  const [pendingGenerated, setPendingGenerated] = useState<PendingGeneratedCredential | null>(null);
  const [missingPassword, setMissingPassword] = useState<{ vpsId: number } | null>(null); const [passwordActivationError, setPasswordActivationError] = useState<{ vpsId: number; asId: number } | null>(null);
  const [passwordMutationError, setPasswordMutationError] = useState<{ vpsId: number; error: unknown } | null>(null);
  const [keyDeployMessage, setKeyDeployMessage] = useState(''); const [pendingKeyDeployment, setPendingKeyDeployment] = useState<PendingPublicKeyDeployment | null>(null);
  const [keyDeploymentError, setKeyDeploymentError] = useState<PendingPublicKeyDeployment | null>(null);
  const invalidateMutationTarget = (targetVpsId: number) => {
    void qc.invalidateQueries({ queryKey: ['vps', 'show', { id: targetVpsId }] });
    void qc.invalidateQueries({ queryKey: ['transaction_chain', 'list', { className: 'Vps', rowId: targetVpsId }] });
  };

  const currentUserQ = useQuery<ApiResult<UserIdentity>>({
    queryKey: ['user', 'current'],
    queryFn: getCurrentUser,
    enabled: canMutateVps && ownerUserId === null,
  });
  const fallbackUserId = resourceId(currentUserQ.data?.data);
  const publicKeyUserId = ownerUserId ?? fallbackUserId;

  const publicKeysQ = useQuery<ApiResult<VpsPublicKey[]>>({
    queryKey: ['user', 'public_keys', { userId: publicKeyUserId }],
    queryFn: () => listUserPublicKeys(publicKeyUserId as number),
    enabled: canMutateVps && publicKeyUserId !== null,
  });

  const hostKeysQ = useQuery<ApiResult<VpsSshHostKey[]>>({
    queryKey: ['vps', vpsId, 'ssh_host_keys'],
    queryFn: () => listVpsSshHostKeys(vpsId),
  });

  const currentPendingGenerated = pendingGenerated?.vpsId === vpsId ? pendingGenerated : null; const currentGenerated = generated?.vpsId === vpsId ? generated : null;
  const currentMissingPassword = missingPassword?.vpsId === vpsId ? missingPassword : null; const currentPasswordActivationError = passwordActivationError?.vpsId === vpsId ? passwordActivationError : null;
  const currentPasswordMutationError = passwordMutationError?.vpsId === vpsId ? passwordMutationError : null; const currentPendingPasswordType = pendingPasswordType?.vpsId === vpsId ? pendingPasswordType : null;
  const passwordStateQ = useQuery({
    queryKey: ['action_state', 'show', { id: currentPendingGenerated?.asId ?? -1 }],
    queryFn: async () => (await fetchActionState(currentPendingGenerated!.asId)).data,
    enabled: canMutateVps && currentPendingGenerated !== null,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return fastPollMs;
      return actionStateFinished(state) ? false : fastPollMs;
    },
  });

  const keyDeploymentStateQ = useQuery({
    queryKey: ['action_state', 'show', { id: pendingKeyDeployment?.asId ?? -1 }],
    queryFn: async () => (await fetchActionState(pendingKeyDeployment!.asId)).data,
    enabled: canMutateVps && pendingKeyDeployment !== null,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return fastPollMs;
      return actionStateFinished(state) ? false : fastPollMs;
    },
  });

  const publicKeys: VpsPublicKey[] = useMemo(() => publicKeysQ.data?.data ?? [], [publicKeysQ.data]);
  const hostKeys: VpsSshHostKey[] = useMemo(() => hostKeysQ.data?.data ?? [], [hostKeysQ.data]);
  const duplicatePublicKeyGroups = useMemo(() => findDuplicatePublicKeyGroups(publicKeys), [publicKeys]);
  const selectedPublicKey = useMemo(
    () => publicKeys.find((key: VpsPublicKey) => Number(key.id) === selectedPublicKeyId) ?? null,
    [publicKeys, selectedPublicKeyId]
  );
  const pendingPublicKey = useMemo(
    () => publicKeys.find((key: VpsPublicKey) => Number(key.id) === pendingPublicKeyId) ?? null,
    [pendingPublicKeyId, publicKeys]
  );

  useEffect(() => {
    if (publicKeys.length === 0) {
      setSelectedPublicKeyId(null);
      return;
    }
    if (!selectedPublicKeyId || !publicKeys.some((key: VpsPublicKey) => Number(key.id) === selectedPublicKeyId)) {
      const firstId = publicKeys[0]?.id;
      if (firstId !== undefined) setSelectedPublicKeyId(Number(firstId));
    }
  }, [publicKeys, selectedPublicKeyId]);

  useEffect(() => {
    if (!currentPendingGenerated) return;
    if (!passwordStateQ.data) return;
    if (!actionStateFinished(passwordStateQ.data)) return;

    if (actionStateFailed(passwordStateQ.data)) {
      setPasswordActivationError({ vpsId: currentPendingGenerated.vpsId, asId: currentPendingGenerated.asId });
    } else {
      setGenerated({ vpsId: currentPendingGenerated.vpsId, password: currentPendingGenerated.password, passwordType: currentPendingGenerated.passwordType });
    }

    setPendingGenerated(null);
    invalidateMutationTarget(currentPendingGenerated.vpsId);
  }, [passwordStateQ.data, currentPendingGenerated, qc]);

  useEffect(() => {
    if (!pendingKeyDeployment) return;
    if (!keyDeploymentStateQ.data) return;
    if (!actionStateFinished(keyDeploymentStateQ.data)) return;

    if (actionStateFailed(keyDeploymentStateQ.data)) {
      setKeyDeploymentError(pendingKeyDeployment);
    } else {
      setKeyDeployMessage(pendingKeyDeployment.keyLabel);
    }

    setPendingKeyDeployment(null);
    invalidateMutationTarget(pendingKeyDeployment.vpsId);
  }, [keyDeploymentStateQ.data, pendingKeyDeployment, qc]);

  const passwdM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { type: VpsPasswordType }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return resetVpsRootPassword(variables.vpsId, { type: variables.type });
    },
    onMutate: async (variables) => {
      setGenerated((current) => current?.vpsId === variables.vpsId ? null : current);
      setPendingGenerated((current) => current?.vpsId === variables.vpsId ? null : current);
      setMissingPassword((current) => current?.vpsId === variables.vpsId ? null : current);
      setPasswordActivationError((current) => current?.vpsId === variables.vpsId ? null : current);
      setPasswordMutationError((current) => current?.vpsId === variables.vpsId ? null : current);
      const lockRef = objectRef('Vps', variables.vpsId);
      return { lockRef, mutationGeneration: await chrome.acquireLocalLock(lockRef, { durable: true }) };
    },
    onSuccess: (res: ApiResult<VpsGeneratedPassword>, variables, context) => {
      setPendingPasswordType((current) => current?.vpsId === variables.vpsId ? null : current);
      const password = extractPassword(res);
      const asId = getMetaActionStateId(res.meta);
      if (password && asId !== undefined) {
        setPendingGenerated({ password, passwordType: variables.type, asId, vpsId: variables.vpsId });
      } else if (password) {
        setGenerated({ vpsId: variables.vpsId, password, passwordType: variables.type });
      } else {
        setMissingPassword({ vpsId: variables.vpsId });
      }
      invalidateMutationTarget(variables.vpsId);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.access.passwd.label',
          objectLabel: variables.objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.vps.root_password.title',
        });
      }
    },
    onError: (e: unknown, variables) => {
      setPendingPasswordType((current) => current?.vpsId === variables.vpsId ? null : current);
      setPasswordMutationError({ vpsId: variables.vpsId, error: e });
      if (isBusyError(e)) chrome.openTasks();
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
  });
  const deployKeyM = useMutation({
    mutationFn: async (variables: VpsMutationSnapshot & { publicKeyId: number; keyLabel: string }) => {
      if (!variables.canMutate) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId: variables.vpsId, t, knownBusy: variables.knownBusy });
      return deployVpsPublicKey(variables.vpsId, variables.publicKeyId);
    },
    onMutate: async (variables) => {
      setKeyDeployMessage('');
      setPendingKeyDeployment(null);
      setKeyDeploymentError(null);
      const lockRef = objectRef('Vps', variables.vpsId);
      return { lockRef, mutationGeneration: await chrome.acquireLocalLock(lockRef, { durable: true }) };
    },
    onSuccess: (res: ApiResult<Record<string, never>>, variables, context) => {
      const keyLabel = variables.keyLabel;
      setPendingPublicKeyId(null);
      invalidateMutationTarget(variables.vpsId);
      const asId = getMetaActionStateId(res.meta);
      if (asId !== undefined) {
        setPendingKeyDeployment({ asId, keyLabel, vpsId: variables.vpsId });
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.access.deploy_public_key.label',
          objectLabel: variables.objectLabel,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
          blockUi: true,
          progressTitleKey: 'modal.vps.deploy_public_key.title',
        });
      } else {
        setKeyDeployMessage(keyLabel);
      }
    },
    onError: (e: unknown) => {
      setPendingPublicKeyId(null);
      if (isBusyError(e)) chrome.openTasks();
    },
    onSettled: (_data, error, _variables, context) => context && chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
  });
  const currentPasswdMutationPending = passwdM.isPending && passwdM.variables?.vpsId === vpsId;
  const busyLocal = busyLocalLock || currentPasswdMutationPending || deployKeyM.isPending || currentPendingGenerated !== null || pendingKeyDeployment !== null;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });
  const snapshotAccessTarget = () => freezeVpsMutationSnapshot({
    vpsId, canMutate: canMutateVps, knownBusy: busyTransaction || busyLocalLock, objectLabel,
  });
  const canGenerate = canMutateVps && gate.allowed && !currentPasswdMutationPending && currentPendingGenerated === null;
  const canDeployKey = canMutateVps && gate.allowed && !deployKeyM.isPending && pendingKeyDeployment === null && selectedPublicKeyId !== null && publicKeys.length > 0;
  const selectedTypeLabel = t(passwordType === 'secure' ? 'vps.access.password_type.secure' : 'vps.access.password_type.simple');
  const pendingTypeLabel = currentPendingPasswordType
    ? t(currentPendingPasswordType.type === 'secure' ? 'vps.access.password_type.secure' : 'vps.access.password_type.simple')
    : '';
  const selectedKeyLabel = publicKeyLabel(selectedPublicKey);
  const pendingKeyLabel = publicKeyLabel(pendingPublicKey);
  const publicKeysLoaded = publicKeyUserId !== null && !publicKeysQ.isPending && !publicKeysQ.error;
  const hostKeysLoaded = !hostKeysQ.isPending && !hostKeysQ.error;
  const publicKeysHref = mode === 'admin' && publicKeyUserId !== null ? `${basePath}/users/${publicKeyUserId}/keys` : `${basePath}/profile/keys`;

  const checklistItems = useMemo(
    () =>
      buildVpsAccessChecklist({
        publicKeysLoaded,
        publicKeyCount: publicKeys.length,
        duplicatePublicKeyGroupCount: duplicatePublicKeyGroups.length,
        hostKeysLoaded,
        hostKeyCount: hostKeys.length,
        mutationAllowed: canMutateVps && gate.allowed,
      }),
    [canMutateVps, duplicatePublicKeyGroups.length, gate.allowed, hostKeys.length, hostKeysLoaded, publicKeys.length, publicKeysLoaded]
  );

  return (
    <div className="space-y-4" data-testid="vps.access.page">
      <VpsAccessStatusCard
        objectLabel={objectLabel}
        osTemplateLabel={resourceLabel(recordField(vpsData, 'os_template'))}
        ownerLabel={ownerLabel}
        runningLabel={isRunning ? t('vps.access.status.running_yes') : t('vps.access.status.running_no')}
        passwordTypeLabel={selectedTypeLabel}
      />
      <VpsAccessChecklistCard items={checklistItems} />

      <VpsAccessMutationGuardAlerts canMutateVps={canMutateVps} gate={gate} onOpenTasks={() => chrome.openTasks()} />

      {currentPasswordMutationError ? <Alert variant="danger">{errorMessage(currentPasswordMutationError.error, t('vps.mutation.error.missing_action_state'))}</Alert> : null}
      {deployKeyM.error ? <Alert variant="danger">{errorMessage(deployKeyM.error, t('vps.mutation.error.missing_action_state'))}</Alert> : null}
      {currentMissingPassword ? <Alert variant="warn">{t('vps.access.generated.missing_password')}</Alert> : null}
      {currentPendingGenerated ? (
        <Alert variant="info" title={t('vps.access.generated.pending_title')}>
          {t('vps.access.generated.pending_description', { id: currentPendingGenerated.asId })}
        </Alert>
      ) : null}
      {passwordStateQ.error ? <Alert variant="danger">{errorMessage(passwordStateQ.error)}</Alert> : null}
      {currentPasswordActivationError ? (
        <Alert variant="danger" title={t('vps.access.generated.activation_failed_title')}>
          {t('vps.access.generated.activation_failed_description', { id: currentPasswordActivationError.asId })}
        </Alert>
      ) : null}
      {pendingKeyDeployment ? (
        <Alert variant="info" title={t('vps.access.ssh.pending_title')}>
          {t('vps.access.ssh.pending_description', { id: pendingKeyDeployment.asId, key: pendingKeyDeployment.keyLabel })}
        </Alert>
      ) : null}
      {keyDeploymentStateQ.error ? <Alert variant="danger">{errorMessage(keyDeploymentStateQ.error)}</Alert> : null}
      {keyDeploymentError ? (
        <Alert variant="danger" title={t('vps.access.ssh.failed_title')}>
          <div className="space-y-3">
            <p>{t('vps.access.ssh.failed_description', { id: keyDeploymentError.asId, key: keyDeploymentError.keyLabel })}</p>
            <Button variant="secondary" size="sm" onClick={() => chrome.openTasks()} testId="vps.access.ssh.failure.open_tasks">
              {t('common.open_tasks')}
            </Button>
          </div>
        </Alert>
      ) : null}
      {keyDeployMessage ? <Alert variant="info">{t('vps.access.ssh.deployed', { key: keyDeployMessage })}</Alert> : null}

      {canMutateVps ? <Card>
        <CardHeader title={t('vps.access.reset.title')} subtitle={t('vps.access.reset.subtitle')} />
        <CardBody className="space-y-4">
          <div className="space-y-2">
            <label className="block">
              <span className="text-sm font-medium text-fg">{t('vps.access.form.type.label')}</span>
            </label>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <select
                value={passwordType}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setPasswordType(event.target.value as VpsPasswordType)}
                disabled={currentPasswdMutationPending}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
                data-testid="vps.access.password_type"
              >
                <option value="secure">{t('vps.access.password_type.secure')}</option>
                <option value="simple">{t('vps.access.password_type.simple')}</option>
              </select>
              <ActionButton loading={currentPasswdMutationPending} disabled={!canGenerate} onClick={() => setPendingPasswordType({ vpsId, type: passwordType })} testId="vps.access.password.generate">
                {t('vps.access.reset.button')}
              </ActionButton>
            </div>
            <span className="block text-xs text-muted">{t('vps.access.form.type.description')}</span>
          </div>

          <Alert variant="info" title={t('vps.access.safety.title')}>
            {t('vps.access.safety.description')}
          </Alert>
        </CardBody>
      </Card> : null}

      {currentGenerated ? (
        <Card>
          <CardHeader
            title={t('vps.access.generated.title')}
            subtitle={t('vps.access.generated.subtitle', {
              type: t(currentGenerated.passwordType === 'secure' ? 'vps.access.password_type.secure' : 'vps.access.password_type.simple'),
            })}
          />
          <CardBody>
            <PasswordBox password={currentGenerated.password} onClear={() => setGenerated(null)} testId="vps.access.generated_password" />
          </CardBody>
        </Card>
      ) : null}

      <VpsSshHostKeysCard hostKeys={hostKeys} loading={hostKeysQ.isPending} error={hostKeysQ.error} onRefresh={() => void hostKeysQ.refetch()} />

      {canMutateVps ? <Card>
        <CardHeader title={t('vps.access.ssh.title')} subtitle={t('vps.access.ssh.subtitle')} />
        <CardBody className="space-y-4">
          {publicKeyUserId === null && currentUserQ.isPending ? <Alert variant="info">{t('vps.access.ssh.loading_user')}</Alert> : null}
          {currentUserQ.error ? <Alert variant="danger">{errorMessage(currentUserQ.error)}</Alert> : null}
          {publicKeysQ.error ? <Alert variant="danger">{errorMessage(publicKeysQ.error)}</Alert> : null}

          <div className="space-y-2">
            <label className="block">
              <span className="text-sm font-medium text-fg">{t('vps.access.ssh.key.label')}</span>
            </label>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
              <select
                value={selectedPublicKeyId ?? ''}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedPublicKeyId(event.target.value ? Number(event.target.value) : null)}
                disabled={publicKeysQ.isPending || publicKeys.length === 0 || deployKeyM.isPending}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
                data-testid="vps.access.ssh.key"
              >
                {publicKeys.length === 0 ? <option value="">{t('vps.access.ssh.no_keys_option')}</option> : null}
                {publicKeys.map((key: VpsPublicKey) => (
                  <option key={key.id} value={key.id}>
                    {publicKeyLabel(key)}
                  </option>
                ))}
              </select>

              <Button variant="secondary" onClick={() => void publicKeysQ.refetch()} disabled={publicKeyUserId === null || publicKeysQ.isPending} testId="vps.access.ssh.refresh">
                {publicKeysQ.isPending ? t('vps.access.ssh.loading') : t('vps.access.ssh.refresh')}
              </Button>

              <ActionButton
                loading={deployKeyM.isPending}
                disabled={!canDeployKey}
                onClick={() => (selectedPublicKeyId !== null ? setPendingPublicKeyId(selectedPublicKeyId) : undefined)}
                testId="vps.access.ssh.deploy"
              >
                {t('vps.access.ssh.deploy.button')}
              </ActionButton>
            </div>
            <span className="block text-xs text-muted">
              {publicKeyUserId !== null
                ? t('vps.access.ssh.key.description', { owner: ownerLabel || `#${publicKeyUserId}` })
                : t('vps.access.ssh.key.description_unknown_owner')}
            </span>
          </div>

          {publicKeysQ.isPending ? <Alert variant="info">{t('vps.access.ssh.loading_keys')}</Alert> : null}
          {!publicKeysQ.isPending && publicKeyUserId !== null && publicKeys.length === 0 ? (
            <Alert variant="warn" title={t('vps.access.ssh.no_keys.title')}>
              <div className="space-y-3">
                <p>{t('vps.access.ssh.no_keys.description')}</p>
                <Button to={publicKeysHref} variant="secondary" size="sm" testId="vps.access.ssh.no_keys.profile">
                  {t('vps.access.ssh.no_keys.profile_button')}
                </Button>
              </div>
            </Alert>
          ) : null}

          {duplicatePublicKeyGroups.length > 0 ? (
            <Alert variant="warn" title={t('vps.access.ssh.duplicates.title')}>
              {t('vps.access.ssh.duplicates.description', { count: duplicatePublicKeyGroups.length })}
            </Alert>
          ) : null}

          {selectedPublicKey ? (
            <div className="min-w-0 max-w-full rounded-lg border border-border bg-surface p-4 text-sm">
              <div className="min-w-0 break-all font-medium text-fg">{selectedKeyLabel}</div>
              {selectedPublicKey.fingerprint ? (
                <div className="mt-2 min-w-0 break-all text-xs text-muted" data-testid="vps.access.ssh.selected.fingerprint">
                  {t('vps.access.ssh.selected.fingerprint')}: <code className="font-mono text-fg">{selectedPublicKey.fingerprint}</code>
                </div>
              ) : null}
              {selectedPublicKey.comment ? <div className="mt-1 min-w-0 break-all text-muted">{selectedPublicKey.comment}</div> : null}
              {selectedPublicKey.auto_add !== undefined ? (
                <div className="mt-1 text-xs text-muted">
                  {selectedPublicKey.auto_add ? t('vps.access.ssh.auto_add.yes') : t('vps.access.ssh.auto_add.no')}
                </div>
              ) : null}
            </div>
          ) : null}

          <Alert variant="info" title={t('vps.access.ssh.safety.title')}>
            {t('vps.access.ssh.safety.description')}
          </Alert>
        </CardBody>
      </Card> : null}

      {canMutateVps ? <ConfirmDialog
        open={currentPendingPasswordType !== null}
        testId="vps.access.password.confirm"
        title={t('vps.access.confirm.title')}
        description={t('vps.access.confirm.description', { hostname: objectLabel, type: pendingTypeLabel })}
        confirmLabel={t('vps.access.confirm.button')}
        confirmLoading={currentPasswdMutationPending}
        confirmDisabled={!currentPendingPasswordType || currentPasswdMutationPending}
        onCancel={() => setPendingPasswordType(null)}
        onConfirm={() => currentPendingPasswordType && passwdM.mutate(freezeVpsMutationSnapshot({ ...snapshotAccessTarget(), type: currentPendingPasswordType.type }))}
      /> : null}

      {canMutateVps ? <ConfirmDialog
        open={pendingPublicKeyId !== null}
        testId="vps.access.ssh.confirm"
        title={t('vps.access.ssh.confirm.title')}
        description={t('vps.access.ssh.confirm.description', { hostname: objectLabel, key: pendingKeyLabel })}
        confirmLabel={t('vps.access.ssh.confirm.button')}
        confirmLoading={deployKeyM.isPending}
        confirmDisabled={!pendingPublicKeyId || deployKeyM.isPending}
        onCancel={() => setPendingPublicKeyId(null)}
        onConfirm={() => pendingPublicKeyId && deployKeyM.mutate(freezeVpsMutationSnapshot({
          ...snapshotAccessTarget(), publicKeyId: pendingPublicKeyId, keyLabel: pendingKeyLabel,
        }))}
      /> : null}
    </div>
  );
}

export default VpsAccessPage;
