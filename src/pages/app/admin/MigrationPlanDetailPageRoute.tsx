import { useParams } from 'react-router-dom';

import { MigrationPlanDetailPage } from './MigrationPlanDetailPage';

export function MigrationPlanDetailPageRoute() {
  const { planId } = useParams();
  return <MigrationPlanDetailPage key={planId ?? 'invalid-migration-plan'} />;
}
