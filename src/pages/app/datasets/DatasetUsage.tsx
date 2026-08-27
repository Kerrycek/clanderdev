import { useMemo } from 'react';

import { useI18n } from '../../../app/i18n';
import { StackedBar } from '../../../components/ui/StackedBar';
import { formatMiB } from '../../../lib/format';
import { usageSeverityFromRatio } from '../../../lib/usage';
import { datasetUsageBreakdown } from './DatasetUsageModel';

export function DatasetUsage(props: { used?: number; refquota?: number; avail?: number }) {
  const { t } = useI18n();
  const used = typeof props.used === 'number' && Number.isFinite(props.used) ? props.used : undefined;
  const quota =
    typeof props.refquota === 'number' && Number.isFinite(props.refquota) && props.refquota > 0
      ? props.refquota
      : undefined;
  const usage = useMemo(() => datasetUsageBreakdown(props), [props.avail, props.refquota, props.used]);

  const segments = useMemo(() => {
    if (usage === null) {
      return [{ value: 1, variant: 'neutral' as const, title: t('datasets.usage.no_data') }];
    }

    return [
      {
        value: usage.used,
        variant: usageSeverityFromRatio(usage.ratio),
        title: t('datasets.usage.used_mib', { mib: usage.used.toFixed(0) }),
      },
      {
        value: usage.free,
        variant: 'neutral' as const,
        title: t('datasets.usage.free_mib', { mib: usage.free.toFixed(0) }),
      },
    ];
  }, [t, usage]);

  return (
    <div className="space-y-1">
      <StackedBar ariaLabel={t('datasets.usage.aria_label')} segments={segments} />
      <div className="flex items-center justify-between text-xs text-faint">
        <span>{used !== undefined ? formatMiB(used) : t('common.na')}</span>
        <span>{quota !== undefined ? formatMiB(quota) : '∞'}</span>
      </div>
    </div>
  );
}
