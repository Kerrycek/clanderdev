export type AppMode = 'user' | 'admin';

/**
 * Extract the route suffix after `/app` or `/admin`.
 *
 * Examples:
 * - `/app/vps/1` -> `/vps/1`
 * - `/admin` -> ``
 * - `/admin/nodes` -> `/nodes`
 */
export function extractAppModeRestPath(pathname: string): string {
  const p = pathname || '';
  if (p === '/app') return '';
  if (p.startsWith('/app/')) return p.slice('/app'.length);
  if (p === '/admin') return '';
  if (p.startsWith('/admin/')) return p.slice('/admin'.length);
  return p;
}

function matchesPathPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function rewritePrefixedPath(path: string, fromPrefix: string, toPrefix: string): string | null {
  if (!matchesPathPrefix(path, fromPrefix)) return null;
  return `${toPrefix}${path.slice(fromPrefix.length)}`;
}

function rewriteAdminPathForUserScope(rest: string): string {
  const userNamespacesPath = rewritePrefixedPath(rest, '/user-namespaces', '/profile/user-namespaces');
  if (userNamespacesPath) return userNamespacesPath;

  if (matchesPathPrefix(rest, '/networking') || matchesPathPrefix(rest, '/ip-addresses')) {
    return '/networking';
  }

  if (rest === '/incidents/new') return '/incidents';

  if (matchesPathPrefix(rest, '/payments')) return '/payments';

  const adminOnlyPrefixes = [
    '/nodes',
    '/migration-plans',
    '/admin-info',
    '/cluster',
    '/users',
    '/mailer',
    '/content',
    '/audit',
  ];

  if (adminOnlyPrefixes.some((prefix) => matchesPathPrefix(rest, prefix))) {
    return '';
  }

  return rest;
}

function rewriteUserPathForAdminScope(rest: string): string {
  const adminNamespacesPath = rewritePrefixedPath(rest, '/profile/user-namespaces', '/user-namespaces');
  if (adminNamespacesPath) return adminNamespacesPath;

  if (rest === '/payments') return '/payments';

  return rest;
}

/**
 * Compute the URL to the "other" app scope while preserving the route suffix.
 *
 * This is only
 * about switching between:
 * - My view (`/app`)
 * - All objects (`/admin`)
 *
 * When the current page exists only in one scope, rewrite to the closest safe route
 * or fall back to the dashboard in the target scope.
 */
export function computeOtherModeUrl(opts: {
  mode: AppMode;
  pathname: string;
  search?: string;
  hash?: string;
}): string {
  const rest = extractAppModeRestPath(opts.pathname);
  const search = opts.search ?? '';
  const hash = opts.hash ?? '';

  if (opts.mode === 'admin') {
    const targetRest = rewriteAdminPathForUserScope(rest);
    const safeSearch = targetRest ? search : '';
    return `/app${targetRest}${safeSearch}${hash}`;
  }

  const targetRest = rewriteUserPathForAdminScope(rest);
  return `/admin${targetRest}${search}${hash}`;
}
