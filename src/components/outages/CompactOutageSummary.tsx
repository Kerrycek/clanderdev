import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useI18n } from '../../app/i18n';
import { fetchOutageEntities, type Outage, type OutageEntity } from '../../lib/api/public';
import { outageBadges } from '../../lib/outageBadges';
import { formatDateTime } from '../../lib/time';
import { pickTranslation } from '../../lib/translations';
import { dotVariantFromBadgeVariant } from '../../lib/variantMap';
import { Badge } from '../ui/Badge';
import { clsx } from '../ui/clsx';
import { StatusDot } from '../ui/StatusDot';
import { toneSurfaceClass, type ToneVariant } from '../ui/tone';

const VISIBLE_SYSTEMS = 2;

function entityLabel(entity: OutageEntity): string {
  return entity.label || `${entity.name}${entity.entity_id ? ` #${entity.entity_id}` : ''}`;
}

function durationLabel(
  minutes: number,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (hours > 0 && rest > 0) return t('public.outage.duration.hours_minutes', { hours, minutes: rest });
  if (hours > 0) return t('public.outage.duration.hours', { count: hours });
  return t('public.outage.duration.minutes', { count: rest });
}

function toneVariant(variant: ReturnType<typeof outageBadges>['primaryVariant']): ToneVariant {
  return variant === 'black' ? 'neutral' : variant;
}

export function CompactOutageSummary(props: { outage: Outage; to: string }) {
  const i18n = useI18n();
  const summary = pickTranslation(props.outage, 'summary', i18n.preferredLanguageCodes);
  const badges = outageBadges(props.outage, i18n.t);
  const dotVariant = dotVariantFromBadgeVariant(badges.primaryVariant);
  const entitiesQ = useQuery({
    queryKey: ['outages', props.outage.id, 'entities'],
    queryFn: async () => (await fetchOutageEntities(props.outage.id)).data,
    staleTime: 5 * 60_000,
  });
  const entities = entitiesQ.data ?? [];
  const visibleEntities = entities.slice(0, VISIBLE_SYSTEMS);
  const hiddenEntityCount = Math.max(0, entities.length - visibleEntities.length);

  return (
    <article
      className={clsx('border-l-4 px-3 py-2.5', toneSurfaceClass(toneVariant(badges.primaryVariant)))}
      data-outage-id={props.outage.id}
      data-testid="outage.compact-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot variant={dotVariant} ariaLabel={badges.lifecycle.label} />
          <Link to={props.to} className="min-w-0 font-medium text-fg hover:underline">
            {summary ?? i18n.t('public.outage.fallback_title', { id: props.outage.id })}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={badges.lifecycle.variant}>{badges.lifecycle.label}</Badge>
          {badges.type ? <Badge variant={badges.type.variant}>{badges.type.label}</Badge> : null}
          {badges.impact ? <Badge variant={badges.impact.variant}>{badges.impact.label}</Badge> : null}
          {props.outage.affected ? <Badge variant="warn">{i18n.t('public.outage.affected')}</Badge> : null}
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <div className="flex gap-1.5">
          <dt className="font-medium text-muted">{i18n.t('public.outage.field.begins')}</dt>
          <dd>{formatDateTime(props.outage.begins_at)}</dd>
        </div>
        {props.outage.duration != null && Number.isFinite(props.outage.duration) ? (
          <div className="flex gap-1.5">
            <dt className="font-medium text-muted">{i18n.t('public.outage.field.duration')}</dt>
            <dd>{durationLabel(props.outage.duration, i18n.t)}</dd>
          </div>
        ) : null}
        {props.outage.finished_at ? (
          <div className="flex gap-1.5">
            <dt className="font-medium text-muted">{i18n.t('public.outage.field.finished')}</dt>
            <dd>{formatDateTime(props.outage.finished_at)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs" data-testid="outage.compact-summary.systems">
        <span className="font-medium text-muted">{i18n.t('public.outage.field.systems')}</span>
        {entitiesQ.isLoading ? (
          <span className="text-muted">{i18n.t('public.outage.entities.loading')}</span>
        ) : entitiesQ.isError || entities.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            {visibleEntities.map((entity) => (
              <Badge key={entity.id} variant="neutral">{entityLabel(entity)}</Badge>
            ))}
            {hiddenEntityCount > 0 ? (
              <Badge variant="neutral">{i18n.t('public.outage.entities.more', { count: hiddenEntityCount })}</Badge>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
