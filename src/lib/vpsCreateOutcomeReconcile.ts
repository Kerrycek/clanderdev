import { fetchVps, type Vps } from './api/vps';
import type { VpsCreateOutcomeMarker } from './vpsCreateOutcomeGuard';

export type VpsCreateReconcileResult =
  | { status: 'matched'; vps: Vps }
  | { status: 'none' | 'multiple' | 'mismatch' | 'invalid' };

function matchesMarker(vps: Vps, marker: VpsCreateOutcomeMarker): boolean {
  const identity = marker.identity;
  if (!identity || vps.hostname !== identity.hostname) return false;
  if (identity.ownerId && Number(vps.user?.id) !== identity.ownerId) return false;
  if (identity.locationId && Number(vps.node?.location?.id) !== identity.locationId) return false;
  return !marker.candidateVpsId || vps.id === marker.candidateVpsId;
}

export async function reconcileVpsCreateOutcome(
  marker: VpsCreateOutcomeMarker
): Promise<VpsCreateReconcileResult> {
  if (!marker.identity?.hostname) return { status: 'invalid' };
  // Hostname is not unique in the API. A list lookup could match an older VPS
  // and falsely authorize a duplicate retry, so only the exact id returned by
  // the accepted response can be reconciled automatically.
  if (!marker.candidateVpsId) return { status: 'none' };
  const candidate = (await fetchVps(marker.candidateVpsId, { includes: 'user,node__location' })).data;
  return matchesMarker(candidate, marker)
    ? { status: 'matched', vps: candidate }
    : { status: 'mismatch' };
}
