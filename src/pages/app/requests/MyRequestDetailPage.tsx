import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { DetailShell } from '../../../components/layout/DetailShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import {
  fetchMyChangeRequest,
  fetchMyRegistrationRequest,
  type ChangeRequest,
  type RegistrationRequest,
} from '../../../lib/api/requests';
import { formatDateTime } from '../../../lib/format';
import { refLabel } from '../../../lib/resources';
import {
  requestStateBadgeVariant,
  requestStateLabelKey,
  requestTypeLabelKey,
} from '../../../lib/requestsBadges';

type RequestType = 'registration' | 'change';

function positiveId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fieldValue(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function currencyLabel(value: unknown): string | null {
  const currency = fieldValue(value);
  return currency ? currency.toUpperCase() : null;
}

function DetailField(props: { label: React.ReactNode; value: unknown; wide?: boolean }) {
  const value = fieldValue(props.value);
  if (!value) return null;
  return (
    <div className={props.wide ? 'sm:col-span-2' : undefined}>
      <div className="text-xs text-muted">{props.label}</div>
      <div className="mt-1 whitespace-pre-line break-words text-sm">{value}</div>
    </div>
  );
}

export function MyRequestDetailPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const params = useParams();
  const requestId = positiveId(params['requestId']);
  const requestType: RequestType | null = params['type'] === 'registration' || params['type'] === 'change'
    ? params['type']
    : null;
  const parsedUserId = Number(auth.user?.id);
  const userId = Number.isSafeInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;

  const requestQ = useQuery({
    queryKey: ['user_request', 'mine', userId, requestType, requestId],
    enabled: Boolean(userId && requestId && requestType),
    queryFn: async () => {
      if (!userId || !requestId || !requestType) throw new Error('Invalid request.');
      if (requestType === 'registration') {
        return (await fetchMyRegistrationRequest(requestId, userId)).data;
      }
      return (await fetchMyChangeRequest(requestId, userId)).data;
    },
  });

  if (!requestId || !requestType) {
    return (
      <DetailShell testId="app.requests.detail.invalid">
        <ErrorState
          title={t('requests.detail.invalid')}
          body={t('requests.detail.invalid.body')}
          showDetails={false}
          showStatusLink={false}
          backTo="/app/requests"
        />
      </DetailShell>
    );
  }

  if (userId && requestQ.isLoading) {
    return <DetailShell testId="app.requests.detail.loading"><LoadingState /></DetailShell>;
  }

  if (!userId || requestQ.isError || !requestQ.data) {
    return (
      <DetailShell testId="app.requests.detail.error">
        <ErrorState
          title={t('requests.my.detail.load_error.title')}
          body={t('requests.my.detail.load_error.body')}
          error={requestQ.error}
          onRetry={() => void requestQ.refetch()}
          showDetails={false}
          showStatusLink={false}
          backTo="/app/requests"
        />
      </DetailShell>
    );
  }

  const request = requestQ.data as RegistrationRequest | ChangeRequest;
  const state = String(request.state ?? '').trim();

  return (
    <DetailShell
      testId={`app.requests.detail.${requestType}.${requestId}`}
      header={
        <PageHeader
          title={`${t(requestTypeLabelKey(requestType))} #${requestId}`}
          description={
            <span className="inline-flex items-center gap-2">
              <Badge variant={requestStateBadgeVariant(state)}>{t(requestStateLabelKey(state))}</Badge>
              <span>{t('requests.my.detail.description')}</span>
            </span>
          }
          actions={<Link className="text-sm font-medium text-accent hover:underline" to="/app/requests">{t('common.back')}</Link>}
        />
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)] lg:items-start">
        <Card testId="app.requests.detail.fields">
          <CardHeader
            title={requestType === 'registration' ? t('requests.my.detail.registration.title') : t('requests.my.detail.change.title')}
            subtitle={requestType === 'registration' ? t('requests.my.detail.registration.subtitle') : t('requests.my.detail.change.subtitle')}
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              {requestType === 'registration' ? (
                <>
                  <DetailField label={t('requests.field.login')} value={(request as RegistrationRequest).login} />
                  <DetailField label={t('requests.field.full_name')} value={(request as RegistrationRequest).full_name} />
                  <DetailField label={t('requests.field.email')} value={(request as RegistrationRequest).email} />
                  <DetailField label={t('requests.field.org')} value={(request as RegistrationRequest).org_name} />
                  <DetailField label={t('requests.field.address')} value={(request as RegistrationRequest).address} wide />
                  <DetailField label={t('requests.field.year_of_birth')} value={(request as RegistrationRequest).year_of_birth} />
                  <DetailField label={t('requests.field.os_template')} value={refLabel((request as RegistrationRequest).os_template)} />
                  <DetailField label={t('requests.field.location')} value={refLabel((request as RegistrationRequest).location)} />
                  <DetailField label={t('requests.field.currency')} value={currencyLabel((request as RegistrationRequest).currency)} />
                  <DetailField label={t('requests.field.language')} value={refLabel((request as RegistrationRequest).language)} />
                  <DetailField label={t('requests.field.time_zone')} value={(request as RegistrationRequest).time_zone} />
                  <DetailField label={t('requests.field.how')} value={(request as RegistrationRequest).how} wide />
                  <DetailField label={t('requests.field.note')} value={(request as RegistrationRequest).note} wide />
                </>
              ) : (
                <>
                  <DetailField label={t('requests.field.full_name')} value={(request as ChangeRequest).full_name} />
                  <DetailField label={t('requests.field.email')} value={(request as ChangeRequest).email} />
                  <DetailField label={t('requests.field.address')} value={(request as ChangeRequest).address} wide />
                  <DetailField label={t('requests.field.change_reason')} value={(request as ChangeRequest).change_reason} wide />
                </>
              )}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card testId="app.requests.detail.state">
            <CardHeader title={t('requests.detail.card.state')} />
            <CardBody>
              <div className="flex items-center gap-2">
                <Badge variant={requestStateBadgeVariant(state)}>{t(requestStateLabelKey(state))}</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted">{t('common.created')}</div>
                  <div className="mt-1">{formatDateTime(request.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('common.updated')}</div>
                  <div className="mt-1">{formatDateTime(request.updated_at)}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {fieldValue(request.admin_response) ? (
            <Card testId="app.requests.detail.response">
              <CardHeader title={t('requests.detail.admin_response')} />
              <CardBody>
                <div className="whitespace-pre-line break-words text-sm">{request.admin_response}</div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </DetailShell>
  );
}
