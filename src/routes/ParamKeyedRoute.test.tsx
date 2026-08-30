import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ParamKeyedRoute } from './ParamKeyedRoute';

function StatefulDetail({ next }: { next: string }) {
  const params = useParams();
  const [draft, setDraft] = useState('');

  return (
    <div>
      <output data-testid="params">{JSON.stringify(params)}</output>
      <input data-testid="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Link to={next}>Next</Link>
    </div>
  );
}

describe('ParamKeyedRoute', () => {
  it('remounts its stateful child when a single object parameter changes', async () => {
    render(
      <MemoryRouter initialEntries={['/objects/1']}>
        <Routes>
          <Route
            path="objects/:objectId"
            element={
              <ParamKeyedRoute param="objectId">
                <StatefulDetail next="/objects/2" />
              </ParamKeyedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId('draft'), { target: { value: 'stale object 1 draft' } });
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));

    await waitFor(() => expect(screen.getByTestId('params')).toHaveTextContent('"objectId":"2"'));
    expect(screen.getByTestId('draft')).toHaveValue('');
  });

  it('remounts when either member of a composite identity changes', async () => {
    render(
      <MemoryRouter initialEntries={['/requests/registration/1']}>
        <Routes>
          <Route
            path="requests/:type/:requestId"
            element={
              <ParamKeyedRoute params={['type', 'requestId']}>
                <StatefulDetail next="/requests/payment/1" />
              </ParamKeyedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId('draft'), { target: { value: 'stale registration draft' } });
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));

    await waitFor(() => expect(screen.getByTestId('params')).toHaveTextContent('"type":"payment"'));
    expect(screen.getByTestId('draft')).toHaveValue('');
  });
});

describe('stateful detail route key contract', () => {
  const routerSource = readFileSync(resolve(process.cwd(), 'src/routes/router.tsx'), 'utf8').replace(/\s+/g, ' ');
  const advisorySource = readFileSync(
    resolve(process.cwd(), 'src/routes/securityAdvisoryAdminRoutes.tsx'),
    'utf8',
  ).replace(/\s+/g, ' ');
  const financeSource = readFileSync(
    resolve(process.cwd(), 'src/routes/adminFinanceRoutes.tsx'),
    'utf8',
  ).replace(/\s+/g, ' ');

  function expectOccurrences(source: string, fragment: string, count: number) {
    expect(source.split(fragment)).toHaveLength(count + 1);
  }

  function singleParamRoute(path: string, param: string, component: string) {
    return `path: '${path}', element: <ParamKeyedRoute param="${param}"><${component} /></ParamKeyedRoute>`;
  }

  function compositeParamRoute(path: string, params: string, component: string) {
    return `path: '${path}', element: <ParamKeyedRoute params={[${params}]}><${component} /></ParamKeyedRoute>`;
  }

  it('keys every audited single-parameter detail element', () => {
    expectOccurrences(routerSource, singleParamRoute('action-states/:actionStateId', 'actionStateId', 'CoreRoutes.ActionStateDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('action_states/:actionStateId', 'actionStateId', 'CoreRoutes.ActionStateDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('monitoring/:eventId', 'eventId', 'CoreRoutes.MonitoringEventDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('ip-addresses/:ipAddressId', 'ipAddressId', 'IpAddressDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('outages/:outageId', 'outageId', 'AdminOutagesPage'), 1);
    expectOccurrences(routerSource, singleParamRoute('datasets/:datasetId', 'datasetId', 'DatasetLayout'), 2);
    expectOccurrences(routerSource, singleParamRoute('nas/:datasetId', 'datasetId', 'DatasetLayout'), 2);
    expectOccurrences(routerSource, singleParamRoute('dns/zones/:zoneId', 'zoneId', 'DnsZoneLayout'), 2);
    expectOccurrences(routerSource, singleParamRoute('exports/:exportId', 'exportId', 'ExportDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('oom-reports/rules/:vpsId', 'vpsId', 'CoreRoutes.OomReportRulesPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('networks/:networkId', 'networkId', 'NetworkDetailPage'), 1);
    expectOccurrences(routerSource, singleParamRoute('resource-packages/:packageId', 'packageId', 'ResourcePackageDetailPage'), 1);
    expectOccurrences(routerSource, singleParamRoute('mailer/templates/:mailTemplateId', 'mailTemplateId', 'MailTemplateDetailPage'), 1);
    expectOccurrences(routerSource, singleParamRoute('mailer/mailboxes/:mailboxId', 'mailboxId', 'MailboxDetailPage'), 1);
    expectOccurrences(routerSource, singleParamRoute('maps/:mapId', 'mapId', 'ProfileUserNamespacesMapDetailPage'), 2);
    expectOccurrences(routerSource, singleParamRoute('maps/:mapId', 'mapId', 'AdminUserNamespacesMapDetailPage'), 1);
    expectOccurrences(advisorySource, singleParamRoute('security-advisories/:advisoryId', 'advisoryId', 'AdminSecurityAdvisoryDetailPage'), 1);
    expectOccurrences(financeSource, singleParamRoute('payments/incoming/:paymentId', 'paymentId', 'IncomingPaymentDetailPage'), 1);
  });

  it('keys every audited composite-identity detail element', () => {
    expectOccurrences(routerSource, compositeParamRoute('requests/registrations/:requestId/:token', "'requestId', 'token'", 'CoreRoutes.RegistrationCorrectionPage'), 1);
    expectOccurrences(routerSource, compositeParamRoute('mailer/templates/:mailTemplateId/translations/:translationId', "'mailTemplateId', 'translationId'", 'MailTemplateTranslationPage'), 1);
    expectOccurrences(routerSource, compositeParamRoute('requests/:type/:requestId', "'type', 'requestId'", 'RequestDetailPage'), 1);
  });
});
