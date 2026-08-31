import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { useChrome } from '../../../components/layout/ChromeContext';
import { MutationUncertaintyPanel, type MutationReconcileResult } from '../../../components/layout/MutationUncertaintyPanel';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { getMetaActionStateId, isAmbiguousMutationError } from '../../../lib/api/haveapi';
import {
  assignIpAddressRoute,
  assignIpAddressRouteWithHostAddress,
  fetchIpAddress,
  fetchIpAddresses,
  type IpAddress,
} from '../../../lib/api/ipAddresses';
import { fetchHostIpAddresses } from '../../../lib/api/networking';
import { fetchNetworkInterfaces } from '../../../lib/api/networkInterfaces';
import { fetchVpsList, type Vps } from '../../../lib/api/vps';
import { formatErrorMessage } from '../../../lib/errors';
import type { GateDecision } from '../../../lib/gates/types';
import {
  ipRouteAssignIntent,
  reconcileIpAddressMutation,
} from '../../../lib/ipAddressMutationIntent';
import { isLocalLockPersistenceError } from '../../../lib/localLocks';
import { objectRef } from '../../../lib/objectRef';
import {
  assignableIpKind,
  assignableIpKindQuery,
  canAssignIpToVps,
  ipLocationId,
  ipAddressLabel,
  isAssignedIp,
  isOwnedByUser,
  matchesAssignableIpKind,
  type AssignableIpKind,
  uniqueIpAddresses,
  vpsLabel,
  vpsLocationId,
} from './IpAddressAssignmentModel';

export type IpRouteAssignmentMode = 'route' | 'route_host' | 'route_via';

export function ipRouteAssignmentAction(mode: IpRouteAssignmentMode, routeVia?: number) {
  return mode === 'route_host'
    ? { action: 'route_host' as const }
    : { action: 'route' as const, routeVia: mode === 'route_via' ? routeVia : undefined };
}

