import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../../app/auth';
import { useI18n } from '../../../../app/i18n';
import { useChrome } from '../../../../components/layout/ChromeContext';
import { Button } from '../../../../components/ui/Button';
import { CopyButton } from '../../../../components/ui/CopyButton';
import { getMetaActionStateId } from '../../../../lib/api/haveapi';
import {
  fetchNodeUpdateCapability,
  updateNode,
  type Node,
  type NodeCreateInput,
  type NodeUpdateInput,
} from '../../../../lib/api/nodes';
import { objectRef } from '../../../../lib/objectRef';
import { preflightNodeNotBusy } from '../adminPreflight';
import { nodeTitle } from '../nodeDetail/nodeDetailSemantics';
import { NodeEditorModal } from './NodeEditorModal';

function nodeUpdatePayload(payload: NodeCreateInput | NodeUpdateInput): NodeUpdateInput {
  if ('type' in payload) throw new Error('Unexpected create payload in node editor');
  return payload;
}

export function NodeLifecycleHeaderActions(props: {
  node: Node;
  busyTransaction: boolean;
  onUpdated: () => void;
}) {
  const auth = useAuth();
  const { t } = useI18n();
  const chrome = useChrome();
  const [open, setOpen] = useState(false);
  const nodeId = props.node.id;
  const nodeRef = objectRef('Node', nodeId);
  const title = nodeTitle(props.node, nodeId);
  const busyLocalLock = chrome.isLocallyLocked(nodeRef);

  const capabilityQ = useQuery({
    queryKey: ['nodes', 'capability', 'update', { nodeId }],
    queryFn: async () => (await fetchNodeUpdateCapability(nodeId)).data,
    enabled: auth.role === 'admin' && Number.isFinite(nodeId) && nodeId > 0,
    retry: false,
    staleTime: 60_000,
  });

  return (
    <>
      <CopyButton text={title} />
      {auth.role === 'admin' ? (
        <>
          <Button
            variant="secondary"
            disabled={!capabilityQ.isSuccess || busyLocalLock || props.busyTransaction}
            loading={capabilityQ.isLoading}
            disabledReason={
              !capabilityQ.isSuccess
                ? t('admin.node.editor.capability_unavailable.body')
                : busyLocalLock || props.busyTransaction
                  ? t('toast.action_blocked.body')
                  : undefined
            }
            onClick={() => setOpen(true)}
            testId="admin.node.edit"
          >
            {t('common.edit')}
          </Button>

          <NodeEditorModal
            mode="edit"
            open={open}
            node={props.node}
            capabilityAvailable={capabilityQ.isSuccess}
            updateCapability={capabilityQ.data}
            capabilityError={capabilityQ.error}
            onClose={() => setOpen(false)}
            onSubmit={async (payload) => {
              await preflightNodeNotBusy({
                nodeId,
                t,
                knownBusy: busyLocalLock || props.busyTransaction,
              });
              chrome.acquireLocalLock(nodeRef);
              try {
                return await updateNode(nodeId, nodeUpdatePayload(payload));
              } finally {
                chrome.releaseLocalLock(nodeRef);
              }
            }}
            onSuccess={(result) => {
              const actionStateId = getMetaActionStateId(result.meta);
              if (actionStateId !== undefined) {
                chrome.trackActionState(actionStateId, {
                  object: nodeRef,
                  actionLabelKey: 'action.node.update.label',
                  objectLabel: title,
                });
              }
              props.onUpdated();
            }}
          />
        </>
      ) : null}
    </>
  );
}
