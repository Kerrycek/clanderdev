import { dateToAdminDateTimeInput, localInputToIso } from '../../lib/datetimeLocal';

export type LifetimeKind = 'vps' | 'user';
export type SnoozePreset = '1w' | '2w' | 'custom' | 'dont';

export function stateHelpKey(state: string): string | null {
  const normalized = state.trim();
  if (normalized === 'active') return 'lifetimes.help.active';
  if (normalized === 'suspended') return 'lifetimes.help.suspended';
  if (normalized === 'soft_delete') return 'lifetimes.help.soft_delete';
  if (normalized === 'hard_delete') return 'lifetimes.help.hard_delete';
  if (normalized === 'deleted') return 'lifetimes.help.deleted';
  return null;
}

export function snoozeIso(
  preset: SnoozePreset,
  customLocal: string,
): { iso: string | null; valid: boolean } {
  const now = Date.now();
  if (preset === '1w') return { iso: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(), valid: true };
  if (preset === '2w') return { iso: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(), valid: true };
  if (preset === 'dont') return { iso: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(), valid: true };
  if (!customLocal.trim()) return { iso: null, valid: false };

  const parsed = localInputToIso(customLocal);
  return parsed.valid && parsed.iso
    ? { iso: parsed.iso, valid: true }
    : { iso: null, valid: false };
}

export function normalizeStateLogValue<T>(value: unknown, ...keys: string[]): T | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key] as T;
  }
  return undefined;
}

export function softDeleteExpirationInput(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setSeconds(0, 0);
  return dateToAdminDateTimeInput(date);
}
