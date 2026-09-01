import type { ComponentProps } from 'react';

import { Button } from '../../../../components/ui/Button';
import { canManageClusterMaintenance, MaintenanceControl } from './MaintenanceControl';

type MaintenanceProps = ComponentProps<typeof MaintenanceControl>;

export function ClusterResourceActions(props: {
  role: string;
  maintenance: MaintenanceProps;
  edit: { label: string; testId: string; onClick: () => void };
}) {
  return (
    <td className="px-3 py-2 text-right">
      <div className="flex flex-wrap justify-end gap-2">
        {canManageClusterMaintenance(props.role) ? <MaintenanceControl {...props.maintenance} /> : null}
        <Button variant="secondary" size="sm" onClick={props.edit.onClick} testId={props.edit.testId}>
          {props.edit.label}
        </Button>
      </div>
    </td>
  );
}
