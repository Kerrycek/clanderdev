import React from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/i18n';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import type { SecurityAdvisoryOutageLink } from '../../../lib/api/securityAdvisoryRelations';

export function OutageAdvisoriesCard({ links }: { links: SecurityAdvisoryOutageLink[] }) {
  const { t } = useI18n();
  if (!links.length) return null;

  return (
    <Card>
      <CardHeader title={t('admin.outages.section.security_advisories')} />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const advisory = typeof link.security_advisory === 'object' ? link.security_advisory : null;
            const id = advisory?.id ?? link.security_advisory_id
              ?? (typeof link.security_advisory === 'number' ? link.security_advisory : null);
            const label = advisory?.label || advisory?.name || (id ? `#${id}` : `#${link.id}`);
            return id
              ? <Link key={link.id} className="text-link hover:underline" to={`/admin/security-advisories/${id}`}>{label}</Link>
              : <span key={link.id}>{label}</span>;
          })}
        </div>
      </CardBody>
    </Card>
  );
}
