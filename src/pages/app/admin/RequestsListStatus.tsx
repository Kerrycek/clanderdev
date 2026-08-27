import React from 'react';

import { useI18n } from '../../../app/i18n';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';

export function RequestsListStatus(props: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  filtersActive: boolean;
  scope: string;
  onRetry: () => void;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();

  if (props.loading) {
    return <LoadingState testId="admin.requests.loading" title={t('common.loading')} />;
  }
  if (props.error) {
    return (
      <ErrorState
        testId="admin.requests.error"
        title={t('requests.list.load_error.title')}
        error={props.error}
        onRetry={props.onRetry}
        showBack={false}
        detailsExtra={{ page: 'admin.requests', scope: props.scope }}
      />
    );
  }
  if (props.empty) {
    return (
      <EmptyState
        testId="admin.requests.empty"
        title={
          props.filtersActive
            ? t('empty.list.no_matches.title')
            : t('requests.list.empty')
        }
        body={props.filtersActive ? t('empty.list.no_matches.body') : undefined}
        actionLabel={props.filtersActive ? t('common.clear_filters') : undefined}
        onAction={props.filtersActive ? props.onClear : undefined}
      />
    );
  }
  return <>{props.children}</>;
}
