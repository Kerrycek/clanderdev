import type { Node } from '../../../lib/api/nodes';
import type { Environment, Location } from '../../../lib/api/oom';

export function safeNumber(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i <= 0) return undefined;
  return i;
}

type SmartKey =
  | 'id'
  | 'q'
  | 'vps'
  | 'user'
  | 'node'
  | 'location'
  | 'environment'
  | 'rule'
  | 'cgroup'
  | 'since'
  | 'until';

export function canonicalKey(raw: string): SmartKey | null {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!k) return null;

  if (['id', '#', 'oom', 'report'].includes(k)) return 'id';
  if (['q', 'query', 'search', 'text'].includes(k)) return 'q';
  if (['vps', 'vm', 'host'].includes(k)) return 'vps';
  if (['user', 'owner', 'login'].includes(k)) return 'user';
  if (['node', 'server'].includes(k)) return 'node';
  if (['location', 'loc'].includes(k)) return 'location';
  if (['environment', 'env'].includes(k)) return 'environment';
  if (['rule', 'oom_rule'].includes(k)) return 'rule';
  if (['cgroup'].includes(k)) return 'cgroup';
  if (['since', 'after', 'from'].includes(k)) return 'since';
  if (['until', 'before', 'to'].includes(k)) return 'until';

  return null;
}

export function parseDateTimeLocalValue(
  input: string,
  opts: { endOfDay?: boolean } = {},
): string | null {
  const value = input.trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return opts.endOfDay ? `${value}T23:59` : `${value}T00:00`;
  }
  return null;
}

export function nodeLabel(node: Node): string {
  return node.domain_name ? String(node.domain_name) : `#${node.id}`;
}

export function envLabel(environment: Environment): string {
  return environment.label ? String(environment.label) : `#${environment.id}`;
}

export function locLabel(location: Location): string {
  return location.label ? String(location.label) : `#${location.id}`;
}

export function ruleVariant(action?: string): 'neutral' | 'warn' {
  return action === 'ignore' ? 'neutral' : 'warn';
}

export function ruleLabelKey(action?: string): string {
  if (action === 'ignore') return 'oom.rule.ignore';
  if (action === 'notify') return 'oom.rule.notify';
  return 'oom.rule.implicit';
}

export function resolveOptionId<T extends { id: number }>(
  list: T[],
  value: string,
  label: (item: T) => string,
): { id: number } | { err: 'none' | 'ambiguous' } {
  const needle = value.trim().toLowerCase();
  if (!needle) return { err: 'none' };

  const idMatch = list.find((item) => String(item.id) === needle);
  if (idMatch) return { id: Number(idMatch.id) };

  const exact = list.filter((item) => label(item).trim().toLowerCase() === needle);
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) return { id: Number(onlyExact.id) };
  if (exact.length > 1) return { err: 'ambiguous' };

  const partial = list.filter((item) => label(item).trim().toLowerCase().includes(needle));
  const [onlyPartial] = partial;
  if (partial.length === 1 && onlyPartial) return { id: Number(onlyPartial.id) };
  if (partial.length > 1) return { err: 'ambiguous' };
  return { err: 'none' };
}
