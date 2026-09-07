import React, { createContext, useContext } from 'react';

import type { Dataset } from '../../../lib/api/datasets';
import { type TransactionChain } from '../../../lib/api/transactions';
import type { ObjectRef } from '../../../lib/objectRef';

export interface DatasetContextValue {
  dataset: Dataset;
  refetch: () => Promise<unknown>;

  section: 'datasets' | 'nas';
  listPath: string;
  detailPath: string;

  datasetRef: ObjectRef;

  /** True when this tab has a local lock for the dataset (i.e. we started an action,
   * but the backend chain state may not be visible yet). */
  busyLocalLock: boolean;

  /** Latest related transaction chains loaded by DatasetLayout (limit ~10). */
  chains: TransactionChain[];
  chainsLoading: boolean;
  chainsError: unknown | null;

  /** True when any related transaction chain is still active (object is locked/busy). */
  busyTransaction: boolean;
  /** True when chain refresh has been failing long enough that lock state is degraded. */
  chainsStale: boolean;
  activeChainIds: number[];

  refetchChains: () => Promise<unknown>;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetContextProvider(props: { value: DatasetContextValue; children: React.ReactNode }) {
  return <DatasetContext.Provider value={props.value}>{props.children}</DatasetContext.Provider>;
}

export function useDatasetContext(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) {
    throw new Error('useDatasetContext must be used within DatasetContextProvider');
  }
  return ctx;
}
