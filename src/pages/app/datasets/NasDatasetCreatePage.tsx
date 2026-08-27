import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useAppMode } from '../../../app/appMode';
import { useAuth } from '../../../app/auth';
import { useI18n } from '../../../app/i18n';
import { useObjectScope } from '../../../app/objectScope';
import { useToasts } from '../../../app/toasts';
import { PageHeader } from '../../../components/layout/PageHeader';
import { ListShell } from '../../../components/layout/ListShell';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { LoadingState } from '../../../components/ui/LoadingState';
import { Select } from '../../../components/ui/Select';
import { createDataset, fetchDatasets, type Dataset } from '../../../lib/api/datasets';
import { datasetCapabilities } from '../../../lib/gates/dataset';

function datasetLabel(dataset: Dataset): string {
  return String(dataset.full_name ?? dataset.name ?? dataset.label ?? `#${dataset.id}`);
}

function parseGiB(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error('invalid-quota');
  return Math.round(value * 1024);
}

function parseRecordsize(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 4 || value > 128 || (value & (value - 1)) !== 0) {
    throw new Error('invalid-recordsize');
  }
  return value * 1024;
}

export function NasDatasetCreatePage() {
  const { basePath } = useAppMode();
  const auth = useAuth();
  const scope = useObjectScope();
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [refquotaGiB, setRefquotaGiB] = useState('');
  const [automount, setAutomount] = useState(true);
  const [compression, setCompression] = useState(true);
  const [recordsizeKiB, setRecordsizeKiB] = useState('128');
  const [atime, setAtime] = useState(false);
  const [relatime, setRelatime] = useState(false);
  const [includeAdvanced, setIncludeAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentUserId = scope.scope === 'mine' ? scope.mineUserId : undefined;
  const waitForAdminScope = scope.canSwitchScope && scope.scope === 'mine' && parentUserId === undefined;

  const parentsQ = useQuery({
    queryKey: ['datasets', 'nas', 'create-parents', { user: parentUserId ?? null }],
    enabled: !waitForAdminScope,
    queryFn: async () => (
      await fetchDatasets({ role: 'primary', limit: 100, user: parentUserId, includes: 'user,parent' })
    ).data,
  });
  const parents = useMemo(
    () =>
      (parentsQ.data ?? []).filter(
        (dataset) =>
          datasetCapabilities(dataset, {
            role: auth.role,
            scope: scope.scope,
            userId: auth.user?.id,
          }).canCreateSubdataset
      ),
    [auth.role, auth.user?.id, parentsQ.data, scope.scope]
  );
  const parentOptions = useMemo(
    () => [
      { value: '', label: t('nas.create.parent.placeholder'), disabled: true },
      ...parents.map((dataset) => ({ value: String(dataset.id), label: datasetLabel(dataset) })),
    ],
    [parents, t]
  );

  const createM = useMutation({
    mutationFn: async () => {
      const dataset = Number(parentId);
      const childName = name.trim();
      if (!Number.isInteger(dataset) || dataset <= 0) throw new Error('parent-required');
      if (!childName) throw new Error('name-required');

      return createDataset({
        dataset,
        name: childName,
        automount,
        refquota: parseGiB(refquotaGiB),
        ...(includeAdvanced
          ? {
              compression,
              recordsize: parseRecordsize(recordsizeKiB),
              atime,
              relatime,
              sync: 'standard' as const,
            }
          : {}),
      });
    },
    onSuccess: (res) => {
      const id = Number((res.data as Dataset | undefined)?.id);
      pushToast({ variant: 'ok', title: t('nas.create.success') });
      if (Number.isInteger(id) && id > 0) navigate(`${basePath}/nas/${id}`);
      else navigate(`${basePath}/nas`);
    },
    onError: (cause: any) => {
      const key = String(cause?.message ?? cause ?? '');
      const message = key === 'parent-required'
        ? t('nas.create.validation.parent')
        : key === 'name-required'
          ? t('nas.create.validation.name')
          : key === 'invalid-quota' || key === 'invalid-recordsize'
            ? t('nas.create.validation.properties')
            : String(cause?.message ?? cause ?? t('nas.create.error'));
      setError(message);
    },
  });

  const submit = () => {
    setError(null);
    void createM.mutate();
  };

  if (parentsQ.isLoading) return <LoadingState testId="nas.create.loading" />;
  if (parentsQ.isError) {
    return (
      <ErrorState
        testId="nas.create.load-error"
        title={t('nas.create.load_error.title')}
        error={parentsQ.error}
        onRetry={() => void parentsQ.refetch()}
        backTo={`${basePath}/nas`}
        detailsExtra={{ page: 'nas.create' }}
      />
    );
  }

  return (
    <ListShell
      variant="narrow"
      header={
        <PageHeader
          title={t('nas.create.title')}
          description={t('nas.create.subtitle')}
          actions={<Button variant="secondary" to={`${basePath}/nas`}>{t('common.cancel')}</Button>}
        />
      }
    >
      <Card testId="nas.create.form">
        <CardHeader title={t('nas.create.form.title')} subtitle={t('nas.create.form.subtitle')} />
        <CardBody>
          {error ? <Alert variant="danger" title={t('nas.create.error')}>{error}</Alert> : null}
          {parents.length === 0 ? (
            <Alert variant="info" title={t('nas.create.empty.title')} description={t('nas.create.empty.body')} />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  testId="nas.create.parent"
                  label={t('nas.create.parent')}
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  options={parentOptions}
                />
                <Input
                  testId="nas.create.name"
                  label={t('nas.create.name')}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="data"
                  autoComplete="off"
                />
              </div>

              <div className="border-t border-border pt-4">
                <Input
                  testId="nas.create.refquota"
                  label={t('nas.create.refquota')}
                  value={refquotaGiB}
                  onChange={(event) => setRefquotaGiB(event.target.value)}
                  placeholder="10"
                  inputMode="decimal"
                />
              </div>

              <div className="border-t border-border pt-4">
                <Checkbox testId="nas.create.automount" checked={automount} onChange={setAutomount} label={t('nas.create.automount')} />
              </div>

              <details
                className="rounded-lg border border-border bg-surface-2"
                data-testid="nas.create.advanced_properties"
                onToggle={(event) => {
                  if (event.currentTarget.open) setIncludeAdvanced(true);
                }}
              >
                <summary
                  className="cursor-pointer select-none px-3 py-3 text-sm font-medium text-fg"
                  data-testid="nas.create.advanced_properties.summary"
                >
                  {t('filters.advanced.label')} ZFS
                </summary>
                <div className="space-y-4 border-t border-border px-3 py-4">
                  <Input
                    testId="nas.create.recordsize"
                    label={t('nas.create.recordsize')}
                    value={recordsizeKiB}
                    onChange={(event) => setRecordsizeKiB(event.target.value)}
                    inputMode="numeric"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Checkbox testId="nas.create.compression" checked={compression} onChange={setCompression} label={t('nas.create.compression')} />
                    <Checkbox testId="nas.create.atime" checked={atime} onChange={setAtime} label={t('nas.create.atime')} />
                    <Checkbox testId="nas.create.relatime" checked={relatime} onChange={setRelatime} label={t('nas.create.relatime')} />
                  </div>
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button testId="nas.create.submit" onClick={submit} loading={createM.isPending} disabled={!parentId || !name.trim()}>
                  {t('nas.create.submit')}
                </Button>
                <Button variant="secondary" to={`${basePath}/nas`}>{t('common.cancel')}</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </ListShell>
  );
}
