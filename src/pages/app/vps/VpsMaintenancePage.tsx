import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../../../app/i18n';
import { useChrome } from '../../../components/layout/ChromeContext';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Spinner } from '../../../components/ui/Spinner';
import { fetchVpsMaintenanceWindows, updateVpsMaintenanceWindow, type VpsMaintenanceWindow } from '../../../lib/api/vpsMaintenance';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import { gateVpsMutation } from '../../../lib/gates/vps';
import { preflightVpsNotBusy } from './vpsPreflight';
import { useVps } from './VpsContext';

const WEEKDAYS: Array<{ weekday: number; key: string; shortKey: string }> = [
  { weekday: 1, key: 'common.weekday.mon', shortKey: 'common.weekday_short.mon' },
  { weekday: 2, key: 'common.weekday.tue', shortKey: 'common.weekday_short.tue' },
  { weekday: 3, key: 'common.weekday.wed', shortKey: 'common.weekday_short.wed' },
  { weekday: 4, key: 'common.weekday.thu', shortKey: 'common.weekday_short.thu' },
  { weekday: 5, key: 'common.weekday.fri', shortKey: 'common.weekday_short.fri' },
  { weekday: 6, key: 'common.weekday.sat', shortKey: 'common.weekday_short.sat' },
  { weekday: 7, key: 'common.weekday.sun', shortKey: 'common.weekday_short.sun' },
];

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function minutesToHM(minutes: number) {
  const v = clampInt(minutes, 0, 24 * 60);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return { h, m };
}

function hmToMinutes(h: number, m: number) {
  const hh = clampInt(h, 0, 24);
  const mm = clampInt(m, 0, 59);
  const v = hh * 60 + mm;
  return clampInt(v, 0, 24 * 60);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function TimePick(props: {
  valueMinutes: number;
  onChange: (minutes: number) => void;
  allow24?: boolean;
  stepMinutes?: number;
  disabled?: boolean;
  testId?: string;
}) {
  const step = props.stepMinutes ?? 5;
  const { h, m } = minutesToHM(props.valueMinutes);

  const maxH = props.allow24 ? 24 : 23;

  const hours = Array.from({ length: maxH + 1 }, (_, i) => i);
  const mins = Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);

  return (
    <div className="flex items-center gap-2">
      <Select
        testId={props.testId ? `${props.testId}.h` : undefined}
        value={String(h)}
        disabled={props.disabled}
        onChange={(e) => {
          const nh = Number(e.target.value);
          const next = nh === 24 ? hmToMinutes(24, 0) : hmToMinutes(nh, m);
          props.onChange(next);
        }}
        className="w-24"
      >
        {hours.map((hh) => (
          <option key={hh} value={hh}>
            {pad2(hh)}
          </option>
        ))}
      </Select>
      <span className="text-sm text-muted">:</span>
      <Select
        testId={props.testId ? `${props.testId}.m` : undefined}
        value={String(h === 24 ? 0 : m)}
        disabled={props.disabled || h === 24}
        onChange={(e) => {
          const nm = Number(e.target.value);
          props.onChange(hmToMinutes(h, nm));
        }}
        className="w-24"
      >
        {mins.map((mm) => (
          <option key={mm} value={mm}>
            {pad2(mm)}
          </option>
        ))}
      </Select>
    </div>
  );
}

type DraftDay = {
  weekday: number;
  is_open: boolean;
  opens_at: number;
  closes_at: number;
};

function normalizeDay(w: VpsMaintenanceWindow | undefined, weekday: number): DraftDay {
  const isOpen = w?.is_open === true;
  const opens = typeof w?.opens_at === 'number' ? w.opens_at : 0;
  const closes = typeof w?.closes_at === 'number' ? w.closes_at : 24 * 60;
  return {
    weekday,
    is_open: isOpen,
    opens_at: opens,
    closes_at: closes,
  };
}

function dayEqual(a: DraftDay, b: DraftDay): boolean {
  return a.weekday === b.weekday && a.is_open === b.is_open && a.opens_at === b.opens_at && a.closes_at === b.closes_at;
}

