import { useI18n } from '../../app/i18n';
import type { UserSessionStateFilter } from './UserSessionsModel';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export type UserSessionAuthFilter = 'all' | 'basic' | 'token' | 'oauth2';

export function isUserSessionAuthFilter(value: string | null | undefined): value is UserSessionAuthFilter {
  return value === 'all' || value === 'basic' || value === 'token' || value === 'oauth2';
}

export function SessionsFilters(props: {
  state: UserSessionStateFilter;
  search: string;
  exactId: string;
  authType: UserSessionAuthFilter;
  userAgent: string;
  clientVersion: string;
  tokenFragment: string;
  detailedOutput: boolean;
  testIdPrefix: string;
  onStateChange: (state: UserSessionStateFilter) => void;
  onSearchChange: (search: string) => void;
  onExactIdChange: (id: string) => void;
  onAuthTypeChange: (authType: UserSessionAuthFilter) => void;
  onUserAgentChange: (userAgent: string) => void;
  onClientVersionChange: (clientVersion: string) => void;
  onTokenFragmentChange: (token: string) => void;
  onDetailedOutputChange: (enabled: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {t('profile.sessions.filters.title')}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.state')}</div>
          <div className="mt-1">
            <Select
              value={props.state}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || value === 'open' || value === 'closed') props.onStateChange(value);
              }}
              options={[
                { value: 'all', label: t('profile.sessions.state.all') },
                { value: 'open', label: t('profile.sessions.state.open') },
                { value: 'closed', label: t('profile.sessions.state.closed') },
              ]}
              testId={`${props.testIdPrefix}.state`}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.auth_type')}</div>
          <div className="mt-1">
            <Select
              value={props.authType}
              onChange={(event) => {
                const value = event.target.value;
                if (isUserSessionAuthFilter(value)) props.onAuthTypeChange(value);
              }}
              options={[
                { value: 'all', label: t('profile.sessions.auth_type.all') },
                { value: 'oauth2', label: t('profile.sessions.auth_type.oauth2') },
                { value: 'token', label: t('profile.sessions.auth_type.token') },
                { value: 'basic', label: t('profile.sessions.auth_type.basic') },
              ]}
              testId={`${props.testIdPrefix}.auth_type`}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.exact_id')}</div>
          <div className="mt-1">
            <Input
              type="number"
              min={1}
              value={props.exactId}
              onChange={(event) => props.onExactIdChange(event.target.value)}
              placeholder="6800"
              testId={`${props.testIdPrefix}.exact_id`}
            />
          </div>
        </div>

        <div className="flex items-end">
          <Checkbox
            checked={props.detailedOutput}
            onChange={props.onDetailedOutputChange}
            label={t('profile.sessions.filter.details')}
            description={t('profile.sessions.filter.details_hint')}
            testId={`${props.testIdPrefix}.details`}
            className="w-full"
          />
        </div>

        <div className="md:col-span-2">
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.search')}</div>
          <div className="mt-1">
            <Input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder={t('profile.sessions.search.placeholder')}
              testId={`${props.testIdPrefix}.search`}
            />
          </div>
          <div className="mt-1 text-xs text-faint">{t('profile.sessions.search.hint')}</div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.user_agent')}</div>
          <div className="mt-1">
            <Input
              value={props.userAgent}
              onChange={(event) => props.onUserAgentChange(event.target.value)}
              placeholder={t('profile.sessions.filter.user_agent.placeholder')}
              testId={`${props.testIdPrefix}.user_agent`}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.client_version')}</div>
          <div className="mt-1">
            <Input
              value={props.clientVersion}
              onChange={(event) => props.onClientVersionChange(event.target.value)}
              placeholder={t('profile.sessions.filter.client_version.placeholder')}
              testId={`${props.testIdPrefix}.client_version`}
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="text-xs font-medium text-muted">{t('profile.sessions.filter.token')}</div>
          <div className="mt-1">
            <Input
              value={props.tokenFragment}
              onChange={(event) => props.onTokenFragmentChange(event.target.value)}
              placeholder={t('profile.sessions.filter.token.placeholder')}
              testId={`${props.testIdPrefix}.token`}
            />
          </div>
          <div className="mt-1 text-xs text-faint">{t('profile.sessions.filter.token_hint')}</div>
        </div>
      </div>
    </div>
  );
}

export function SessionsEmptyState(props: {
  hasFilters: boolean;
  testIdPrefix: string;
  onClearFilters: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="py-8 text-center text-sm text-muted" data-testid={`${props.testIdPrefix}.empty`}>
      <div>{props.hasFilters ? t('profile.sessions.empty_filtered') : t('profile.sessions.empty')}</div>
      {props.hasFilters ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={props.onClearFilters} testId={`${props.testIdPrefix}.clear_filters`}>
            {t('common.clear_filters')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
