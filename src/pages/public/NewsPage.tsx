import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchNews } from '../../lib/api/public';
import { Alert } from '../../components/ui/Alert';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { NewsMessage } from '../../components/ui/NewsMessage';
import { Spinner } from '../../components/ui/Spinner';
import { formatDateTime } from '../../lib/time';
import { useI18n } from '../../app/i18n';
import { pickLocalizedFieldFrom } from '../../lib/translations';

export function NewsPage() {
  const i18n = useI18n();
  const newsQ = useQuery({
    queryKey: ['news_logs', 'index'],
    queryFn: async () => (await fetchNews()).data,
  });

  return (
    <div className="space-y-6" data-testid="public.news.page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{i18n.t('public.news.title')}</h1>
        <p className="text-sm text-muted">{i18n.t('public.news.subtitle')}</p>
      </div>

      {newsQ.isLoading ? (
        <Spinner label={i18n.t('public.news.loading')} />
      ) : newsQ.isError ? (
        <Alert title={i18n.t('public.news.error')} variant="danger" />
      ) : (newsQ.data?.length ?? 0) === 0 ? (
        <Alert title={i18n.t('public.news.empty.title')} variant="info">
          {i18n.t('public.news.empty.body')}
        </Alert>
      ) : (
        <div className="space-y-4">
          {newsQ.data?.map((n) => (
            <Card key={n.id}>
              <CardHeader title={formatDateTime(n.published_at)} subtitle={`#${n.id}`} />
              <CardBody>
                <NewsMessage html={pickLocalizedFieldFrom(n, ['message', 'body', 'text'], i18n.preferredLanguageCodes) ?? n.message} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
