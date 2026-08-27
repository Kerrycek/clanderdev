import React, { createContext, useContext } from 'react';

import { type IpAddress } from '../../../lib/api/ipAddresses';
import { type TransactionChain } from '../../../lib/api/transactions';
import { type Vps } from '../../../lib/api/vps';
import type { ObjectRef } from '../../../lib/objectRef';

export interface VpsContextValue {
  vps: Vps;
  /** Whether the current route and authenticated role may mutate this VPS. */
  canMutateVps: boolean;
  refetch: () => void;
  refetchChains: () => void;

  vpsRef: ObjectRef;
  busyTransaction: boolean;
  /** True when chain refresh has been failing long enough that lock state is degraded. */
  chainsStale: boolean;
  busyLocalLock: boolean;
  activeChainIds: number[];
  transactionChains: TransactionChain[];
  transactionChainsLoading: boolean;
  transactionChainsError: boolean;
  ipAddresses: IpAddress[];
  ipAddressesLoading: boolean;
  ipAddressesError: boolean;
  sshCommand?: string | null;
}

const VpsContext = createContext<VpsContextValue | null>(null);

export function VpsContextProvider(props: { value: VpsContextValue; children: React.ReactNode }) {
  return <VpsContext.Provider value={props.value}>{props.children}</VpsContext.Provider>;
}

export function useVpsContext(): VpsContextValue {
  const ctx = useContext(VpsContext);
  if (!ctx) throw new Error('useVpsContext must be used within VpsContextProvider');
  return ctx;
}

// Backwards-compatible alias used by pages/components.
export const useVps = useVpsContext;
