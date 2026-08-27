import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../app/auth';
import { getRuntimeConfig } from '../../../app/config';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { DetailShell } from '../../../components/layout/DetailShell';
import { PageHeader } from '../../../components/layout/PageHeader';

import { ProfileTabs } from './ProfileTabs';
import { ProfilePreferencesCard } from './ProfilePreferencesCard';
import { browserTimeZone, ProfileSidebarCards } from './ProfileSidebarCards';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { LinkButton } from '../../../components/ui/LinkButton';
import { Textarea } from '../../../components/ui/Textarea';

import { fetchUser, updateUser } from '../../../lib/api/users';
import { createChangeRequest } from '../../../lib/api/requests';
import { formatErrorMessage } from '../../../lib/errors';
import { userString } from './ProfilePageHelpers';

export function ProfilePage() {
  const auth = useAuth();
  const toasts = useToasts();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [changeReason, setChangeReason] = React.useState('');
  const [timeZone, setTimeZone] = React.useState('');
  const [changeSubmitted, setChangeSubmitted] = React.useState(false);
  const [submittedRequestId, setSubmittedRequestId] = React.useState<number | null>(null);

  const userId = auth.user?.id ?? null;
  const cfg = getRuntimeConfig();
  const serverTimeZone = cfg.serverTimeZone ?? null;
  const detectedBrowserTimeZone = browserTimeZone();

  const profileUserQ = useQuery({
    queryKey: ['users', userId],
    enabled: typeof userId === 'number',
    queryFn: async () => (await fetchUser(userId as number)).data,
    staleTime: 30_000,
  });

  const profileUser = profileUserQ.data ?? auth.user ?? null;

  React.useEffect(() => {
    if (!profileUser) return;
    setFullName(userString(profileUser, 'full_name'));
    setEmail(userString(profileUser, 'email'));
    setAddress(userString(profileUser, 'address'));
    setTimeZone(profileUser.time_zone ?? '');
    setChangeSubmitted(false);
    setSubmittedRequestId(null);
  }, [profileUser]);

  const personalDirty =
    fullName !== userString(profileUser, 'full_name') ||
    email !== userString(profileUser, 'email') ||
    address !== userString(profileUser, 'address');

  const timeZoneDirty = timeZone !== (profileUser?.time_zone ?? '');

  const saveTimeZoneM = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await updateUser(userId, { time_zone: timeZone });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['users', userId] });
      await qc.invalidateQueries({ queryKey: ['user', 'current'] });
      toasts.pushToast({
        variant: 'ok',
        title: t('profile.personal.time_zone.toast.saved.title'),
        body: t('profile.personal.time_zone.toast.saved.body'),
      });
    },
    onError: (e) => {
      toasts.pushToast({
        variant: 'danger',
        title: t('profile.personal.time_zone.toast.failed.title'),
        body: formatErrorMessage(e),
      });
    },
  });

  const submitChangeM = useMutation({
    mutationFn: async () => {
      if (!userId || !profileUser) return null;

      const payload: Parameters<typeof createChangeRequest>[0] = {
        change_reason: changeReason.trim(),
      };

      if (fullName !== userString(profileUser, 'full_name')) payload.full_name = fullName.trim();
      if (email !== userString(profileUser, 'email')) payload.email = email.trim();
      if (address !== userString(profileUser, 'address')) payload.address = address.trim();

      return (await createChangeRequest(payload)).data;
    },
    onSuccess: async (request) => {
      const requestId = Number(request?.id);
      setChangeReason('');
      setChangeSubmitted(true);
      setSubmittedRequestId(
        Number.isSafeInteger(requestId) && requestId > 0 ? requestId : null
      );
      await qc.invalidateQueries({ queryKey: ['user_request', 'mine', userId] });
      toasts.pushToast({
        variant: 'ok',
        title: t('profile.personal.change.toast.sent.title'),
        body: t('profile.personal.change.toast.sent.body'),
      });
    },
    onError: (e) => {
      toasts.pushToast({
        variant: 'danger',
        title: t('profile.personal.change.toast.failed.title'),
        body: formatErrorMessage(e),
      });
    },
  });

  return (
    <DetailShell testId="profile.page">
      <PageHeader
        testId="profile.header"
        title={t('profile.page.title')}
        description={t('profile.page.description')}
      />

      <ProfileTabs />

      <div
        data-testid="profile.summary"
        className="grid gap-4 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)] lg:items-start"
      >
        <ProfileSidebarCards
          t={t}
          authUser={auth.user}
          authRole={auth.role}
          profileUser={profileUser}
          timeZone={timeZone}
          serverTimeZone={serverTimeZone}
          browserTimeZone={detectedBrowserTimeZone}
          timeZoneDirty={timeZoneDirty}
          savingTimeZone={saveTimeZoneM.isPending}
          onTimeZoneChange={setTimeZone}
          onSaveTimeZone={() => saveTimeZoneM.mutate()}
        />
        <div className="space-y-4">
          <Card testId="profile.personal.card">
            <CardHeader title={t('profile.personal.title')} subtitle={t('profile.personal.subtitle')} />
            <CardBody>
            {profileUserQ.isError ? (
              <Alert variant="danger" title={t('profile.personal.load_failed.title')}>
                {formatErrorMessage(profileUserQ.error)}
              </Alert>
            ) : null}

            {changeSubmitted ? (
              <Alert
                variant="ok"
                title={t('profile.personal.change.sent.title')}
                testId="profile.personal.change.sent"
                className="mb-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{t('profile.personal.change.sent.body')}</span>
                  <LinkButton
                    to={submittedRequestId ? `/app/requests/change/${submittedRequestId}` : '/app/requests'}
                    variant="secondary"
                    size="sm"
                    testId="profile.personal.change.sent.open"
                  >
                    {t('profile.personal.change.sent.open')}
                  </LinkButton>
                </div>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t('profile.personal.full_name.label')}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setChangeSubmitted(false);
                  setSubmittedRequestId(null);
                }}
                disabled={!profileUser}
                testId="profile.personal.full_name"
                autoComplete="name"
              />
              <Input
                label={t('profile.personal.email.label')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setChangeSubmitted(false);
                  setSubmittedRequestId(null);
                }}
                disabled={!profileUser}
                testId="profile.personal.email"
                autoComplete="email"
              />
              <div className="sm:col-span-2">
                <Input
                  label={t('profile.personal.address.label')}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setChangeSubmitted(false);
                    setSubmittedRequestId(null);
                  }}
                  disabled={!profileUser}
                  testId="profile.personal.address"
                  autoComplete="street-address"
                />
              </div>
              <div className="sm:col-span-2">
                <Textarea
                  label={t('profile.personal.change_reason.label')}
                  value={changeReason}
                  rows={3}
                  onChange={(e) => {
                    setChangeReason(e.target.value);
                    setChangeSubmitted(false);
                    setSubmittedRequestId(null);
                  }}
                  disabled={!personalDirty || submitChangeM.isPending}
                  placeholder={t('profile.personal.change_reason.placeholder')}
                  testId="profile.personal.change_reason"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-5 text-muted">{t('profile.personal.change.help')}</div>
              <Button
                onClick={() => submitChangeM.mutate()}
                disabled={!personalDirty || !changeReason.trim() || submitChangeM.isPending}
                loading={submitChangeM.isPending}
                testId="profile.personal.change.submit"
              >
                {t('profile.personal.change.submit')}
              </Button>
            </div>
          </CardBody>
        </Card>
        <ProfilePreferencesCard />
        </div>
      </div>
    </DetailShell>
  );
}
