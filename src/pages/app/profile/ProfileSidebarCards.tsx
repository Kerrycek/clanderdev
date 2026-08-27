import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import type { User } from '../../../lib/api/users';
import { ProfilePreferenceRow } from './ProfilePreferenceRow';

const FALLBACK_TIME_ZONES = [
  'Europe/Prague',
  'Europe/Bratislava',
  'Europe/Berlin',
  'Europe/London',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
];

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  return typeof intl.supportedValuesOf === 'function'
    ? intl.supportedValuesOf('timeZone')
    : FALLBACK_TIME_ZONES;
}

export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function timeZoneOptions(current?: string | null, server?: string | null, browser?: string | null) {
  const pinned = ['Europe/Prague', server, browser, current, 'UTC'].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
  const seen = new Set<string>();
  return [...pinned, ...supportedTimeZones()]
    .filter((zone) => {
      if (seen.has(zone)) return false;
      seen.add(zone);
      return true;
    })
    .map((zone) => ({ value: zone, label: zone }));
}

export function ProfileSidebarCards(props: {
  t: (key: any, vars?: Record<string, unknown>) => string;
  authUser: { id: number; login: string } | null | undefined;
  authRole: unknown;
  profileUser: User | null;
  timeZone: string;
  serverTimeZone: string | null;
  browserTimeZone: string | null;
  timeZoneDirty: boolean;
  savingTimeZone: boolean;
  onTimeZoneChange: (value: string) => void;
  onSaveTimeZone: () => void;
}) {
  const {
    t, authUser, authRole, profileUser, timeZone, serverTimeZone, browserTimeZone: detectedBrowserTimeZone,
    timeZoneDirty, savingTimeZone, onTimeZoneChange, onSaveTimeZone,
  } = props;

  return (
    <div className="space-y-4">
      <Card testId="profile.user.card">
        <CardHeader title={t('profile.user.title')} subtitle={t('profile.user.subtitle')} />
        <CardBody>
          {authUser ? (
            <div className="space-y-2 text-sm">
              <SummaryRow label={t('profile.user.login')} value={authUser.login} />
              <SummaryRow label={t('profile.user.id')} value={authUser.id} tabular />
              <SummaryRow label={t('profile.user.role')} value={String(authRole || '—')} />
              {profileUser?.time_zone ? (
                <SummaryRow label={t('profile.personal.time_zone.label')} value={profileUser.time_zone} />
              ) : null}
            </div>
          ) : (
            <div className="py-6 text-sm text-muted">{t('profile.user.loading')}</div>
          )}
        </CardBody>
      </Card>

      <Card testId="profile.time_zone.card">
        <CardHeader title={t('profile.personal.time_zone.title')} subtitle={t('profile.personal.time_zone.subtitle')} />
        <CardBody>
          <div className="space-y-3">
            <ProfilePreferenceRow
              label={t('profile.personal.time_zone.label')}
              description={t('profile.personal.time_zone.description')}
            >
              <Select
                value={timeZone}
                onChange={(event) => onTimeZoneChange(event.target.value)}
                options={[
                  { value: '', label: t('profile.personal.time_zone.server_default') },
                  ...timeZoneOptions(profileUser?.time_zone, serverTimeZone, detectedBrowserTimeZone),
                ]}
                disabled={!profileUser || savingTimeZone}
                testId="profile.personal.time_zone"
              />
            </ProfilePreferenceRow>

            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              {t('profile.personal.time_zone.current')}: {' '}
              <span className="font-medium text-fg">{profileUser?.time_zone || t('profile.personal.time_zone.server_default')}</span>
              {detectedBrowserTimeZone ? (
                <>
                  {' · '}{t('profile.personal.time_zone.browser')}: {' '}
                  <span className="font-medium text-fg">{detectedBrowserTimeZone}</span>
                </>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              {detectedBrowserTimeZone ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onTimeZoneChange(detectedBrowserTimeZone)}
                  disabled={savingTimeZone}
                  testId="profile.personal.time_zone.use_browser"
                >
                  {t('profile.personal.time_zone.use_browser')}
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={onSaveTimeZone}
                disabled={!timeZoneDirty || savingTimeZone}
                loading={savingTimeZone}
                testId="profile.personal.time_zone.save"
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card testId="profile.tips.card">
        <CardHeader title={t('profile.tips.title')} subtitle={t('profile.tips.subtitle')} />
        <CardBody>
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
            <li>{t('profile.tips.item.0')}</li>
            <li>{t('profile.tips.item.2')}</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string | number; tabular?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{props.label}</span>
      <span className={`font-medium text-fg${props.tabular ? ' tabular-nums' : ''}`}>{props.value}</span>
    </div>
  );
}
