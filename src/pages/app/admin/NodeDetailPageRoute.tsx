import { useParams } from 'react-router-dom';

import { NodeDetailPage } from './NodeDetailPage';

export function NodeDetailPageRoute() {
  const { nodeId } = useParams();
  return <NodeDetailPage key={nodeId ?? 'invalid-node'} />;
}
