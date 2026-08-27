import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../app/appMode';
import { useChrome } from '../../../components/layout/ChromeContext';
import { LockStateStaleAlert } from '../../../components/ui/LockStateStaleAlert';
import type { Dataset } from '../../../lib/api/datasets';
import { fetchTransactionChains } from '../../../lib/api/transactions';
import { deriveChainLockState } from '../../../lib/lockState';
import { objectRef } from '../../../lib/objectRef';
import { useTierAIntervalMs } from '../../../lib/refreshTiers';
import { useNetworkStatus } from '../../../lib/useNetworkStatus';
import { DatasetContextProvider } from '../datasets/DatasetContext';

export interface BackupCenterDatasetWorkspaceProps {
  dataset: Dataset;
  refetch: () => void | Promise<unknown>;
  children: React.ReactNode;
}

function isResource(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Reuses an already-scoped Backup Center dataset as a dataset-detail context.
 *
 * The provider deliberately does not call datasets#show. It only loads the
 * selected dataset's recent transaction chains so embedded snapshot/plan
 * controls get the same lock semantics as the regular dataset detail.
 */
export function BackupCenterDatasetWorkspace(props: BackupCenterDatasetWorkspaceProps) {
  const { basePath } = useAppMode();
  const chrome = useChrome();
  const online = useNetworkStatus();
  const tierARefetchMs = useTierAIntervalMs();
  const datasetId = Number(props.dataset.id);

  const datasetRef = React.useMemo(() => objectRef('Dataset', datasetId), [datasetId]);
  const section = isResource(props.dataset.vps) ? 'datasets' : 'nas';
  const listPath = `${basePath}/${section}`;
  const detailPath = `${listPath}/${datasetId}`;
  const busyLocalLock = chrome.isLocallyLocked(datasetRef);

  const chainsQ = useQuery({
    queryKey: ['transaction_chain', 'list', { className: 'Dataset', rowId: datasetId, limit: 10 }],
    queryFn: async () => (
      await fetchTransactionChains({ className: 'Dataset', rowId: datasetId, limit: 10 })
    ).data,
    refetchInterval: tierARefetchMs,
  });

  const chains = chainsQ.data ?? [];
  const chainLock = deriveChainLockState({
    chains,
    updatedAt: chainsQ.dataUpdatedAt,
    unreliable: !online || chainsQ.isError,
  });

  return (
    <DatasetContextProvider
      value={{
        dataset: props.dataset,
        refetch: () => void props.refetch(),
        section,
        listPath,
        detailPath,
        datasetRef,
        busyLocalLock,
        chains,
        chainsLoading: chainsQ.isLoading,
        chainsError: chainsQ.isError ? chainsQ.error : null,
        busyTransaction: chainLock.busy,
        chainsStale: chainLock.stale,
        activeChainIds: chainLock.activeChainIds,
        refetchChains: () => void chainsQ.refetch(),
      }}
    >
      <div className="space-y-4">
        {chainsQ.isError || chainLock.stale ? (
          <LockStateStaleAlert
            chainIds={chainLock.activeChainIds}
            error={chainsQ.error}
            onRetry={() => void chainsQ.refetch()}
            testId="backups.workspace.lock_state_stale"
          />
        ) : null}
        {props.children}
      </div>
    </DatasetContextProvider>
  );
}
