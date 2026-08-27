import React from 'react';

import { useAppMode } from '../../../app/appMode';
import { LifecyclePanel } from '../../../components/lifetimes/LifecyclePanel';
import { useVps } from './VpsContext';
import { VpsOverviewAdminOperationsCard } from './VpsOverviewAdminOperationsCard';
import { VpsOverviewMetricsCard } from './VpsOverviewMetricsCard';
import {
  VpsAccessCard,
  VpsActivityCard,
  VpsHealthBanner,
  VpsNetworkCard,
  VpsResourcesCard,
  VpsStorageBackupsCard,
} from './VpsControlCenterCards';
import {
  OverviewAdminContextCard,
  OverviewDiagnosticsCard,
} from './VpsOverviewPrimitives';

export function VpsOverviewPage() {
  const {
    vps,
    refetch,
    busyTransaction,
    busyLocalLock,
    chainsStale,
    activeChainIds,
    ipAddresses,
    ipAddressesLoading,
    ipAddressesError,
    sshCommand,
    transactionChains,
    transactionChainsLoading,
    transactionChainsError,
  } = useVps();
  const { basePath, mode } = useAppMode();
  const isAdminView = mode === 'admin';

  return (
    <div className="grid gap-4 lg:grid-cols-12" data-testid="vps.overview.control_center">
      <div className="lg:col-span-12">
        <VpsHealthBanner
          vps={vps}
          busy={busyTransaction || busyLocalLock}
          stale={chainsStale}
          sshCommand={sshCommand}
          ipAddressesLoading={ipAddressesLoading}
          ipAddressesError={ipAddressesError}
        />
      </div>

      <VpsResourcesCard vps={vps} basePath={basePath} />

      <VpsAccessCard
        vps={vps}
        basePath={basePath}
        sshCommand={sshCommand}
      />

      <VpsNetworkCard
        vps={vps}
        basePath={basePath}
        ipAddresses={ipAddresses}
        loading={ipAddressesLoading}
        error={ipAddressesError}
      />

      <VpsStorageBackupsCard vps={vps} basePath={basePath} />

      <VpsOverviewMetricsCard vps={vps} />

      <VpsActivityCard
        vps={vps}
        basePath={basePath}
        chains={transactionChains}
        loading={transactionChainsLoading}
        error={transactionChainsError}
      />

      {!isAdminView ? <OverviewDiagnosticsCard vps={vps} basePath={basePath} /> : null}

      {isAdminView ? (
        <VpsOverviewAdminOperationsCard
          vps={vps}
          basePath={basePath}
          busyTransaction={busyTransaction}
          chainsStale={chainsStale}
          activeChainIds={activeChainIds}
          ipAddresses={ipAddresses}
          ipAddressesLoading={ipAddressesLoading}
          ipAddressesError={ipAddressesError}
        />
      ) : null}

      <div className="lg:col-span-12">
        <LifecyclePanel
          kind="vps"
          id={vps.id}
          objectLabel={vps.hostname}
          objectState={vps.object_state}
          expirationDate={vps.expiration_date}
          remindAfterDate={vps.remind_after_date}
          onUpdated={refetch}
          testId="vps.overview.lifecycle"
        />
      </div>

      {isAdminView ? <OverviewAdminContextCard vps={vps} basePath={basePath} /> : null}
    </div>
  );
}
