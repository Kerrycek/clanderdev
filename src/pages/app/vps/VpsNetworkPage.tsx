import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../app/auth';
import { useAppMode } from '../../../app/appMode';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { UserLookupInput } from '../../../components/ui/UserLookupInput';
import { fetchEnvironments } from '../../../lib/api/infra';
import {
  assignIpAddressRoute,
  fetchIpAddressesForVps,
  freeIpAddressRoute,
  updateIpAddress,
  type IpAddress,
} from '../../../lib/api/ipAddresses';
import {
  assignHostIpAddress,
  deleteHostIpAddress,
  fetchHostIpAddresses,
  freeHostIpAddress,
  updateHostIpAddress,
  type HostIpAddress,
} from '../../../lib/api/networking';
import { fetchNetworkInterfaceAccountingForVps, fetchNetworkInterfaces, updateNetworkInterface, type NetworkInterface } from '../../../lib/api/networkInterfaces';
import { updateVps } from '../../../lib/api/vps';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';
import { VpsNetworkInterfacesCard } from './VpsNetworkInterfacesCard';
import { VpsNetworkAddressesSection } from './VpsNetworkAddressesSection';
import { VpsNetworkOverviewCard } from './VpsNetworkOverviewCard';
import { AssignIpAddressModal } from '../networking/AssignIpAddressModal';
import {
  buildNetworkRouteSummary,
  canonicalBool,
  errorMessage,
  groupIpByInterface,
  hostAddr,
  idFromResourceRef,
  ipAddressLabel,
  ipFamilyLabel,
  ipLocationLabel,
  labelFromResourceRef,
  monthKey,
  parsePositiveId,
  sumAccountingRows,
  validatePtrValue,
} from './VpsNetworkModel';

