import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAppMode } from '../../../../app/appMode';
import { useAuth } from '../../../../app/auth';
import { useI18n } from '../../../../app/i18n';
import { Spinner } from '../../../../components/ui/Spinner';

import { fetchUserNamespaces } from '../../../../lib/api/userNamespaces';

export function ProfileUserNamespacesIndexPage() {
  const { basePath } = useAppMode();
  const auth = useAuth();
  const { t } = useI18n();
  const userId = typeof auth.user?.id === 'number' ? auth.user.id : undefined;

  const q = useQuery({
    queryKey: ['user_namespace', 'list', { forLanding: true, userId }],
    queryFn: async () => (await fetchUserNamespaces({ limit: 2, userId })).data,
    enabled: userId !== undefined,
    refetchOnWindowFocus: false,
  });

  const targetBase = `${basePath}/profile/user-namespaces`;

  if (userId === undefined || q.isLoading) {
    return (
      <div className="mt-6">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const list = q.data ?? [];
  const to = list.length === 1 ? `${targetBase}/maps` : `${targetBase}/namespaces`;

  return <Navigate to={to} replace />;
}
