export function safeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.floor(number);
}

type SmartKey = 'id' | 'q' | 'user' | 'session' | 'object' | 'object_id' | 'event';

export function canonicalKey(raw: string): SmartKey | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;

  if (key === 'id' || key === '#') return 'id';
  if (key === 'q' || key === 'search' || key === 'text' || key === 'query') return 'q';
  if (key === 'user' || key === 'u' || key === 'login') return 'user';
  if (key === 'session' || key === 'sess' || key === 'user_session' || key === 's') return 'session';
  if (key === 'object' || key === 'obj' || key === 'type' || key === 'class') return 'object';
  if (key === 'object_id' || key === 'obj_id' || key === 'oid') return 'object_id';
  if (key === 'event' || key === 'event_type' || key === 'et') return 'event';
  return null;
}
