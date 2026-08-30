import { useParams } from 'react-router-dom';

import { AdminUserLayout } from './AdminUserLayout';

export function AdminUserLayoutRoute() {
  const { userId } = useParams();
  return <AdminUserLayout key={userId ?? 'invalid-user'} />;
}
