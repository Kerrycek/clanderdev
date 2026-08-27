const EXACT_DEV_ORIGIN = 'https://dev.crucio.cz';

function route(id, path, options = {}) {
  return Object.freeze({
    id,
    path,
    reportPath: options.reportPath ?? path,
    expectedPath: options.expectedPath ?? path,
    expectedTestId: options.expectedTestId,
    roles: options.roles ?? ['user', 'support', 'admin'],
  });
}

export function assertLiveRouteSweepConfig({ baseURL, apiUrl, token }) {
  const checkedBaseURL = assertExactDevOrigin(baseURL, 'E2E_BASE_URL');
  const checkedApiUrl = assertExactDevOrigin(apiUrl, 'E2E_LIVE_API_URL');

  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('E2E_LIVE_SESSION_TOKEN(_FILE) must contain a non-empty token.');
  }

  return { baseURL: checkedBaseURL, apiUrl: checkedApiUrl, token: token.trim() };
}

export function assertExactDevOrigin(raw, label = 'URL') {
  let url;
  try {
    url = new URL(String(raw ?? ''));
  } catch {
    throw new Error(`${label} must be exactly ${EXACT_DEV_ORIGIN}.`);
  }

  const exact =
    url.protocol === 'https:' &&
    url.hostname === 'dev.crucio.cz' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';

  if (!exact) throw new Error(`${label} must be exactly ${EXACT_DEV_ORIGIN}.`);
  return EXACT_DEV_ORIGIN;
}

export function isAdminCapableLevel(level) {
  return Number.isFinite(Number(level)) && Number(level) >= 21;
}

export const PUBLIC_ROUTES = Object.freeze([
  route('public.overview', '/', { roles: ['anonymous'] }),
  route('public.outages', '/outages', { roles: ['anonymous'] }),
  route('public.news', '/news', { roles: ['anonymous'] }),
  route('public.security-advisories', '/security-advisories', { roles: ['anonymous'] }),
  route('public.not-found', '/__live-route-sweep-not-found__', { roles: ['anonymous'] }),
]);

export const USER_STATIC_ROUTES = Object.freeze([
  route('app.dashboard', '/app', { expectedTestId: 'app.dashboard.page' }),
  route('app.vps', '/app/vps'),
  route('app.vps.new', '/app/vps/new'),
  route('app.datasets', '/app/datasets'),
  route('app.nas', '/app/nas'),
  route('app.nas.new', '/app/nas/new'),
  route('app.backups', '/app/backups', { expectedTestId: 'backups.page' }),
  route('app.exports', '/app/exports'),
  route('app.dns', '/app/dns', { expectedTestId: 'dns.zones.list' }),
  route('app.networking', '/app/networking'),
  route('app.transactions', '/app/transactions'),
  route('app.transactions.items', '/app/transactions/items', { expectedTestId: 'transactions.items.list' }),
  route('app.action-states', '/app/action-states'),
  route('app.monitoring', '/app/monitoring'),
  route('app.incidents', '/app/incidents', { expectedTestId: 'incidents.list.header' }),
  route('app.incidents.new', '/app/incidents/new'),
  route('app.oom-reports', '/app/oom-reports'),
  route('app.payments', '/app/payments'),
  route('app.requests', '/app/requests'),
  route('app.profile', '/app/profile'),
  route('app.profile.resources', '/app/profile/resources'),
  route('app.profile.security', '/app/profile/security'),
  route('app.profile.mfa', '/app/profile/mfa'),
  route('app.profile.mail', '/app/profile/mail'),
  route('app.profile.keys', '/app/profile/keys'),
  route('app.profile.sessions', '/app/profile/sessions'),
  route('app.profile.metrics', '/app/profile/metrics'),
  route('app.profile.user-data', '/app/profile/user-data'),
  route('app.profile.user-namespaces', '/app/profile/user-namespaces'),
  route('app.profile.user-namespaces.namespaces', '/app/profile/user-namespaces/namespaces'),
  route('app.profile.user-namespaces.maps', '/app/profile/user-namespaces/maps'),
]);

