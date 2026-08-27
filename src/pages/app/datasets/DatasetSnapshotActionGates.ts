import type { UserRole } from '../../../lib/roles';
import type { Dataset } from '../../../lib/api/datasets';
import { gateDatasetAction } from '../../../lib/gates/dataset';

export function datasetSnapshotActionGates(args: {
  dataset: Dataset;
  role: UserRole;
  userId?: number;
  busyLocal: boolean;
  busyTransaction: boolean;
  lockStateUnknown: boolean;
}) {
  const ownerId =
    typeof args.dataset.user === 'object' &&
    args.dataset.user !== null &&
    typeof args.dataset.user.id === 'number'
      ? args.dataset.user.id
      : undefined;
  const ownerPermission =
    args.role === 'admin' || (typeof args.userId === 'number' && ownerId === args.userId);
  const context = {
    dataset: args.dataset,
    busyLocal: args.busyLocal,
    busyTransaction: args.busyTransaction || args.lockStateUnknown,
    role: args.role,
  };

  return {
    createGate: gateDatasetAction('snapshot.create', context),
    downloadGate: gateDatasetAction('download.create', context),
    rollbackGate: gateDatasetAction('snapshot.rollback', {
      ...context,
      permission: ownerPermission,
    }),
    deleteGate: gateDatasetAction('snapshot.delete', {
      ...context,
      permission: ownerPermission,
    }),
  };
}
