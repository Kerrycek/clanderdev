import type { DatasetExpansion } from '../../../lib/api/datasets';

export type DatasetExpansionCreateMode = 'create' | 'register';

export type DatasetExpansionNewFormState = {
  mode: DatasetExpansionCreateMode;
  addedSpaceGiB: string;
  originalRefquotaGiB: string;
  enableNotifications: boolean;
  enableShrink: boolean;
  stopVps: boolean;
  maxOverDays: string;
};

export type DatasetExpansionEditFormState = {
  enableNotifications: boolean;
  enableShrink: boolean;
  stopVps: boolean;
  maxOverDays: string;
};

export function defaultDatasetExpansionForm(
  mode: DatasetExpansionCreateMode,
): DatasetExpansionNewFormState {
  return {
    mode,
    addedSpaceGiB: '20',
    originalRefquotaGiB: '',
    enableNotifications: true,
    enableShrink: true,
    stopVps: true,
    maxOverDays: '30',
  };
}

export function datasetExpansionEditForm(
  expansion: DatasetExpansion,
): DatasetExpansionEditFormState {
  return {
    enableNotifications: expansion.enable_notifications !== false,
    enableShrink: expansion.enable_shrink !== false,
    stopVps: expansion.stop_vps !== false,
    maxOverDays:
      typeof expansion.max_over_refquota_seconds === 'number'
      && Number.isFinite(expansion.max_over_refquota_seconds)
        ? String(Math.round(expansion.max_over_refquota_seconds / 86_400))
        : '',
  };
}

export function parseExpansionGiB(raw: string): number | null {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1024);
}

export function parseExpansionDays(raw: string): number | undefined | null {
  const text = String(raw).trim();
  if (!text) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 86_400);
}