export const ADMIN_STATIC_ROUTES = Object.freeze([
  route('admin.dashboard', '/admin', { roles: ['support', 'admin'], expectedTestId: 'app.dashboard.page' }),
  route('admin.outages', '/admin/outages', { roles: ['support', 'admin'] }),
  route('admin.security-advisories', '/admin/security-advisories', { roles: ['admin'] }),
  route('admin.nodes', '/admin/nodes', { roles: ['support', 'admin'] }),
  route('admin.migration-plans', '/admin/migration-plans', { roles: ['support', 'admin'] }),
  route('admin.admin-info', '/admin/admin-info', { roles: ['support', 'admin'] }),
  route('admin.user-namespaces', '/admin/user-namespaces', { roles: ['support', 'admin'] }),
  route('admin.user-namespaces.namespaces', '/admin/user-namespaces/namespaces', { roles: ['support', 'admin'] }),
  route('admin.user-namespaces.maps', '/admin/user-namespaces/maps', { roles: ['support', 'admin'] }),
  route('admin.cluster.summary', '/admin/cluster/summary', { roles: ['support', 'admin'] }),
  route('admin.cluster.environments', '/admin/cluster/environments', { roles: ['support', 'admin'] }),
  route('admin.cluster.locations', '/admin/cluster/locations', { roles: ['support', 'admin'] }),
  route('admin.cluster.os-templates', '/admin/cluster/os-templates', { roles: ['support', 'admin'] }),
  route('admin.cluster.networks', '/admin/cluster/networks', { roles: ['support', 'admin'] }),
  route('admin.cluster.resource-packages', '/admin/cluster/resource-packages', { roles: ['support', 'admin'] }),
  route('admin.cluster.system-config', '/admin/cluster/system-config', { roles: ['support', 'admin'] }),
  route('admin.cluster.dns-resolvers', '/admin/cluster/dns-resolvers', { roles: ['support', 'admin'] }),
  route('admin.cluster.dns-servers', '/admin/cluster/dns-servers', { roles: ['support', 'admin'] }),
  route('admin.cluster.dns-tsig-keys', '/admin/cluster/dns-tsig-keys', { roles: ['support', 'admin'] }),
  route('admin.users', '/admin/users', { roles: ['support', 'admin'] }),
  route('admin.networking.ip-addresses', '/admin/networking/ip-addresses', { roles: ['support', 'admin'] }),
  route('admin.networking.host-ip-addresses', '/admin/networking/host-ip-addresses', { roles: ['support', 'admin'] }),
  route('admin.networking.ip-address-assignments', '/admin/networking/ip-address-assignments', { roles: ['support', 'admin'] }),
  route('admin.networking.live', '/admin/networking/live', { roles: ['support', 'admin'] }),
  route('admin.networking.traffic-users', '/admin/networking/traffic-users', { roles: ['support', 'admin'] }),
  route('admin.vps', '/admin/vps', { roles: ['support', 'admin'] }),
  route('admin.vps.new', '/admin/vps/new', { roles: ['support', 'admin'] }),
  route('admin.datasets', '/admin/datasets', { roles: ['support', 'admin'] }),
  route('admin.nas', '/admin/nas', { roles: ['support', 'admin'] }),
  route('admin.nas.new', '/admin/nas/new', { roles: ['support', 'admin'] }),
  route('admin.exports', '/admin/exports', { roles: ['support', 'admin'] }),
  route('admin.dns', '/admin/dns', { roles: ['support', 'admin'], expectedTestId: 'dns.zones.list' }),
  route('admin.dns.tsig-keys', '/admin/dns/tsig-keys', { roles: ['support', 'admin'] }),
  route('admin.transactions', '/admin/transactions', { roles: ['support', 'admin'] }),
  route('admin.transactions.items', '/admin/transactions/items', { roles: ['support', 'admin'], expectedTestId: 'transactions.items.list' }),
  route('admin.action-states', '/admin/action-states', { roles: ['support', 'admin'] }),
  route('admin.monitoring', '/admin/monitoring', { roles: ['support', 'admin'] }),
  route('admin.incidents', '/admin/incidents', { roles: ['support', 'admin'], expectedTestId: 'incidents.list.header' }),
  route('admin.incidents.new', '/admin/incidents/new', { roles: ['support', 'admin'] }),
  route('admin.oom-reports', '/admin/oom-reports', { roles: ['support', 'admin'] }),
  route('admin.mailer.templates', '/admin/mailer/templates', { roles: ['support', 'admin'] }),
  route('admin.mailer.mailboxes', '/admin/mailer/mailboxes', { roles: ['support', 'admin'] }),
  route('admin.mailer.recipients', '/admin/mailer/recipients', { roles: ['support', 'admin'] }),
  route('admin.mailer.log', '/admin/mailer/log', { roles: ['support', 'admin'] }),
  route('admin.content.news', '/admin/content/news', { roles: ['support', 'admin'] }),
  route('admin.content.help-boxes', '/admin/content/help-boxes', { roles: ['support', 'admin'] }),
  route('admin.audit', '/admin/audit', { roles: ['support', 'admin'] }),
  route('admin.requests', '/admin/requests', { roles: ['support', 'admin'] }),
  route('admin.payments.incoming', '/admin/payments/incoming', { roles: ['support', 'admin'] }),
  route('admin.profile', '/admin/profile', { roles: ['support', 'admin'] }),
  route('admin.profile.resources', '/admin/profile/resources', { roles: ['support', 'admin'] }),
  route('admin.profile.security', '/admin/profile/security', { roles: ['support', 'admin'] }),
  route('admin.profile.mfa', '/admin/profile/mfa', { roles: ['support', 'admin'] }),
  route('admin.profile.mail', '/admin/profile/mail', { roles: ['support', 'admin'] }),
  route('admin.profile.keys', '/admin/profile/keys', { roles: ['support', 'admin'] }),
  route('admin.profile.sessions', '/admin/profile/sessions', { roles: ['support', 'admin'] }),
  route('admin.profile.metrics', '/admin/profile/metrics', { roles: ['support', 'admin'] }),
  route('admin.profile.user-data', '/admin/profile/user-data', { roles: ['support', 'admin'] }),
  route('admin.profile.user-namespaces', '/admin/profile/user-namespaces', { roles: ['support', 'admin'] }),
  route('admin.profile.user-namespaces.namespaces', '/admin/profile/user-namespaces/namespaces', { roles: ['support', 'admin'] }),
  route('admin.profile.user-namespaces.maps', '/admin/profile/user-namespaces/maps', { roles: ['support', 'admin'] }),
]);