export function VpsNetworkPage() {
  const auth = useAuth();
  const { basePath, mode } = useAppMode();
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { pushToast } = useToasts();

  const { vps, canMutateVps, refetch, refetchChains, vpsRef, busyTransaction, busyLocalLock } = useVps();

  const vpsId = vps.id;
  const canAdmin = mode === 'admin' && auth.role === 'admin';
  const adminBasePath = mode === 'admin' ? basePath : '/admin';

  const netEnabled = canonicalBool(vps.enable_network, true);
  const objectLabel = String(vps.hostname ?? '') || `#${vpsId}`;

  const netifsQ = useQuery({
    queryKey: ['network_interface', 'list', { vpsId, limit: 100 }],
    queryFn: async () => (await fetchNetworkInterfaces(vpsId, { limit: 100 })).data,
    refetchOnWindowFocus: false,
  });

  const ipsQ = useQuery({
    queryKey: ['ip_address', 'list', { vpsId, limit: 250 }],
    queryFn: async () => (await fetchIpAddressesForVps(vpsId, { limit: 250 })).data,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const acctMonth = useMemo(() => monthKey(new Date()), []);

  const acctQ = useQuery({
    queryKey: ['network_interface', 'accounting', { vpsId, year: acctMonth.year, month: acctMonth.month }],
    queryFn: async () => (await fetchNetworkInterfaceAccountingForVps(vpsId, acctMonth.year, acctMonth.month)).data,
    refetchOnWindowFocus: false,
  });

  const hostAddrsQ = useQuery({
    queryKey: ['host_ip_addresses', 'vps', { vpsId, limit: 250 }],
    queryFn: async () => (await fetchHostIpAddresses({ vps: vpsId, limit: 250, order: 'interface' })).data,
    refetchOnWindowFocus: false,
  });

  const environmentsQ = useQuery({
    queryKey: ['environments', 'vps-network-ip-owner'],
    queryFn: async () => (await fetchEnvironments({ limit: 250 })).data,
    enabled: canAdmin,
    staleTime: 60_000,
  });

  const acctTotals = useMemo(() => sumAccountingRows(acctQ.data ?? []), [acctQ.data]);

  const ipByNetif = useMemo(() => groupIpByInterface(ipsQ.data ?? []), [ipsQ.data]);

  const [editNetif, setEditNetif] = useState<NetworkInterface | null>(null);
  const [editName, setEditName] = useState('');
  const [editEnable, setEditEnable] = useState(true);
  const [editMaxTx, setEditMaxTx] = useState('');
  const [editMaxRx, setEditMaxRx] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [ptrEditor, setPtrEditor] = useState<HostIpAddress | null>(null);
  const [ptrValue, setPtrValue] = useState('');
  const [assignHost, setAssignHost] = useState<HostIpAddress | null>(null);
  const [assignHostInterface, setAssignHostInterface] = useState('');
  const [freeHost, setFreeHost] = useState<HostIpAddress | null>(null);
  const [deleteHost, setDeleteHost] = useState<HostIpAddress | null>(null);
  const [freeRouteIp, setFreeRouteIp] = useState<IpAddress | null>(null);
  const [assignRouteIp, setAssignRouteIp] = useState<IpAddress | null>(null);
  const [assignRouteInterface, setAssignRouteInterface] = useState('');
  const [ownerIp, setOwnerIp] = useState<IpAddress | null>(null);
  const [ownerUser, setOwnerUser] = useState('');
  const [ownerEnvironment, setOwnerEnvironment] = useState('');
  const [addIpOpen, setAddIpOpen] = useState(false);

  const openEdit = (ni: NetworkInterface) => {
    if (!canMutateVps) return;
    setEditNetif(ni);
    setEditError(null);
    setEditName(ni.name ?? '');
    setEditEnable(ni.enable !== false);
    setEditMaxTx(typeof ni.max_tx === 'number' ? String(Math.round(ni.max_tx / 1024 / 1024)) : '');
    setEditMaxRx(typeof ni.max_rx === 'number' ? String(Math.round(ni.max_rx / 1024 / 1024)) : '');
  };

  const updateNetifM = useMutation({
    mutationFn: async (payload: { id: number; params: Record<string, unknown> }) => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return updateNetworkInterface(payload.id, payload.params);
    },
    onMutate: () => {
      chrome.acquireLocalLock(vpsRef);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['network_interface', 'list', { vpsId, limit: 100 }] });
      qc.invalidateQueries({ queryKey: ['ip_address', 'list', { vpsId, limit: 250 }] });

      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: 'action.vps.network.interface_update.label',
          objectLabel,
          object: vpsRef,
        });
      }

      refetchChains();
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => {
      chrome.releaseLocalLock(vpsRef);
    },
  });

  const parseLimit = (raw: string, which: 'tx' | 'rx'): number | null => {
    const v = raw.trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      setEditError(which === 'tx' ? t('vps.network.edit.validation.max_tx') : t('vps.network.edit.validation.max_rx'));
      return null;
    }
    return Math.round(n * 1024 * 1024);
  };

  const editDirty = useMemo(() => {
    if (!editNetif) return false;
    const nameDirty = (editName ?? '').trim() !== String(editNetif.name ?? '');

    if (!canAdmin) return nameDirty;

    const enableDirty = canonicalBool(editEnable, true) !== canonicalBool(editNetif.enable, true);

    const txDirty = (() => {
      const raw = editMaxTx.trim();
      const curr = typeof editNetif.max_tx === 'number' ? String(Math.round(editNetif.max_tx / 1024 / 1024)) : '';
      return raw !== curr;
    })();

    const rxDirty = (() => {
      const raw = editMaxRx.trim();
      const curr = typeof editNetif.max_rx === 'number' ? String(Math.round(editNetif.max_rx / 1024 / 1024)) : '';
      return raw !== curr;
    })();

    return nameDirty || enableDirty || txDirty || rxDirty;
  }, [canAdmin, editEnable, editMaxRx, editMaxTx, editName, editNetif]);

  const saveNetif = async () => {
    if (!canMutateVps) return;
    if (!editNetif) return;

    const params: Record<string, unknown> = {
      name: editName.trim(),
    };

    if (canAdmin) {
      params['enable'] = editEnable;

      const tx = parseLimit(editMaxTx, 'tx');
      if (editMaxTx.trim() && tx === null) return;
      if (tx !== null) params['max_tx'] = tx;

      const rx = parseLimit(editMaxRx, 'rx');
      if (editMaxRx.trim() && rx === null) return;
      if (rx !== null) params['max_rx'] = rx;
    }

    setEditError(null);

    try {
      await updateNetifM.mutateAsync({ id: editNetif.id, params });
      setEditNetif(null);
    } catch (e: any) {
      setEditError(String(e?.message ?? e));
    }
  };

  // VPS-level enable_network toggle (admin only)
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [netToggleError, setNetToggleError] = useState<string | null>(null);

  const toggleNetM = useMutation({
    mutationFn: async (payload: { enable: boolean; reason?: string }) => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });

      const params: Record<string, unknown> = { enable_network: payload.enable };
      if (!payload.enable && String(payload.reason ?? '').trim()) {
        params['change_reason'] = String(payload.reason ?? '').trim();
      }

      return updateVps(vpsId, params);
    },
    onMutate: () => {
      chrome.acquireLocalLock(vpsRef);
    },
    onSuccess: (r, vars) => {
      setNetToggleError(null);
      refetch();
      qc.invalidateQueries({ queryKey: ['network_interface', 'list', { vpsId, limit: 100 }] });
      qc.invalidateQueries({ queryKey: ['ip_address', 'list', { vpsId, limit: 250 }] });

      const asId = getMetaActionStateId(r.meta);
      if (asId !== undefined) {
        chrome.trackActionState(asId, {
          actionLabelKey: vars.enable ? 'action.vps.network.enable.label' : 'action.vps.network.disable.label',
          objectLabel,
          object: vpsRef,
        });
      }

      refetchChains();
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
      setNetToggleError(String(e?.message ?? e));
    },
    onSettled: () => {
      chrome.releaseLocalLock(vpsRef);
    },
  });

  const refreshNetworkData = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['host_ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['ip_address'] }),
      qc.invalidateQueries({ queryKey: ['ip_addresses'] }),
      qc.invalidateQueries({ queryKey: ['network_interface', 'list', { vpsId, limit: 100 }] }),
      qc.invalidateQueries({ queryKey: ['ip_address', 'list', { vpsId, limit: 250 }] }),
      hostAddrsQ.refetch(),
      ipsQ.refetch(),
      netifsQ.refetch(),
    ]);
  };

  const trackNetworkAction = (meta: unknown, labelKey: string) => {
    const asId = getMetaActionStateId(meta);
    if (asId !== undefined) {
      chrome.trackActionState(asId, {
        actionLabelKey: labelKey,
        objectLabel,
        object: vpsRef,
      });
    }
    refetchChains();
  };

  const updatePtrM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!ptrEditor) throw new Error(t('vps.network.host_addresses.validation.missing'));
      const validation = validatePtrValue(ptrValue);
      if (!validation.ok) {
        throw new Error(t('vps.network.host_addresses.ptr.validation.invalid', { value: validation.invalidValue ?? ptrValue.trim() }));
      }
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return updateHostIpAddress(ptrEditor.id, { reverse_record_value: ptrValue.trim() });
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setPtrEditor(null);
      setPtrValue('');
      trackNetworkAction(res.meta, 'action.vps.network.ptr_update.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.host_addresses.toast.ptr_saved') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const freeHostM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!freeHost) throw new Error(t('vps.network.host_addresses.validation.missing'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return freeHostIpAddress(freeHost.id);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setFreeHost(null);
      trackNetworkAction(res.meta, 'action.vps.network.host_free.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.host_addresses.toast.freed') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const assignHostM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!assignHost) throw new Error(t('vps.network.host_addresses.validation.missing'));
      const networkInterface = Number(assignHostInterface);
      if (!Number.isInteger(networkInterface) || networkInterface <= 0) {
        throw new Error(t('vps.network.host_addresses.assign.validation.interface'));
      }
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return assignHostIpAddress(assignHost.id, { network_interface: networkInterface });
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setAssignHost(null);
      setAssignHostInterface('');
      trackNetworkAction(res.meta, 'action.vps.network.host_assign.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.host_addresses.toast.assigned') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const deleteHostM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!deleteHost) throw new Error(t('vps.network.host_addresses.validation.missing'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return deleteHostIpAddress(deleteHost.id);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async () => {
      setDeleteHost(null);
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.host_addresses.toast.deleted') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const freeRouteM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!freeRouteIp) throw new Error(t('vps.network.ip_addresses.validation.missing'));
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return freeIpAddressRoute(freeRouteIp.id);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setFreeRouteIp(null);
      trackNetworkAction(res.meta, 'action.vps.network.route_free.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.ip_addresses.toast.route_freed') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const assignRouteM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!assignRouteIp) throw new Error(t('vps.network.ip_addresses.validation.missing'));
      const networkInterface = Number(assignRouteInterface);
      if (!Number.isInteger(networkInterface) || networkInterface <= 0) {
        throw new Error(t('vps.network.ip_addresses.assign.validation.interface'));
      }
      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return assignIpAddressRoute(assignRouteIp.id, { network_interface: networkInterface });
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setAssignRouteIp(null);
      setAssignRouteInterface('');
      trackNetworkAction(res.meta, 'action.vps.network.route_assign.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.ip_addresses.toast.route_assigned') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const updateOwnerM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      if (!ownerIp) throw new Error(t('vps.network.ip_addresses.validation.missing'));
      const user = ownerUser.trim() ? parsePositiveId(ownerUser) : null;
      if (ownerUser.trim() && !user) throw new Error(t('vps.network.ip_addresses.owner.validation.user'));

      const params: Record<string, unknown> = { user };
      if (user) {
        const environment = parsePositiveId(ownerEnvironment);
        if (!environment) throw new Error(t('vps.network.ip_addresses.owner.validation.environment'));
        params['environment'] = environment;
      }

      await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
      return updateIpAddress(ownerIp.id, params);
    },
    onMutate: () => chrome.acquireLocalLock(vpsRef),
    onSuccess: async (res) => {
      setOwnerIp(null);
      setOwnerUser('');
      setOwnerEnvironment('');
      trackNetworkAction(res.meta, 'action.vps.network.route_owner_update.label');
      await refreshNetworkData();
      pushToast({ variant: 'ok', title: t('vps.network.ip_addresses.owner.toast.saved') });
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => chrome.releaseLocalLock(vpsRef),
  });

  const busyLocal =
    busyLocalLock ||
    updateNetifM.isPending ||
    toggleNetM.isPending ||
    updatePtrM.isPending ||
    assignHostM.isPending ||
    freeHostM.isPending ||
    deleteHostM.isPending ||
    freeRouteM.isPending ||
    assignRouteM.isPending ||
    updateOwnerM.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });

  const netifs = netifsQ.data ?? [];
  const ips = ipsQ.data ?? [];
  const hostRows = hostAddrsQ.data ?? [];
  const unassignedIps = ipByNetif.get(-1) ?? [];
  const networkSummary = useMemo(() => buildNetworkRouteSummary({ netifs, ips, hostAddresses: hostRows }), [hostRows, ips, netifs]);
  const ptrValidation = useMemo(() => validatePtrValue(ptrValue), [ptrValue]);
  const networkActionError =
    updatePtrM.error ??
    assignHostM.error ??
    freeHostM.error ??
    deleteHostM.error ??
    freeRouteM.error ??
    assignRouteM.error ??
    updateOwnerM.error;
  const networkActionErrorMessage = networkActionError ? errorMessage(networkActionError) : null;

  return (
    <div data-testid="vps.network.page" className="space-y-4">
      {!canMutateVps ? (
        <Alert title={t('gate.blocked.permission.title')} variant="warn">
          <div data-testid="vps.network.read_only">{t('gate.blocked.permission.body')}</div>
        </Alert>
      ) : null}

      <VpsNetworkOverviewCard
        netEnabled={netEnabled}
        gate={gate}
        summary={networkSummary}
        accountingLoading={acctQ.isLoading}
        accountingError={acctQ.isError}
        bytesIn={acctTotals.bytesIn}
        bytesOut={acctTotals.bytesOut}
        year={acctMonth.year}
        month={acctMonth.month}
        onRefresh={() => {
          void acctQ.refetch();
          void netifsQ.refetch();
          void ipsQ.refetch();
          void hostAddrsQ.refetch();
        }}
        onOpenTasks={chrome.openTasks}
      />

      <VpsNetworkInterfacesCard
        canAdmin={canAdmin}
        canMutate={canMutateVps}
        isLoading={netifsQ.isLoading}
        errorMessage={netifsQ.isError ? errorMessage(netifsQ.error) : null}
        netifs={netifs}
        ipByNetif={ipByNetif}
        onRefresh={() => void netifsQ.refetch()}
        onEdit={openEdit}
      />

      <VpsNetworkAddressesSection
        canAdmin={canAdmin}
        canMutate={canMutateVps}
        adminBasePath={adminBasePath}
        netEnabled={netEnabled}
        gate={gate}
        netToggleError={netToggleError}
        routesLoading={ipsQ.isLoading}
        routesErrorMessage={ipsQ.isError ? errorMessage(ipsQ.error) : null}
        hostsLoading={hostAddrsQ.isLoading}
        hostsErrorMessage={hostAddrsQ.isError ? errorMessage(hostAddrsQ.error) : null}
        networkActionErrorMessage={networkActionErrorMessage}
        netifs={netifs}
        ipByNetif={ipByNetif}
        unassignedIps={unassignedIps}
        hostRows={hostRows}
        freeRoutePending={freeRouteM.isPending}
        updatePtrPending={updatePtrM.isPending}
        assignHostPending={assignHostM.isPending}
        freeHostPending={freeHostM.isPending}
        deleteHostPending={deleteHostM.isPending}
        onAddRoute={() => setAddIpOpen(true)}
        onDisableNetwork={() => {
          setNetToggleError(null);
          setConfirmDisableOpen(true);
        }}
        onEnableNetwork={() => {
          setNetToggleError(null);
          setConfirmEnableOpen(true);
        }}
        onRefreshRoutes={() => void ipsQ.refetch()}
        onRefreshHosts={() => void hostAddrsQ.refetch()}
        onEditOwner={(ip) => {
          setOwnerIp(ip);
          setOwnerUser('');
          setOwnerEnvironment('');
        }}
        onFreeRoute={setFreeRouteIp}
        onAssignRoute={(ip) => {
          setAssignRouteIp(ip);
          setAssignRouteInterface('');
        }}
        onEditPtr={(row) => {
          setPtrEditor(row);
          setPtrValue(String(row.reverse_record_value ?? ''));
        }}
        onAssignHost={(row) => {
          setAssignHost(row);
          const networkInterfaceId = idFromResourceRef(row.ip_address?.network_interface);
          setAssignHostInterface(networkInterfaceId ? String(networkInterfaceId) : '');
        }}
        onFreeHost={setFreeHost}
        onDeleteHost={setDeleteHost}
      />

      <AssignIpAddressModal
        open={addIpOpen}
        fixedVps={vps}
        gate={gate}
        testId="vps.network.ip_addresses.add_modal"
        onClose={() => setAddIpOpen(false)}
        onAssigned={() => {
          void refreshNetworkData();
        }}
      />

      <Modal
        open={!!editNetif}
        testId="vps.network.edit"
        title={
          editNetif
            ? t('vps.network.edit.title', { name: String(editNetif.name ?? editNetif.type ?? editNetif.id) })
            : t('vps.network.edit.title_fallback')
        }
        onClose={() => setEditNetif(null)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              testId="vps.network.edit.cancel"
              onClick={() => setEditNetif(null)}
              disabled={updateNetifM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <ActionButton
              testId="vps.network.edit.save"
              disabled={!editDirty || !gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              loading={updateNetifM.isPending}
              onClick={() => void saveNetif()}
            >
              {t('common.save')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {editError ? <Alert title={t('vps.network.edit.error.title')} variant="danger">{editError}</Alert> : null}

          <div>
            <div className="text-xs font-medium text-muted">{t('vps.network.interfaces.field.name')}</div>
            <div className="mt-1">
              <Input
                testId="vps.network.edit.name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('vps.network.interfaces.name_placeholder')}
                autoComplete="off"
              />
            </div>
          </div>

          {canAdmin ? (
            <>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    data-testid="vps.network.edit.enabled"
                    type="checkbox"
                    checked={editEnable}
                    onChange={(e) => setEditEnable(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg"
                  />
                  <span>{t('vps.network.interfaces.field.enabled')}</span>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-muted">{t('vps.network.interfaces.field.max_tx')}</div>
                  <div className="mt-1">
                    <Input
                      testId="vps.network.edit.max_tx"
                      value={editMaxTx}
                      onChange={(e) => setEditMaxTx(e.target.value)}
                      placeholder="1000"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted">{t('vps.network.interfaces.field.max_rx')}</div>
                  <div className="mt-1">
                    <Input
                      testId="vps.network.edit.max_rx"
                      value={editMaxRx}
                      onChange={(e) => setEditMaxRx(e.target.value)}
                      placeholder="1000"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-muted">
                <div>{t('vps.network.edit.basic_limits_note')}</div>
                <div>{t('vps.network.edit.advanced_limits_note')}</div>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted">{t('vps.network.edit.user_mode_hint')}</div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!ptrEditor}
        testId="vps.network.host_addresses.ptr"
        title={ptrEditor ? t('vps.network.host_addresses.ptr.title_for_ip', { address: hostAddr(ptrEditor) }) : t('vps.network.host_addresses.ptr.title')}
        onClose={() => {
          if (updatePtrM.isPending) return;
          setPtrEditor(null);
          setPtrValue('');
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              testId="vps.network.host_addresses.ptr.cancel"
              onClick={() => {
                setPtrEditor(null);
                setPtrValue('');
              }}
              disabled={updatePtrM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <ActionButton
              testId="vps.network.host_addresses.ptr.submit"
              loading={updatePtrM.isPending}
              disabled={!ptrValidation.ok || !gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              onClick={() => updatePtrM.mutate()}
            >
              {t('common.save')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-muted">{t('vps.network.host_addresses.ptr.help')}</div>
          {ptrValue.trim() && !ptrValidation.ok ? (
            <Alert title={t('vps.network.host_addresses.ptr.validation.title')} variant="warn">
              {t('vps.network.host_addresses.ptr.validation.invalid', { value: ptrValidation.invalidValue ?? ptrValue.trim() })}
            </Alert>
          ) : null}
          <Input
            testId="vps.network.host_addresses.ptr.value"
            value={ptrValue}
            onChange={(e) => setPtrValue(e.target.value)}
            placeholder="host.example.org."
            autoComplete="off"
            disabled={updatePtrM.isPending}
          />
        </div>
      </Modal>

      <ConfirmDialog
        testId="vps.network.host_addresses.free_confirm"
        open={!!freeHost}
        title={t('vps.network.host_addresses.free.title')}
        description={freeHost ? t('vps.network.host_addresses.free.description', { address: hostAddr(freeHost) }) : ''}
        danger
        confirmLabel={t('vps.network.host_addresses.action.free')}
        confirmLoading={freeHostM.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setFreeHost(null)}
        onConfirm={() => freeHostM.mutate()}
      />

      <Modal
        open={!!assignHost}
        testId="vps.network.host_addresses.assign"
        title={
          assignHost
            ? t('vps.network.host_addresses.assign.title_for_ip', { address: hostAddr(assignHost) })
            : t('vps.network.host_addresses.assign.title')
        }
        onClose={() => {
          if (assignHostM.isPending) return;
          setAssignHost(null);
          setAssignHostInterface('');
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              testId="vps.network.host_addresses.assign.cancel"
              onClick={() => {
                setAssignHost(null);
                setAssignHostInterface('');
              }}
              disabled={assignHostM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <ActionButton
              testId="vps.network.host_addresses.assign.submit"
              loading={assignHostM.isPending}
              disabled={!assignHostInterface || !gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              onClick={() => assignHostM.mutate()}
            >
              {t('vps.network.host_addresses.action.assign')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('vps.network.ip_addresses.assign.interface')}</div>
            <Select
              testId="vps.network.host_addresses.assign.interface"
              value={assignHostInterface}
              onChange={(e) => setAssignHostInterface(e.target.value)}
              options={[
                { value: '', label: t('vps.network.ip_addresses.assign.interface.placeholder') },
                ...netifs.map((ni) => ({
                  value: String(ni.id),
                  label: `${ni.name ?? `#${ni.id}`} (#${ni.id})`,
                })),
              ]}
            />
          </label>
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
            {assignHost
              ? t('vps.network.host_addresses.assign.preview', {
                  address: hostAddr(assignHost),
                  interface: netifs.find((ni) => String(ni.id) === assignHostInterface)?.name ?? (assignHostInterface ? `#${assignHostInterface}` : '—'),
                })
              : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!ownerIp}
        testId="vps.network.ip_addresses.owner"
        title={ownerIp ? t('vps.network.ip_addresses.owner.title_for_ip', { address: ipAddressLabel(ownerIp) }) : t('vps.network.ip_addresses.owner.title')}
        onClose={() => {
          if (updateOwnerM.isPending) return;
          setOwnerIp(null);
          setOwnerUser('');
          setOwnerEnvironment('');
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              testId="vps.network.ip_addresses.owner.cancel"
              onClick={() => {
                setOwnerIp(null);
                setOwnerUser('');
                setOwnerEnvironment('');
              }}
              disabled={updateOwnerM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <ActionButton
              testId="vps.network.ip_addresses.owner.submit"
              loading={updateOwnerM.isPending}
              disabled={!canAdmin || (!ownerUser.trim() && !idFromResourceRef(ownerIp?.user)) || !gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              onClick={() => updateOwnerM.mutate()}
            >
              {ownerUser.trim() ? t('vps.network.ip_addresses.owner.save') : t('vps.network.ip_addresses.owner.clear')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted">{t('vps.network.ip_addresses.owner.current_user')}</div>
              <div className="font-medium">{labelFromResourceRef(ownerIp?.user)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('vps.network.ip_addresses.owner.family')}</div>
              <div className="font-medium">{ownerIp ? ipFamilyLabel(ownerIp) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t('vps.network.ip_addresses.owner.location')}</div>
              <div className="font-medium">{ownerIp ? ipLocationLabel(ownerIp) : '—'}</div>
            </div>
          </div>
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('vps.network.ip_addresses.owner.user')}</div>
            <UserLookupInput
              testId="vps.network.ip_addresses.owner.user"
              value={ownerUser}
              onChange={setOwnerUser}
              placeholder={idFromResourceRef(ownerIp?.user) ? `#${idFromResourceRef(ownerIp?.user)}` : t('vps.network.ip_addresses.owner.unassigned')}
              allowRawId
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('vps.network.ip_addresses.owner.environment')}</div>
            <Select
              testId="vps.network.ip_addresses.owner.environment"
              value={ownerEnvironment}
              onChange={(e) => setOwnerEnvironment(e.target.value)}
              disabled={environmentsQ.isLoading || !ownerUser.trim()}
              options={[
                { value: '', label: t('vps.network.ip_addresses.owner.environment.placeholder') },
                ...(environmentsQ.data ?? []).map((env: any) => ({
                  value: String(env.id),
                  label: String(env.label ?? env.name ?? `#${env.id}`),
                })),
              ]}
            />
          </label>
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
            {ownerUser.trim()
              ? t('vps.network.ip_addresses.owner.preview_set', { user: ownerUser.trim(), address: ownerIp ? ipAddressLabel(ownerIp) : '—' })
              : t('vps.network.ip_addresses.owner.preview_clear', { address: ownerIp ? ipAddressLabel(ownerIp) : '—' })}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        testId="vps.network.host_addresses.delete_confirm"
        open={!!deleteHost}
        title={t('vps.network.host_addresses.delete.title')}
        description={deleteHost ? t('vps.network.host_addresses.delete.description', { address: hostAddr(deleteHost) }) : ''}
        danger
        confirmLabel={t('common.delete')}
        confirmLoading={deleteHostM.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setDeleteHost(null)}
        onConfirm={() => deleteHostM.mutate()}
      />

      <ConfirmDialog
        testId="vps.network.ip_addresses.free_route_confirm"
        open={!!freeRouteIp}
        title={t('vps.network.ip_addresses.free_route.title')}
        description={
          freeRouteIp
            ? t('vps.network.ip_addresses.free_route.description', {
                address: ipAddressLabel(freeRouteIp),
              })
            : ''
        }
        danger
        confirmLabel={t('vps.network.ip_addresses.action.free_route')}
        confirmLoading={freeRouteM.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setFreeRouteIp(null)}
        onConfirm={() => freeRouteM.mutate()}
      />

      <Modal
        open={!!assignRouteIp}
        testId="vps.network.ip_addresses.assign_route"
        title={
          assignRouteIp
            ? t('vps.network.ip_addresses.assign.title_for_ip', {
                address: ipAddressLabel(assignRouteIp),
              })
            : t('vps.network.ip_addresses.assign.title')
        }
        onClose={() => {
          if (assignRouteM.isPending) return;
          setAssignRouteIp(null);
          setAssignRouteInterface('');
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              testId="vps.network.ip_addresses.assign_route.cancel"
              onClick={() => {
                setAssignRouteIp(null);
                setAssignRouteInterface('');
              }}
              disabled={assignRouteM.isPending}
            >
              {t('common.cancel')}
            </Button>
            <ActionButton
              testId="vps.network.ip_addresses.assign_route.submit"
              loading={assignRouteM.isPending}
              disabled={!assignRouteInterface || !gate.allowed}
              disabledReason={!gate.allowed ? gate.reason : undefined}
              onClick={() => assignRouteM.mutate()}
            >
              {t('vps.network.ip_addresses.action.assign_route')}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium">{t('vps.network.ip_addresses.assign.interface')}</div>
            <Select
              testId="vps.network.ip_addresses.assign_route.interface"
              value={assignRouteInterface}
              onChange={(e) => setAssignRouteInterface(e.target.value)}
              options={[
                { value: '', label: t('vps.network.ip_addresses.assign.interface.placeholder') },
                ...netifs.map((ni) => ({
                  value: String(ni.id),
                  label: `${ni.name ?? `#${ni.id}`} (#${ni.id})`,
                })),
              ]}
            />
          </label>
          <div className="text-xs text-muted">{t('vps.network.ip_addresses.assign.help')}</div>
        </div>
      </Modal>

      <ConfirmDialog
        testId="vps.network.disable_confirm"
        open={confirmDisableOpen}
        title={t('vps.network.disable_dialog.title')}
        description={t('vps.network.disable_dialog.description')}
        danger
        confirmLabel={t('vps.network.disable_button')}
        confirmLoading={toggleNetM.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setConfirmDisableOpen(false)}
        onConfirm={async () => {
          try {
            await toggleNetM.mutateAsync({ enable: false, reason: changeReason });
            setConfirmDisableOpen(false);
            setChangeReason('');
          } catch {
            // errors are shown via netToggleError
          }
        }}
      >
        <div>
          <div className="text-xs font-medium text-muted">{t('vps.network.change_reason.label')}</div>
          <div className="mt-1">
            <Input
              testId="vps.network.disable.reason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder={t('vps.network.change_reason.placeholder')}
              autoComplete="off"
            />
          </div>
          <div className="mt-1 text-xs text-muted">{t('vps.network.change_reason.help')}</div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        testId="vps.network.enable_confirm"
        open={confirmEnableOpen}
        title={t('vps.network.enable_dialog.title')}
        description={t('vps.network.enable_dialog.description')}
        confirmLabel={t('vps.network.enable_button')}
        confirmLoading={toggleNetM.isPending}
        confirmDisabled={!gate.allowed}
        onCancel={() => setConfirmEnableOpen(false)}
        onConfirm={async () => {
          try {
            await toggleNetM.mutateAsync({ enable: true });
            setConfirmEnableOpen(false);
          } catch {
            // errors are shown via netToggleError
          }
        }}
      />
    </div>
  );
}