export function VpsMaintenancePage() {
  const chrome = useChrome();
  const qc = useQueryClient();
  const { t } = useI18n();

  const { vps, canMutateVps, refetchChains, vpsRef, busyTransaction, busyLocalLock } = useVps();
  const vpsId = vps.id;
  const objectLabel = String((vps as any).hostname ?? '') || `#${vpsId}`;

  const q = useQuery({
    queryKey: ['vps', vpsId, 'maintenance_windows'],
    queryFn: async () => (await fetchVpsMaintenanceWindows(vpsId)).data,
    refetchOnWindowFocus: false,
  });

  const baselineByWeekday = useMemo(() => {
    const map = new Map<number, VpsMaintenanceWindow>();
    for (const w of q.data ?? []) {
      if (typeof (w as any).weekday !== 'number') continue;
      map.set((w as any).weekday, w);
    }
    return map;
  }, [q.data]);

  const baselineDraft = useMemo(() => {
    const out: DraftDay[] = [];
    for (const wd of WEEKDAYS) {
      out.push(normalizeDay(baselineByWeekday.get(wd.weekday), wd.weekday));
    }
    return out;
  }, [baselineByWeekday]);

  const [draft, setDraft] = useState<DraftDay[] | null>(null);

  useEffect(() => {
    // Reset draft when switching VPS
    setDraft(null);
  }, [vpsId]);

  useEffect(() => {
    if (!q.data) return;
    if (draft !== null) return;
    setDraft(baselineDraft);
  }, [baselineDraft, draft, q.data]);

  const effective = draft ?? baselineDraft;

  const dirtyWeekdays = useMemo(() => {
    const changed: number[] = [];
    for (const d of effective) {
      const b = normalizeDay(baselineByWeekday.get(d.weekday), d.weekday);
      if (!dayEqual(d, b)) changed.push(d.weekday);
    }
    return changed;
  }, [baselineByWeekday, effective]);

  const dirty = dirtyWeekdays.length > 0;

  const preflight = async () => {
    await preflightVpsNotBusy({ vpsId, t, knownBusy: busyTransaction || busyLocalLock });
  };

  const saveM = useMutation({
    mutationFn: async () => {
      if (!canMutateVps) throw new Error(t('gate.blocked.permission.body'));
      await preflight();

      const changedDays = effective.filter((d) => dirtyWeekdays.includes(d.weekday));
      const results: Array<{ weekday: number; meta?: any }> = [];

      for (const d of changedDays) {
        const params: Record<string, unknown> = {
          is_open: d.is_open,
        };
        if (d.is_open) {
          params['opens_at'] = d.opens_at;
          params['closes_at'] = d.closes_at;
        }

        const r = await updateVpsMaintenanceWindow(vpsId, d.weekday, params);
        results.push({ weekday: d.weekday, meta: (r as any).meta });
      }

      return results;
    },
    onMutate: () => {
      chrome.acquireLocalLock(vpsRef);
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ['vps', vpsId, 'maintenance_windows'] });
      setDraft(null);

      for (const r of results) {
        const asId = getMetaActionStateId(r.meta);
        if (asId !== undefined) {
          chrome.trackActionState(asId, {
            actionLabelKey: 'action.vps.maintenance.save.label',
            objectLabel,
            object: vpsRef,
          });
        }
      }

      refetchChains();
    },
    onError: (e: any) => {
      if (e?.code === 'BUSY') chrome.openTasks();
    },
    onSettled: () => {
      chrome.releaseLocalLock(vpsRef);
    },
  });

  const busyLocal = busyLocalLock || saveM.isPending;
  const gate = gateVpsMutation({ vps, busyLocal, busyTransaction });

  const setAllOpen = () => {
    setDraft((prev) =>
      (prev ?? baselineDraft).map((d) => ({ ...d, is_open: true, opens_at: 0, closes_at: 24 * 60 }))
    );
  };

  const setAllClosed = () => {
    setDraft((prev) => (prev ?? baselineDraft).map((d) => ({ ...d, is_open: false })));
  };

  const updateDay = (weekday: number, patch: Partial<DraftDay>) => {
    setDraft((prev) => {
      const base = prev ?? baselineDraft;
      return base.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d));
    });
  };

  return (
    <div data-testid="vps.maintenance.page" className="space-y-4">
      <Card testId="vps.maintenance.card">
        <CardHeader
          title={t('vps.maintenance.title')}
          subtitle={t('vps.maintenance.subtitle_advanced')}
          actions={canMutateVps ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                testId="vps.maintenance.reset"
                variant="secondary"
                size="sm"
                disabled={!dirty || saveM.isPending}
                onClick={() => setDraft(null)}
              >
                {t('common.reset')}
              </Button>
              <ActionButton
                testId="vps.maintenance.save"
                size="sm"
                disabled={!dirty || !gate.allowed}
                disabledReason={!gate.allowed ? gate.reason : undefined}
                loading={saveM.isPending}
                onClick={() => saveM.mutate()}
              >
                {dirty ? t('vps.maintenance.save_changes', { n: dirtyWeekdays.length }) : t('vps.maintenance.save_changes_empty')}
              </ActionButton>
            </div>
          ) : null}
        />

        <CardBody>
          {!canMutateVps ? (
            <Alert title={t('gate.blocked.permission.title')} variant="warn">
              <div data-testid="vps.maintenance.read_only">{t('gate.blocked.permission.body')}</div>
            </Alert>
          ) : null}

          {canMutateVps && !gate.allowed ? (
            <Alert title={t(gate.reason.titleKey)} variant="warn">
              <div className="space-y-2">
                {gate.reason.descriptionKey ? <div>{t(gate.reason.descriptionKey)}</div> : null}
                <div>
                  <Button variant="secondary" size="sm" onClick={chrome.openTasks}>
                    {t('common.open_tasks')}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}

          <div className={!gate.allowed ? 'mt-4' : ''}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted">
                {dirty ? t('vps.maintenance.unsaved', { n: dirtyWeekdays.length }) : t('vps.maintenance.saved')}
              </div>
              {canMutateVps ? <div className="flex flex-wrap items-center gap-2">
                <Button
                  testId="vps.maintenance.allow_anytime"
                  variant="secondary"
                  size="sm"
                  disabled={!gate.allowed || saveM.isPending}
                  onClick={setAllOpen}
                >
                  {t('vps.maintenance.allow_anytime')}
                </Button>
                <Button
                  testId="vps.maintenance.disallow_all"
                  variant="secondary"
                  size="sm"
                  disabled={!gate.allowed || saveM.isPending}
                  onClick={setAllClosed}
                >
                  {t('vps.maintenance.disallow_all')}
                </Button>
              </div> : null}
            </div>

            {q.isLoading ? (
              <div className="mt-4">
                <Spinner label={t('common.loading')} />
              </div>
            ) : q.error ? (
              <Alert title={t('vps.maintenance.load_error')} variant="danger" className="mt-4">
                {String((q.error as any)?.message ?? q.error)}
              </Alert>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-table-md w-full table-list">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-3">{t('vps.maintenance.field.day')}</th>
                      <th className="px-4 py-3">{t('vps.maintenance.field.open')}</th>
                      <th className="px-4 py-3">{t('vps.maintenance.field.opens')}</th>
                      <th className="px-4 py-3">{t('vps.maintenance.field.closes')}</th>
                      <th className="px-4 py-3">{t('vps.maintenance.field.summary')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effective.map((d) => {
                      const labelKey = WEEKDAYS.find((w) => w.weekday === d.weekday)?.key;

                      const label = labelKey ? t(labelKey) : String(d.weekday);
                      const isDirty = dirtyWeekdays.includes(d.weekday);

                      return (
                        <tr
                          key={d.weekday}
                          data-testid={`vps.maintenance.day.${d.weekday}`}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-4 py-3 font-medium">
                            {label}{' '}
                            {isDirty ? <span className="ml-2 text-xs text-muted">{t('common.changed')}</span> : null}
                          </td>
                          <td className="px-4 py-3">
                            {canMutateVps ? <label className="flex items-center gap-2 text-sm">
                              <input
                                data-testid={`vps.maintenance.day.${d.weekday}.open`}
                                type="checkbox"
                                checked={d.is_open}
                                disabled={!gate.allowed || saveM.isPending}
                                onChange={(e) => {
                                  updateDay(d.weekday, { is_open: e.target.checked });
                                }}
                                className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-2 focus:ring-focus/35 focus:ring-offset-2 focus:ring-offset-bg disabled:opacity-60"
                              />
                              <span>{d.is_open ? t('vps.maintenance.open') : t('vps.maintenance.closed')}</span>
                            </label> : <span className="text-sm">{d.is_open ? t('vps.maintenance.open') : t('vps.maintenance.closed')}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {canMutateVps ? <TimePick
                              testId={`vps.maintenance.day.${d.weekday}.opens`}
                              valueMinutes={d.opens_at}
                              onChange={(m) => updateDay(d.weekday, { opens_at: m })}
                              disabled={!d.is_open || !gate.allowed || saveM.isPending}
                              stepMinutes={5}
                            /> : <span className="font-mono text-sm">{d.is_open ? `${pad2(minutesToHM(d.opens_at).h)}:${pad2(minutesToHM(d.opens_at).m)}` : '—'}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {canMutateVps ? <TimePick
                              testId={`vps.maintenance.day.${d.weekday}.closes`}
                              valueMinutes={d.closes_at}
                              onChange={(m) => updateDay(d.weekday, { closes_at: m })}
                              disabled={!d.is_open || !gate.allowed || saveM.isPending}
                              stepMinutes={5}
                              allow24
                            /> : <span className="font-mono text-sm">{d.is_open ? `${pad2(minutesToHM(d.closes_at).h)}:${pad2(minutesToHM(d.closes_at).m)}` : '—'}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {d.is_open
                              ? t('vps.maintenance.summary_open', {
                                  opens: `${pad2(minutesToHM(d.opens_at).h)}:${pad2(minutesToHM(d.opens_at).m)}`,
                                  closes: `${pad2(minutesToHM(d.closes_at).h)}:${pad2(minutesToHM(d.closes_at).m)}`,
                                })
                              : t('vps.maintenance.summary_closed')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {saveM.error ? (
              <Alert title={t('vps.maintenance.save_error')} variant="danger" className="mt-4">
                {String((saveM.error as any)?.message ?? saveM.error)}
              </Alert>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