const detail = (key, options) => Object.freeze({
  key,
  ...options,
  discovery: Object.freeze({
    public: 'optional',
    app: 'required',
    admin: 'required',
    ...(options.discovery ?? {}),
  }),
  adminRoles: Object.freeze(options.adminRoles ?? ['support', 'admin']),
});

export const DETAIL_ROUTE_SPECS = Object.freeze([
  detail('vps', {
    env: 'E2E_LIVE_VPS_ID',
    apiPath: '/vpses',
    namespaces: ['vps'],
    paths: [
      '/app/vps/{id}', '/app/vps/{id}/config', '/app/vps/{id}/access', '/app/vps/{id}/network',
      '/app/vps/{id}/storage', '/app/vps/{id}/features', '/app/vps/{id}/maintenance',
      '/app/vps/{id}/lifecycle', '/app/vps/{id}/lifecycle/start', '/app/vps/{id}/lifecycle/stop',
      '/app/vps/{id}/lifecycle/restart', '/app/vps/{id}/lifecycle/lifetime', '/app/vps/{id}/lifecycle/template',
      '/app/vps/{id}/lifecycle/boot', '/app/vps/{id}/lifecycle/reinstall', '/app/vps/{id}/lifecycle/clone',
      '/app/vps/{id}/lifecycle/swap', '/app/vps/{id}/lifecycle/replace', '/app/vps/{id}/lifecycle/migrate',
      '/app/vps/{id}/lifecycle/delete', '/app/vps/{id}/console', '/app/oom-reports/rules/{id}',
      '/admin/vps/{id}', '/admin/vps/{id}/config', '/admin/vps/{id}/access', '/admin/vps/{id}/network',
      '/admin/vps/{id}/storage', '/admin/vps/{id}/features', '/admin/vps/{id}/maintenance',
      '/admin/vps/{id}/lifecycle', '/admin/vps/{id}/lifecycle/start', '/admin/vps/{id}/lifecycle/stop',
      '/admin/vps/{id}/lifecycle/restart', '/admin/vps/{id}/lifecycle/lifetime', '/admin/vps/{id}/lifecycle/template',
      '/admin/vps/{id}/lifecycle/boot', '/admin/vps/{id}/lifecycle/reinstall', '/admin/vps/{id}/lifecycle/clone',
      '/admin/vps/{id}/lifecycle/swap', '/admin/vps/{id}/lifecycle/replace', '/admin/vps/{id}/lifecycle/migrate',
      '/admin/vps/{id}/lifecycle/delete', '/admin/vps/{id}/console', '/admin/oom-reports/rules/{id}',
    ],
  }),
  detail('dataset', {
    env: 'E2E_LIVE_DATASET_ID', apiPath: '/datasets', namespaces: ['dataset'],
    paths: [
      '/app/datasets/{id}', '/app/datasets/{id}/snapshots', '/app/datasets/{id}/downloads',
      '/app/datasets/{id}/exports', '/app/datasets/{id}/plans', '/app/datasets/{id}/expansion',
      '/admin/datasets/{id}', '/admin/datasets/{id}/snapshots', '/admin/datasets/{id}/downloads',
      '/admin/datasets/{id}/exports', '/admin/datasets/{id}/plans', '/admin/datasets/{id}/expansion',
    ],
  }),
  detail('nas-dataset', {
    env: 'E2E_LIVE_NAS_DATASET_ID', apiPath: '/datasets', namespaces: ['dataset'],
    paths: [
      '/app/nas/{id}', '/app/nas/{id}/snapshots', '/app/nas/{id}/downloads', '/app/nas/{id}/exports',
      '/app/nas/{id}/plans', '/app/nas/{id}/expansion', '/admin/nas/{id}', '/admin/nas/{id}/snapshots',
      '/admin/nas/{id}/downloads', '/admin/nas/{id}/exports', '/admin/nas/{id}/plans', '/admin/nas/{id}/expansion',
    ],
  }),
  detail('export', { env: 'E2E_LIVE_EXPORT_ID', apiPath: '/exports', namespaces: ['export'], paths: ['/app/exports/{id}', '/admin/exports/{id}'] }),
  detail('dns-zone', {
    env: 'E2E_LIVE_DNS_ZONE_ID', apiPath: '/dns_zones', namespaces: ['dns_zone'],
    paths: [
      '/app/dns/zones/{id}', '/app/dns/zones/{id}/transfers', '/app/dns/zones/{id}/dnssec',
      '/app/dns/zones/{id}/servers', '/app/dns/zones/{id}/settings', '/app/dns/zones/{id}/logs',
      '/admin/dns/zones/{id}', '/admin/dns/zones/{id}/transfers', '/admin/dns/zones/{id}/dnssec',
      '/admin/dns/zones/{id}/servers', '/admin/dns/zones/{id}/settings', '/admin/dns/zones/{id}/logs',
    ],
  }),
  detail('transaction-chain', { env: 'E2E_LIVE_TRANSACTION_CHAIN_ID', apiPath: '/transaction_chains', namespaces: ['transaction_chain'], paths: ['/app/transactions/{id}', '/admin/transactions/{id}'] }),
  detail('transaction', { env: 'E2E_LIVE_TRANSACTION_ID', apiPath: '/transactions', namespaces: ['transaction'], paths: ['/app/transactions/items/{id}', '/admin/transactions/items/{id}'] }),
  detail('action-state', { env: 'E2E_LIVE_ACTION_STATE_ID', apiPath: '/action_states', namespaces: ['action_state'], paths: ['/app/action-states/{id}', '/admin/action-states/{id}'] }),
  detail('monitoring-event', { env: 'E2E_LIVE_MONITORING_EVENT_ID', apiPath: '/monitored_events', namespaces: ['monitored_event'], paths: ['/app/monitoring/{id}', '/admin/monitoring/{id}'] }),
  detail('incident', { env: 'E2E_LIVE_INCIDENT_ID', apiPath: '/incident_reports', namespaces: ['incident_report'], paths: ['/app/incidents/{id}', '/admin/incidents/{id}'] }),
  detail('registration-request', { env: 'E2E_LIVE_REGISTRATION_REQUEST_ID', apiPath: '/user_request/registrations', namespaces: ['registration'], paths: ['/app/requests/registration/{id}', '/admin/requests/registration/{id}'] }),
  detail('change-request', { env: 'E2E_LIVE_CHANGE_REQUEST_ID', apiPath: '/user_request/changes', namespaces: ['change'], paths: ['/app/requests/change/{id}', '/admin/requests/change/{id}'] }),
  detail('oom-report', { env: 'E2E_LIVE_OOM_REPORT_ID', apiPath: '/oom_reports', namespaces: ['oom_report'], paths: ['/app/oom-reports/{id}', '/app/oom-reports/{id}/stats', '/app/oom-reports/{id}/tasks', '/admin/oom-reports/{id}', '/admin/oom-reports/{id}/stats', '/admin/oom-reports/{id}/tasks'] }),
  detail('user-namespace', { env: 'E2E_LIVE_USER_NAMESPACE_ID', apiPath: '/user_namespaces', namespaces: ['user_namespace'], paths: ['/app/profile/user-namespaces/namespaces/{id}', '/admin/user-namespaces/namespaces/{id}'] }),
  detail('user-namespace-map', { env: 'E2E_LIVE_USER_NAMESPACE_MAP_ID', apiPath: '/user_namespace_maps', namespaces: ['user_namespace_map'], paths: ['/app/profile/user-namespaces/maps/{id}', '/admin/user-namespaces/maps/{id}'] }),
  detail('outage', { env: 'E2E_LIVE_OUTAGE_ID', apiPath: '/outages', namespaces: ['outage'], paths: ['/outages/{id}', '/admin/outages/{id}'] }),
  detail('security-advisory', {
    env: 'E2E_LIVE_SECURITY_ADVISORY_ID',
    apiPath: '/security_advisories',
    namespaces: ['security_advisory'],
    paths: ['/security-advisories/{id}', '/admin/security-advisories/{id}'],
    adminRoles: ['admin'],
  }),
  detail('node', { env: 'E2E_LIVE_NODE_ID', apiPath: '/nodes', namespaces: ['node'], paths: ['/admin/nodes/{id}'] }),
  detail('migration-plan', { env: 'E2E_LIVE_MIGRATION_PLAN_ID', apiPath: '/migration_plans', namespaces: ['migration_plan'], paths: ['/admin/migration-plans/{id}'] }),
  detail('user', { env: 'E2E_LIVE_USER_ID', apiPath: '/users', namespaces: ['user'], paths: ['/admin/users/{id}', '/admin/users/{id}/resources', '/admin/users/{id}/resources/usage', '/admin/users/{id}/payments', '/admin/users/{id}/environment-configs', '/admin/users/{id}/security', '/admin/users/{id}/mfa', '/admin/users/{id}/sessions', '/admin/users/{id}/keys', '/admin/users/{id}/metrics', '/admin/users/{id}/mail', '/admin/users/{id}/user-data', '/admin/users/{id}/history'] }),
  detail('ip-address', { env: 'E2E_LIVE_IP_ADDRESS_ID', apiPath: '/ip_addresses', namespaces: ['ip_address'], paths: ['/admin/networking/ip-addresses/{id}'] }),
  detail('network', { env: 'E2E_LIVE_NETWORK_ID', apiPath: '/networks', namespaces: ['network'], paths: ['/admin/cluster/networks/{id}'] }),
  detail('resource-package', { env: 'E2E_LIVE_RESOURCE_PACKAGE_ID', apiPath: '/cluster_resource_packages', namespaces: ['cluster_resource_package'], paths: ['/admin/cluster/resource-packages/{id}'] }),
  detail('mail-template', { env: 'E2E_LIVE_MAIL_TEMPLATE_ID', apiPath: '/mail_templates', namespaces: ['mail_template'], paths: ['/admin/mailer/templates/{id}'] }),
  detail('mailbox', { env: 'E2E_LIVE_MAILBOX_ID', apiPath: '/mailboxes', namespaces: ['mailbox'], paths: ['/admin/mailer/mailboxes/{id}'] }),
  detail('mail-log', { env: 'E2E_LIVE_MAIL_LOG_ID', apiPath: '/mail_logs', namespaces: ['mail_log'], paths: ['/admin/mailer/log/{id}'] }),
  detail('audit-event', { env: 'E2E_LIVE_AUDIT_HISTORY_ID', apiPath: '/object_histories', namespaces: ['object_history'], paths: ['/admin/audit/{id}'] }),
  detail('incoming-payment', { env: 'E2E_LIVE_INCOMING_PAYMENT_ID', apiPath: '/incoming_payments', namespaces: ['incoming_payment'], paths: ['/admin/payments/incoming/{id}'] }),
]);