export function AssignIpAddressModal(props: {
  open: boolean;
  onClose: () => void;
  onAssigned?: (ip: IpAddress) => void;
  fixedVps?: Vps;
  availableVpses?: Vps[];
  initialIp?: IpAddress | null;
  ownedDetachedIps?: IpAddress[];
  gate?: GateDecision;
  testId?: string;
}) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const [vpsId, setVpsId] = useState('');
  const [interfaceId, setInterfaceId] = useState('');
  const [kind, setKind] = useState<AssignableIpKind>('ipv4_public');
  const [ipId, setIpId] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [assignmentMode, setAssignmentMode] = useState<IpRouteAssignmentMode>('route');
  const [routeViaId, setRouteViaId] = useState('');

  useEffect(() => {
    if (!props.open) return;
    setVpsId(props.fixedVps ? String(props.fixedVps.id) : '');
    setInterfaceId('');
    setKind(props.initialIp ? assignableIpKind(props.initialIp) : 'ipv4_public');
    setIpId(props.initialIp ? String(props.initialIp.id) : '');
    setStep(1);
    setAssignmentMode('route');
    setRouteViaId('');
  }, [props.fixedVps?.id, props.initialIp?.id, props.open]);

  const vpsesQ = useQuery({
    queryKey: ['vps', 'list', 'ip-assignment', { limit: 250 }],
    queryFn: async () => (
      await fetchVpsList({ limit: 250, includes: 'node__location__environment,user' })
    ).data,
    enabled: props.open && !props.fixedVps && !props.availableVpses,
    staleTime: 30_000,
  });

  const vpsOptions = useMemo(() => {
    const listed = props.availableVpses ?? vpsesQ.data ?? [];
    if (!props.initialIp) return listed;
    return listed.filter((vps) => canAssignIpToVps(props.initialIp, vps));
  }, [props.availableVpses, props.initialIp, vpsesQ.data]);
  const selectedVps = useMemo(
    () => props.fixedVps ?? vpsOptions.find((vps) => String(vps.id) === vpsId),
    [props.fixedVps, vpsId, vpsOptions]
  );
  const locationId = vpsLocationId(selectedVps);

  const interfacesQ = useQuery({
    queryKey: ['network_interface', 'list', 'ip-assignment', { vpsId: selectedVps?.id ?? null }],
    queryFn: async () => (await fetchNetworkInterfaces(selectedVps!.id, { limit: 100 })).data,
    enabled: props.open && !!selectedVps,
    staleTime: 10_000,
  });

  const kindQuery = assignableIpKindQuery(kind);
  const availableQ = useQuery({
    queryKey: [
      'ip_address',
      'available-for-assignment',
      { locationId, kind, version: kindQuery.version, role: kindQuery.role ?? null },
    ],
    queryFn: async () => (
      await fetchIpAddresses({
        limit: 50,
        location: locationId!,
        version: kindQuery.version,
        role: kindQuery.role,
        purpose: 'vps',
        assignedToInterface: false,
        order: 'interface',
        includes: 'network__primary_location__environment,network_interface,user,vps',
      })
    ).data,
    enabled: props.open && step === 2 && !!selectedVps && !!locationId,
    staleTime: 5_000,
  });

  const availableIps = useMemo(() => {
    const ownedDetached = props.ownedDetachedIps ?? [];
    const rows = props.initialIp
      ? uniqueIpAddresses([props.initialIp, ...ownedDetached, ...(availableQ.data ?? [])])
      : uniqueIpAddresses([...ownedDetached, ...(availableQ.data ?? [])]);
    return rows.filter((ip) => {
      if (isAssignedIp(ip) || !matchesAssignableIpKind(ip, kind)) return false;

      const ipLocation = ipLocationId(ip);
      // Free-address API results are already location-scoped. For user-owned
      // detached addresses brought in from the network overview, keep only
      // addresses whose location matches the selected VPS when we know it.
      return !locationId || !ipLocation || ipLocation === locationId;
    });
  }, [availableQ.data, kind, locationId, props.initialIp, props.ownedDetachedIps]);

  const selectedIp = availableIps.find((ip) => String(ip.id) === ipId);
  const selectedInterface = (interfacesQ.data ?? []).find((item) => String(item.id) === interfaceId);
  const routeViaQ = useQuery({
    queryKey: ['host_ip_address', 'route-via', {
      networkInterface: selectedInterface?.id ?? null,
      version: selectedIp?.network?.ip_version ?? null,
    }],
    queryFn: async () => (await fetchHostIpAddresses({
      networkInterface: selectedInterface!.id,
      assigned: true,
      version: Number(selectedIp!.network?.ip_version),
      limit: 250,
      order: 'interface',
    })).data,
    enabled: props.open && step === 2 && assignmentMode === 'route_via'
      && Boolean(selectedInterface && selectedIp?.network?.ip_version),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!props.open || ipId || availableIps.length === 0) return;
    setIpId(String(availableIps[0]?.id ?? ''));
  }, [availableIps, ipId, props.open]);

  useEffect(() => {
    if (!props.open || interfaceId || !interfacesQ.data?.length) return;
    setInterfaceId(String(interfacesQ.data[0]?.id ?? ''));
  }, [interfaceId, interfacesQ.data, props.open]);

  const assignM = useMutation({
    mutationFn: async (payload: {
      ip: IpAddress;
      vps: Vps;
      networkInterface: number;
      mode: IpRouteAssignmentMode;
      routeVia?: number;
    }) => {
      const assignment = ipRouteAssignmentAction(payload.mode, payload.routeVia);
      return assignment.action === 'route_host'
        ? assignIpAddressRouteWithHostAddress(payload.ip.id, { network_interface: payload.networkInterface })
        : assignIpAddressRoute(payload.ip.id, {
            network_interface: payload.networkInterface,
            route_via: assignment.routeVia,
          });
    },
    onMutate: async (payload) => {
      // The IP address is the mutated resource. Guarding only the destination
      // VPS would let two tabs assign the same detached address to two
      // different VPSes concurrently.
      const intent = ipRouteAssignIntent(payload.ip, payload.networkInterface, payload.vps.id);
      if (!intent) throw new Error(t('vps.network.ip_addresses.validation.missing'));
      const lockRef = objectRef('IpAddress', payload.ip.id);
      const mutationGeneration = await chrome.acquireLocalLock(lockRef, {
        durable: true,
        intent,
      });
      return { lockRef, mutationGeneration };
    },
    onSuccess: async (response, payload, context) => {
      const actionStateId = getMetaActionStateId(response.meta);
      if (actionStateId !== undefined) {
        chrome.trackActionState(actionStateId, {
          actionLabelKey: 'action.vps.network.route_assign.label',
          objectLabel: payload.vps.hostname || `#${payload.vps.id}`,
          object: context?.lockRef,
          mutationGeneration: context?.mutationGeneration,
        });
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ip_address'] }),
        qc.invalidateQueries({ queryKey: ['ip_addresses'] }),
        qc.invalidateQueries({ queryKey: ['network_interface'] }),
      ]);

      pushToast({
        variant: 'ok',
        title: t('network.user.assign.toast.assigned'),
        body: t('network.user.assign.toast.assigned_body', {
          address: ipAddressLabel(payload.ip),
          vps: payload.vps.hostname || `#${payload.vps.id}`,
        }),
      });
      props.onAssigned?.(response.data);
      props.onClose();
    },
    onError: (error: any) => {
      if (error?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: (_data, error, _payload, context) => {
      if (context) chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration);
    },
  });

  const selectedIpRef = selectedIp ? objectRef('IpAddress', selectedIp.id) : null;
  const selectedIpLock = selectedIpRef
    ? chrome.localLocks.find((lock) => lock.kind === selectedIpRef.kind && lock.id === selectedIpRef.id)
    : undefined;
  const selectedIpUncertainLock = selectedIpLock?.uncertain === true ? selectedIpLock : undefined;
  const selectedIpLocked = Boolean(selectedIpRef && chrome.isLocallyLocked(selectedIpRef));
  const gateAllowed = props.gate?.allowed ?? true;
  const gateReason = props.gate && !props.gate.allowed ? props.gate.reason : undefined;
  const canContinue = !!selectedVps && !!selectedInterface && !!locationId && gateAllowed
    && !(props.initialIp && selectedIpLocked);
  const canSubmit = canContinue && !!selectedIp && !selectedIpLocked
    && (assignmentMode !== 'route_via' || Boolean(routeViaId));
  const error = vpsesQ.error ?? interfacesQ.error ?? availableQ.error ?? routeViaQ.error ?? assignM.error;
  const errorMessage = error && !selectedIpUncertainLock
    ? isLocalLockPersistenceError(error)
      ? t('vps.mutation.error.guard_storage')
      : isAmbiguousMutationError(error)
        ? t('vps.mutation.error.outcome_uncertain')
        : formatErrorMessage(error)
    : null;

  const reconcileSelectedIp = async (): Promise<MutationReconcileResult> => {
    if (!selectedIpRef || !selectedIpUncertainLock) return 'error';
    try {
      const current = (await fetchIpAddress(selectedIpRef.id, {
        includes:
          'network__primary_location__environment,network_interface__vps,'
          + 'user,vps,charged_environment',
      })).data;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ip_address'] }),
        qc.invalidateQueries({ queryKey: ['ip_addresses'] }),
        qc.invalidateQueries({ queryKey: ['network_interface'] }),
      ]);
      return reconcileIpAddressMutation(selectedIpUncertainLock, current);
    } catch {
      return 'error';
    }
  };

  const close = () => {
    if (assignM.isPending) return;
    props.onClose();
  };

  const submit = () => {
    if (!canSubmit || !selectedVps || !selectedIp || !selectedInterface) return;
    assignM.mutate({
      ip: selectedIp,
      vps: selectedVps,
      networkInterface: selectedInterface.id,
      mode: assignmentMode,
      routeVia: assignmentMode === 'route_via' ? Number(routeViaId) : undefined,
    });
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={t('network.user.assign.title')}
      testId={props.testId ?? 'network.user.assign'}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          {step === 1 ? (
            <>
              <Button
                variant="secondary"
                testId="network.user.assign.cancel"
                onClick={close}
                disabled={assignM.isPending}
              >
                {t('common.cancel')}
              </Button>
              <ActionButton
                variant="primary"
                testId="network.user.assign.continue"
                disabled={!canContinue}
                disabledReason={gateReason}
                onClick={() => setStep(2)}
              >
                {t('common.continue')}
              </ActionButton>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                testId="network.user.assign.back"
                onClick={() => setStep(1)}
                disabled={assignM.isPending}
              >
                {t('common.back')}
              </Button>
              <ActionButton
                variant="primary"
                testId="network.user.assign.submit"
                loading={assignM.isPending}
                disabled={!canSubmit}
                disabledReason={gateReason}
                onClick={submit}
              >
                {t('network.user.assign.submit')}
              </ActionButton>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" aria-label={t('network.user.assign.progress')}>
          <div className={step === 1 ? 'rounded-lg border border-accent bg-accent/10 p-3' : 'rounded-lg border border-border bg-surface-2 p-3'}>
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">1</span>
              <span className="text-sm font-semibold">{t('network.user.assign.step.target')}</span>
            </div>
          </div>
          <div className={step === 2 ? 'rounded-lg border border-accent bg-accent/10 p-3' : 'rounded-lg border border-border bg-surface-2 p-3'}>
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">2</span>
              <span className="text-sm font-semibold">{t('network.user.assign.step.address')}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted">
          {step === 1 ? t('network.user.assign.help_step1') : t('network.user.assign.help_step2')}
        </p>

        {errorMessage ? (
          <Alert title={t('network.user.assign.error')} variant="danger" testId="network.user.assign.error">
            {errorMessage}
          </Alert>
        ) : null}

        {selectedIpRef && selectedIpUncertainLock ? (
          <MutationUncertaintyPanel
            object={selectedIpRef}
            lock={selectedIpUncertainLock}
            reconcile={reconcileSelectedIp}
            testIdPrefix="network.user.assign.uncertain"
          />
        ) : null}

        {selectedIpLocked && !selectedIpUncertainLock && !errorMessage ? (
          <Alert title={t('network.user.assign.error')} variant="warn" testId="network.user.assign.locked">
            {t('network.user.assign.locked')}
          </Alert>
        ) : null}

        {step === 1 ? (
          <>
            {!props.fixedVps ? (
              <Select
                label={t('network.user.assign.vps')}
                testId="network.user.assign.vps"
                value={vpsId}
                onChange={(event) => {
                  setVpsId(event.target.value);
                  setInterfaceId('');
                  setIpId('');
                }}
                disabled={vpsesQ.isLoading || assignM.isPending}
                options={[
                  { value: '', label: t('network.user.assign.vps.placeholder') },
                  ...vpsOptions.map((vps) => ({ value: String(vps.id), label: vpsLabel(vps) })),
                ]}
              />
            ) : (
              <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
                <div className="text-xs text-muted">{t('network.user.assign.vps')}</div>
                <div className="mt-1 font-medium">{vpsLabel(props.fixedVps)}</div>
              </div>
            )}

            <Select
              label={t('network.user.assign.interface')}
              testId="network.user.assign.interface"
              value={interfaceId}
              onChange={(event) => setInterfaceId(event.target.value)}
              disabled={!selectedVps || interfacesQ.isLoading || assignM.isPending}
              options={[
                { value: '', label: interfacesQ.isLoading ? t('common.loading') : t('network.user.assign.interface.placeholder') },
                ...(interfacesQ.data ?? []).map((item) => ({
                  value: String(item.id),
                  label: `${item.name || `#${item.id}`} (#${item.id})`,
                })),
              ]}
            />

            <Select
              label={t('network.user.assign.kind')}
              testId="network.user.assign.kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as AssignableIpKind);
                setIpId('');
              }}
              disabled={!selectedVps || assignM.isPending}
              options={[
                { value: 'ipv4_public', label: t('network.user.kind.ipv4_public') },
                { value: 'ipv4_private', label: t('network.user.kind.ipv4_private') },
                { value: 'ipv6', label: t('network.user.kind.ipv6') },
              ]}
            />

            {!selectedVps || locationId ? null : (
              <Alert title={t('network.user.assign.location_missing')} variant="warn">
                {t('network.user.assign.location_missing_body')}
              </Alert>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">{t('network.user.assign.vps')}</div>
                <div className="mt-0.5 font-medium">{selectedVps ? vpsLabel(selectedVps) : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('network.user.assign.interface')}</div>
                <div className="mt-0.5 font-medium">{selectedInterface?.name || (selectedInterface ? `#${selectedInterface.id}` : '—')}</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('network.user.assign.kind')}</div>
                <div className="mt-0.5 font-medium">
                  {kind === 'ipv4_private'
                    ? t('network.user.kind.ipv4_private')
                    : kind === 'ipv6'
                      ? t('network.user.kind.ipv6')
                      : t('network.user.kind.ipv4_public')}
                </div>
              </div>
            </div>

            {availableQ.isLoading ? (
              <div className="py-2"><Spinner label={t('common.loading')} /></div>
            ) : (
              <Select
                label={t('network.user.assign.address')}
                testId="network.user.assign.address"
                value={ipId}
                onChange={(event) => setIpId(event.target.value)}
                disabled={assignM.isPending || availableIps.length === 0}
                options={[
                  {
                    value: '',
                    label: availableIps.length > 0
                      ? t('network.user.assign.address.placeholder')
                      : t('network.user.assign.address.none'),
                  },
                  ...availableIps.map((ip) => ({
                    value: String(ip.id),
                    label: `${ipAddressLabel(ip)}${isOwnedByUser(ip, resourceIdFromVps(selectedVps)) ? ` · ${t('network.user.assign.address.owned')}` : ''}`,
                  })),
                ]}
              />
            )}

            <Select
              label={t('network.user.assign.mode')}
              testId="network.user.assign.mode"
              value={assignmentMode}
              onChange={(event) => {
                setAssignmentMode(event.target.value as IpRouteAssignmentMode);
                setRouteViaId('');
              }}
              disabled={assignM.isPending || !selectedIp}
              options={[
                { value: 'route', label: t('network.user.assign.mode.route') },
                { value: 'route_host', label: t('network.user.assign.mode.route_host') },
                { value: 'route_via', label: t('network.user.assign.mode.route_via') },
              ]}
            />

            {assignmentMode === 'route_via' ? (
              <Select
                label={t('network.user.assign.route_via')}
                testId="network.user.assign.route_via"
                value={routeViaId}
                onChange={(event) => setRouteViaId(event.target.value)}
                disabled={routeViaQ.isLoading || assignM.isPending}
                options={[
                  {
                    value: '',
                    label: routeViaQ.isLoading
                      ? t('common.loading')
                      : t('network.user.assign.route_via.placeholder'),
                  },
                  ...(routeViaQ.data ?? []).map((host) => ({
                    value: String(host.id),
                    label: String(host.addr ?? `#${host.id}`),
                  })),
                ]}
              />
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

function resourceIdFromVps(vps: Vps | null | undefined): number | null {
  const user = vps?.user;
  if (!user) return null;
  const id = Number(user.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
