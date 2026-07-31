import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '../../app/i18n';
import {
  fetchUserClusterResourcePackages,
  type UserClusterResourcePackage,
} from '../../lib/api/clusterResourcePackages';
import { Badge } from '../ui/Badge';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';

function label(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function assignmentBelongsToUser(row: UserClusterResourcePackage, userId: number): boolean {
  return row.user?.id === userId;
}

export function UserResourcePackagesPanel(props: { userId: number; testIdPrefix: string }) {
  const { t, tc } = useI18n();
  const packagesQ = useQuery({
    queryKey: ['user_cluster_resource_packages', { userId: props.userId, limit: 500 }],
    queryFn: async () =>
      (await fetchUserClusterResourcePackages({ userId: props.userId, limit: 500 })).data,
  });

  const groups = useMemo(() => {
    const byEnvironment = new Map<
      string,
      { label: string; description?: string; assignments: UserClusterResourcePackage[] }
    >();

    for (const row of packagesQ.data ?? []) {
      // The API request is scoped to the signed-in user. Keep a second,
      // fail-closed ownership check here so a broken filter cannot leak another
      // user's package assignment into the profile.
      if (!assignmentBelongsToUser(row, props.userId)) continue;

      const environment = row.environment;
      const key = typeof environment?.id === 'number' ? String(environment.id) : 'none';
      const group = byEnvironment.get(key) ?? {
        label: label(
          environment?.label,
          typeof environment?.id === 'number' ? `#${environment.id}` : t('common.unknown')
        ),
        description: label(environment?.description, ''),
        assignments: [],
      };
      group.assignments.push(row);
      byEnvironment.set(key, group);
    }

    // Preserve the API order. Environments are returned in the operational
    // order used elsewhere in vpsAdmin (typically Production first).
    return [...byEnvironment.entries()].map(([key, group]) => ({ key, ...group }));
  }, [packagesQ.data, props.userId, t]);

  if (packagesQ.isLoading) {
    return (
      <div className="text-sm text-muted" data-testid={`${props.testIdPrefix}.loading`}>
        {t('common.loading')}
      </div>
    );
  }

  if (packagesQ.isError) {
    return (
      <ErrorState
        error={packagesQ.error}
        title={t('profile.resources.packages.error.title')}
        body={t('profile.resources.packages.error.body')}
        onRetry={() => void packagesQ.refetch()}
        showBack={false}
        showStatusLink={false}
        testId={`${props.testIdPrefix}.error`}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title={t('profile.resources.packages.empty.title')}
        body={t('profile.resources.packages.empty.body')}
        testId={`${props.testIdPrefix}.empty`}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid={props.testIdPrefix}>
      {groups.map((group) => (
        <Card key={group.key} testId={`${props.testIdPrefix}.environment.${group.key}`}>
          <CardHeader
            title={group.label}
            subtitle={
              <>
                {group.description ? <span>{group.description} · </span> : null}
                {tc('profile.resources.packages.count', group.assignments.length)}
              </>
            }
          />
          <CardBody className="space-y-2">
            {group.assignments.map((assignment) => {
              const resourcePackage = assignment.cluster_resource_package;
              const packageName = label(
                resourcePackage?.label ?? assignment.label,
                typeof resourcePackage?.id === 'number' ? `#${resourcePackage.id}` : t('common.unknown')
              );
              const isPersonal = Boolean(assignment.is_personal ?? resourcePackage?.is_personal);

              return (
                <div
                  key={assignment.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5"
                  data-testid={`${props.testIdPrefix}.assignment.${assignment.id}`}
                >
                  <span className="min-w-0 truncate font-medium" title={packageName}>
                    {packageName}
                  </span>
                  {isPersonal ? (
                    <Badge variant="info" className="shrink-0">
                      {t('profile.resources.packages.personal')}
                    </Badge>
                  ) : null}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