export function extractFirstPositiveId(envelope, namespaces = []) {
  if (!envelope || typeof envelope !== 'object' || envelope.status === false) return undefined;
  const response = envelope.response;
  const candidates = [];

  if (Array.isArray(response)) candidates.push(response);
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    for (const namespace of namespaces) {
      const value = response[namespace];
      if (Array.isArray(value)) candidates.push(value);
      else if (value && typeof value === 'object') candidates.push([value]);
    }
    for (const [key, value] of Object.entries(response)) {
      if (key === '_meta' || key === 'meta' || namespaces.includes(key)) continue;
      if (Array.isArray(value)) candidates.push(value);
    }
  }

  for (const rows of candidates) {
    for (const row of rows) {
      const id = Number(row?.id);
      if (Number.isSafeInteger(id) && id > 0) return id;
    }
  }
  return undefined;
}

function responseRows(envelope, namespaces = []) {
  if (!envelope || typeof envelope !== 'object' || envelope.status === false) return [];
  const response = envelope.response;
  const rows = [];

  if (Array.isArray(response)) rows.push(...response);
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    for (const namespace of namespaces) {
      const value = response[namespace];
      if (Array.isArray(value)) rows.push(...value);
      else if (value && typeof value === 'object') rows.push(value);
    }
    for (const [key, value] of Object.entries(response)) {
      if (key === '_meta' || key === 'meta' || namespaces.includes(key)) continue;
      if (Array.isArray(value)) rows.push(...value);
    }
  }

  return rows.filter((row) => row && typeof row === 'object');
}

