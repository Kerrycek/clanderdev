import type { ActionState } from '../../../lib/api/actionStates';
import type { TrackedActionState } from '../../../components/layout/ChromeContext';

interface PendingVpsCreateNavigationState {
  pendingVpsCreate?: {
    vpsId?: unknown;
    actionStateId?: unknown;
  };
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function pendingVpsCreateNavigationState(vpsId: number, actionStateId: number) {
  return {
    pendingVpsCreate: {
      vpsId,
      actionStateId,
    },
  } satisfies PendingVpsCreateNavigationState;
}

export function resolvePendingVpsCreateActionStateId(
  locationState: unknown,
  trackedActionStates: TrackedActionState[],
  vpsId: number,
): number | undefined {
  if (!Number.isSafeInteger(vpsId) || vpsId <= 0) return undefined;

  const navigation = locationState && typeof locationState === 'object' && !Array.isArray(locationState)
    ? (locationState as PendingVpsCreateNavigationState).pendingVpsCreate
    : undefined;
  if (positiveInteger(navigation?.vpsId) === vpsId) {
    const actionStateId = positiveInteger(navigation?.actionStateId);
    if (actionStateId !== undefined) return actionStateId;
  }

  return trackedActionStates
    .filter((tracked) => (
      tracked.actionLabelKey === 'action.vps.create.label'
      && tracked.object?.kind === 'Vps'
      && tracked.object.id === vpsId
      && positiveInteger(tracked.id) !== undefined
    ))
    .sort((left, right) => Number(right.addedAt) - Number(left.addedAt))[0]?.id;
}

export function shouldDeferVpsDetailQuery(
  actionStateId: number | undefined,
  actionState: ActionState | undefined,
  actionStateLoadFailed: boolean,
): boolean {
  if (actionStateId === undefined || actionStateLoadFailed) return false;
  return actionState?.finished !== true;
}
