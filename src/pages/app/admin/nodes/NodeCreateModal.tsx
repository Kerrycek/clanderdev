import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useChrome } from '../../../../components/layout/ChromeContext';
import { getMetaActionStateId } from '../../../../lib/api/haveapi';
import {
  createNode,
  type NodeCreateInput,
  type NodeWriteCapabilityDescription,
} from '../../../../lib/api/nodes';
import { objectRef } from '../../../../lib/objectRef';

import { NodeEditorModal } from './NodeEditorModal';
import type { IndeterminateNodeCreateAttempt } from './NodeCreateIndeterminateGuard';

interface NodeCreateModalProps {
  open: boolean;
  capabilityAvailable: boolean;
  capability?: NodeWriteCapabilityDescription;
  capabilityError?: unknown;
  onClose: () => void;
  onIndeterminate: (attempt: IndeterminateNodeCreateAttempt) => void;
}

export function NodeCreateModal(props: NodeCreateModalProps) {
  const { basePath } = useAppMode();
  const chrome = useChrome();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <NodeEditorModal
      mode="create"
      open={props.open}
      capabilityAvailable={props.capabilityAvailable}
      createCapability={props.capability}
      capabilityError={props.capabilityError}
      onClose={props.onClose}
      onSubmit={(payload) => createNode(payload as NodeCreateInput)}
      onCreateIndeterminate={(_error, attemptedPayload) => {
        props.onIndeterminate({
          name: attemptedPayload.name,
          ipAddress: attemptedPayload.ip_addr,
        });
      }}
      onSuccess={(result) => {
        const node = result.data;
        const nodeId = node && typeof node === 'object' ? Number(node.id) : NaN;
        const actionStateId = getMetaActionStateId(result.meta);
        if (actionStateId !== undefined) {
          chrome.trackActionState(actionStateId, {
            object: Number.isFinite(nodeId) && nodeId > 0 ? objectRef('Node', nodeId) : undefined,
            actionLabelKey: 'action.node.create.label',
            objectLabel: node && typeof node === 'object' ? String(node.name ?? `#${nodeId}`) : undefined,
          });
        }
        void queryClient.invalidateQueries({ queryKey: ['nodes'] });
        if (Number.isFinite(nodeId) && nodeId > 0) navigate(`${basePath}/nodes/${nodeId}`);
      }}
    />
  );
}