function ownerId(row) {
  const ownerCandidates = [
    row.user,
    row.owner,
    row.account,
    row.vps?.user,
    row.dataset?.user,
  ];
  for (const owner of ownerCandidates) {
    const value = Number(owner && typeof owner === 'object' ? owner.id : owner);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  for (const value of [row.user_id, row.owner_id, row.account_id]) {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return undefined;
}

export function extractFirstOwnedPositiveId(envelope, namespaces, currentUserId, expectedId) {
  const userId = Number(currentUserId);
  const wantedId = expectedId === undefined ? undefined : Number(expectedId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return undefined;
  if (wantedId !== undefined && (!Number.isSafeInteger(wantedId) || wantedId <= 0)) return undefined;

  for (const row of responseRows(envelope, namespaces)) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    if (wantedId !== undefined && id !== wantedId) continue;
    if (ownerId(row) === userId) return id;
  }
  return undefined;
}

export function appIdEnvironmentName(spec) {
  return String(spec.env).replace(/^E2E_LIVE_/, 'E2E_LIVE_APP_');
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function buildDetailRoutes({
  env = {},
  appDiscovered = {},
  adminDiscovered = {},
  publicDiscovered = {},
  adminCapable,
  currentRole,
}) {
  const effectiveRole = currentRole ?? (adminCapable ? 'admin' : 'user');
  const routes = [];
  for (const spec of DETAIL_ROUTE_SPECS) {
    for (const template of spec.paths) {
      const isAdmin = template.startsWith('/admin/');
      const isApp = template.startsWith('/app/');
      const isPublic = !isAdmin && !isApp;
      if (isAdmin && !spec.adminRoles.includes(effectiveRole)) continue;

      // App IDs are deliberately never read directly from env or from an
      // unrestricted admin discovery response. The caller must first validate
      // them against the current user's server-scoped API response.
      const id = isApp
        ? validId(appDiscovered[spec.key])
        : isAdmin
          ? validId(env[spec.env]) ?? validId(adminDiscovered[spec.key])
          : validId(env[spec.env]) ?? validId(publicDiscovered[spec.key]);
      if (!id) continue;

      routes.push(route(`detail.${spec.key}.${template.replaceAll('/', '.').replace('{id}', '')}`, template.replace('{id}', String(id)), {
        reportPath: template,
        roles: isAdmin
          ? spec.adminRoles
          : isPublic
            ? ['anonymous', 'user', 'support', 'admin']
            : ['user', 'support', 'admin'],
      }));
    }
  }
  return routes;
}

export function discoveryRequirement(spec, scope) {
  const requirement = spec?.discovery?.[scope];
  if (requirement !== 'required' && requirement !== 'optional') {
    throw new Error(`Invalid ${scope} discovery requirement for ${spec?.key ?? 'unknown route spec'}.`);
  }
  return requirement;
}

export function filterRoutesForRole(routes, role) {
  return routes.filter((item) => item.roles.includes(role));
}

export function assertUniqueManifestRoutes(routes) {
  const ids = new Set();
  const paths = new Set();
  for (const item of routes) {
    if (!item.id || !item.path?.startsWith('/')) throw new Error('Every live sweep route requires an id and absolute path.');
    if (ids.has(item.id)) throw new Error(`Duplicate live sweep route id: ${item.id}`);
    if (paths.has(item.path)) throw new Error(`Duplicate live sweep route path: ${item.path}`);
    ids.add(item.id);
    paths.add(item.path);
  }
  return routes;
}

export const LIVE_ROUTE_MANIFEST = Object.freeze(assertUniqueManifestRoutes([
  ...PUBLIC_ROUTES,
  ...USER_STATIC_ROUTES,
  ...ADMIN_STATIC_ROUTES,
]));
