import { useParams } from 'react-router-dom';

import { VpsLayout } from './VpsLayout';

export function VpsLayoutRoute() {
  const { vpsId } = useParams();
  return <VpsLayout key={vpsId ?? 'invalid-vps'} />;
}
