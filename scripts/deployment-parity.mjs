import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'

const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
]

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

function normalizedMime(headers) {
  return String(headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
}

function cacheDirectives(headers) {
  const directives = new Map()

  for (const rawDirective of String(headers['cache-control'] ?? '').split(',')) {
    const [rawName, ...rawValue] = rawDirective.trim().split('=')
    const name = rawName.trim().toLowerCase()
    if (!name) continue

    directives.set(name, rawValue.length > 0
      ? rawValue.join('=').trim().replace(/^"|"$/g, '')
      : null)
  }

  return directives
}

function hasCacheDirective(headers, directive) {
  return cacheDirectives(headers).has(directive)
}

function cacheMaxAge(headers) {
  const values = String(headers['cache-control'] ?? '')
    .split(',')
    .map((rawDirective) => rawDirective.trim().split('='))
    .filter(([rawName]) => rawName.trim().toLowerCase() === 'max-age')
    .map(([, ...rawValue]) => rawValue.join('=').trim().replace(/^"|"$/g, ''))

  if (values.length !== 1 || !/^\d+$/.test(values[0] ?? '')) return null

  const seconds = Number(values[0])
  return Number.isSafeInteger(seconds) ? seconds : null
}

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex')
}

function headerPresence(headers) {
  return Object.fromEntries(
    [...SECURITY_HEADERS, 'cross-origin-resource-policy'].map((name) => [
      name,
      headers[name] !== undefined,
    ]),
  )
}

function securityContracts(headers) {
  const csp = String(headers['content-security-policy'] ?? '').toLowerCase()
  const cspDirectives = new Map()
  for (const rawDirective of csp.split(';')) {
    const [rawName, ...values] = rawDirective.trim().split(/\s+/)
    if (!rawName) continue
    if (!cspDirectives.has(rawName)) cspDirectives.set(rawName, values)
  }
  const hasCspToken = (directive, token) => cspDirectives.get(directive)?.includes(token) ?? false
  const hsts = String(headers['strict-transport-security'] ?? '').toLowerCase()
  const hstsMaxAge = Number(hsts.match(/(?:^|;)\s*max-age=(\d+)/)?.[1] ?? 0)
  const permissions = String(headers['permissions-policy'] ?? '').toLowerCase()

  return {
    cspBaseline: [
      ['default-src', "'self'"],
      ['object-src', "'none'"],
      ['base-uri', "'self'"],
      ['frame-ancestors', "'self'"],
    ].every(([directive, token]) => hasCspToken(directive, token)),
    hstsOneYear: hstsMaxAge >= 31_536_000,
    nosniff: String(headers['x-content-type-options'] ?? '')
      .toLowerCase()
      .split(',')
      .every((value) => value.trim() === 'nosniff'),
    clickjacking: ['sameorigin', 'deny'].includes(String(headers['x-frame-options'] ?? '').toLowerCase()),
    strictReferrer: ['strict-origin-when-cross-origin', 'no-referrer']
      .includes(String(headers['referrer-policy'] ?? '').toLowerCase()),
    permissionsLockedDown: ['camera', 'microphone', 'geolocation', 'payment']
      .every((feature) => new RegExp(`(?:^|,)\\s*${feature}=\\(\\)`).test(permissions)),
  }
}

function expectedAssetMimeTypes(path) {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  const mimeTypesByExtension = {
    avif: ['image/avif'],
    css: ['text/css'],
    gif: ['image/gif'],
    ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
    jpeg: ['image/jpeg'],
    jpg: ['image/jpeg'],
    js: ['application/javascript', 'text/javascript'],
    json: ['application/json'],
    mjs: ['application/javascript', 'text/javascript'],
    otf: ['font/otf', 'application/vnd.ms-opentype'],
    png: ['image/png'],
    svg: ['image/svg+xml'],
    ttf: ['font/ttf', 'application/x-font-ttf'],
    webp: ['image/webp'],
    woff: ['font/woff', 'application/font-woff'],
    woff2: ['font/woff2'],
  }

  return mimeTypesByExtension[extension] ?? null
}

export function normalizeOrigin(value, label = 'origin') {
  let url

  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS`)
  }

  if (
    url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new Error(`${label} must be an origin without credentials, path, query or fragment`)
  }

  return url.origin
}

function requestUrl(url, { allowInvalidCertificate = false, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(
      url,
      {
        method: 'GET',
        rejectUnauthorized: !allowInvalidCertificate,
        headers: {
          accept: '*/*',
          'accept-encoding': 'identity',
          'user-agent': 'clankerdev-readonly-deployment-parity/1.0',
          ...headers,
        },
      },
      (response) => {
        const chunks = []
        let receivedBytes = 0

        response.on('data', (chunk) => {
          receivedBytes += chunk.length

          if (receivedBytes > MAX_RESPONSE_BYTES) {
            request.destroy(new Error(`response exceeded ${MAX_RESPONSE_BYTES} bytes`))
            return
          }

          chunks.push(chunk)
        })
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )

    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)))
    request.on('error', reject)
    request.end()
  })
}

function findAssetPaths(html) {
  const paths = new Set()
  const pattern = /(?:src|href)=["']([^"']+)["']/gi

  for (const match of html.matchAll(pattern)) {
    let url
    try {
      url = new URL(match[1], 'https://parity.invalid/')
    } catch {
      continue
    }

    if (url.origin === 'https://parity.invalid' && url.pathname.startsWith('/assets/')) {
      paths.add(url.pathname)
    }
  }

  return [...paths].sort()
}

function classifyConfig(body, origin) {
  const text = body.toString('utf8')
  const apiMatch = text.match(/window\.vpsAdmin\.api\s*=\s*(\{[^;]+\})\s*;/)
  const webuiNextMatch = text.match(/Object\.assign\(window\.vpsAdmin\.webuiNext,\s*(\{.+\})\s*\);?/s)
  let api = null
  let webuiNext = null

  try {
    if (apiMatch) api = JSON.parse(apiMatch[1])
    if (webuiNextMatch) webuiNext = JSON.parse(webuiNextMatch[1])
  } catch {
    // Parse failures are represented as an invalid structural signature below.
  }

  const apiUrl = typeof api?.url === 'string' ? api.url : null
  let apiOrigin = null
  try {
    if (apiUrl) apiOrigin = new URL(apiUrl).origin
  } catch {
    // Invalid URLs remain a null structural field and fail parity validation.
  }

  return {
    valid: Boolean(api && webuiNext),
    apiVersion: typeof api?.version === 'string' ? api.version : null,
    apiUsesPageOrigin: apiUrl === origin,
    apiOrigin,
    loginUrl: typeof webuiNext?.loginUrl === 'string' ? webuiNext.loginUrl : null,
    logoutUrl: typeof webuiNext?.logoutUrl === 'string' ? webuiNext.logoutUrl : null,
    basePath: typeof webuiNext?.basePath === 'string' ? webuiNext.basePath : null,
    authHeader: typeof webuiNext?.haveApi?.authHeader === 'string' ? webuiNext.haveApi.authHeader : null,
    metaNamespace: typeof webuiNext?.haveApi?.metaNamespace === 'string' ? webuiNext.haveApi.metaNamespace : null,
    containsSessionTokenAssignment: /(?:^|\W)sessionToken\s*=/.test(text),
  }
}

function classifySession(body) {
  try {
    const value = JSON.parse(body.toString('utf8'))
    const accessToken = value && Object.hasOwn(value, 'accessToken')
      ? (value.accessToken === null ? 'null' : 'present-redacted')
      : 'absent'

    return {
      valid: Boolean(value && typeof value === 'object' && !Array.isArray(value)),
      keys: value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).sort()
        : [],
      accessToken,
      sessionExpiresAt: value && Object.hasOwn(value, 'sessionExpiresAt')
        ? (value.sessionExpiresAt === null ? 'null' : 'present-redacted')
        : 'absent',
    }
  } catch {
    return { valid: false, keys: [], accessToken: 'absent', sessionExpiresAt: 'absent' }
  }
}

function summarizeResponse(response, { hashBody = false } = {}) {
  return {
    status: response.status,
    mime: normalizedMime(response.headers),
    cache: {
      noStore: hasCacheDirective(response.headers, 'no-store'),
      noCache: hasCacheDirective(response.headers, 'no-cache'),
      public: hasCacheDirective(response.headers, 'public'),
      immutable: hasCacheDirective(response.headers, 'immutable'),
      maxAgeSeconds: cacheMaxAge(response.headers),
    },
    security: headerPresence(response.headers),
    securityContracts: securityContracts(response.headers),
    hasSetCookie: response.headers['set-cookie'] !== undefined,
    bytes: response.body.length,
    ...(hashBody ? { sha256: sha256(response.body) } : {}),
  }
}

async function inspectDeployment(origin, options = {}) {
  const requestOptions = {
    allowInvalidCertificate: options.allowInvalidCertificate,
    timeoutMs: options.timeoutMs,
  }
  const get = async (path, extra = {}) => requestUrl(new URL(path, origin), { ...requestOptions, ...extra })

  const indexResponse = await get('/')
  const explicitIndexResponse = await get('/index.html')
  const configResponse = await get('/config.js')
  const sessionResponse = await get('/session.json', {
    headers: {
      accept: 'application/json',
      referer: `${origin}/`,
      'sec-fetch-site': 'same-origin',
    },
  })
  const healthResponse = await get('/healthz')
  const missingAssetResponse = await get('/assets/__deployment_parity_missing__.js')
  const spaFallbackResponse = await get('/__deployment_parity_spa_route__')
  const assetPaths = findAssetPaths(indexResponse.body.toString('utf8'))
  const assetEntries = await Promise.all(
    assetPaths.map(async (path) => {
      const response = await get(path)
      return [path, summarizeResponse(response, { hashBody: true })]
    }),
  )

  let httpRedirect = null
  if (origin.startsWith('https://')) {
    const httpUrl = new URL(origin)
    httpUrl.protocol = 'http:'
    const response = await requestUrl(httpUrl, { timeoutMs: options.timeoutMs })
    httpRedirect = {
      status: response.status,
      location: typeof response.headers.location === 'string' ? response.headers.location : null,
    }
  }

  return {
    origin,
    httpRedirect,
    index: summarizeResponse(indexResponse, { hashBody: true }),
    explicitIndex: summarizeResponse(explicitIndexResponse, { hashBody: true }),
    config: {
      ...summarizeResponse(configResponse),
      shape: classifyConfig(configResponse.body, origin),
    },
    session: {
      ...summarizeResponse(sessionResponse),
      shape: classifySession(sessionResponse.body),
    },
    health: {
      ...summarizeResponse(healthResponse),
      healthy: healthResponse.body.toString('utf8').trim() === 'ok',
    },
    missingAsset: summarizeResponse(missingAssetResponse),
    spaFallback: summarizeResponse(spaFallbackResponse, { hashBody: true }),
    assets: Object.fromEntries(assetEntries),
  }
}

function addViolation(violations, condition, message) {
  if (!condition) violations.push(message)
}

function verifyCandidate(candidate) {
  const violations = []
  const htmlSurfaces = [candidate.index, candidate.explicitIndex, candidate.spaFallback]

  if (candidate.httpRedirect) {
    addViolation(violations, [301, 308].includes(candidate.httpRedirect.status), 'HTTP origin does not permanently redirect')
    addViolation(violations, candidate.httpRedirect.location === `${candidate.origin}/`, 'HTTP redirect target is not the HTTPS origin')
  }

  for (const [name, response] of [
    ['index', candidate.index],
    ['explicit index', candidate.explicitIndex],
    ['SPA fallback', candidate.spaFallback],
  ]) {
    addViolation(violations, response.status === 200, `${name} is not HTTP 200`)
    addViolation(violations, response.mime === 'text/html', `${name} is not text/html`)
    addViolation(violations, response.cache.noCache, `${name} is not marked no-cache`)
  }

  addViolation(violations, htmlSurfaces.every((response) => response.sha256 === candidate.index.sha256), 'index and SPA fallback bodies differ')
  addViolation(violations, candidate.config.status === 200, 'config.js is not HTTP 200')
  addViolation(violations, ['application/javascript', 'text/javascript'].includes(candidate.config.mime), 'config.js has an invalid JavaScript MIME type')
  addViolation(violations, candidate.config.cache.noStore, 'config.js is not marked no-store')
  addViolation(violations, candidate.config.shape.valid, 'config.js structure is not recognized')
  addViolation(violations, candidate.config.shape.apiUsesPageOrigin, 'candidate config.js API URL does not use the candidate origin')
  addViolation(violations, candidate.config.shape.apiVersion === '7.0', 'candidate config.js does not select API version 7.0')
  addViolation(violations, candidate.config.shape.loginUrl === '/oauth/login', 'candidate config.js login route is invalid')
  addViolation(violations, candidate.config.shape.logoutUrl === '/oauth/logout', 'candidate config.js logout route is invalid')
  addViolation(violations, candidate.config.shape.basePath === '', 'candidate config.js base path must be empty')
  addViolation(violations, candidate.config.shape.authHeader === 'X-HaveAPI-OAuth2-Token', 'candidate config.js auth header is invalid')
  addViolation(violations, candidate.config.shape.metaNamespace === '_meta', 'candidate config.js metadata namespace is invalid')
  addViolation(violations, !candidate.config.shape.containsSessionTokenAssignment, 'config.js contains a session token assignment')
  addViolation(violations, candidate.config.security['cross-origin-resource-policy'], 'config.js is missing cross-origin-resource-policy')
  addViolation(violations, candidate.session.status === 200, 'same-origin anonymous session.json is not HTTP 200')
  addViolation(violations, candidate.session.mime === 'application/json', 'session.json is not application/json')
  addViolation(violations, candidate.session.cache.noStore, 'session.json is not marked no-store')
  addViolation(violations, candidate.session.shape.valid, 'session.json is not valid JSON')
  addViolation(violations, candidate.session.shape.keys.join('\0') === 'accessToken\0sessionExpiresAt', 'session.json has an unexpected response shape')
  addViolation(violations, candidate.session.shape.accessToken === 'null', 'anonymous session.json unexpectedly contains an access token')
  addViolation(violations, candidate.session.security['cross-origin-resource-policy'], 'session.json is missing cross-origin-resource-policy')
  addViolation(violations, candidate.health.status === 200, 'healthz is not HTTP 200')
  addViolation(violations, candidate.health.mime === 'text/plain', 'healthz is not text/plain')
  addViolation(violations, candidate.health.healthy, 'healthz does not contain the expected readiness marker')
  addViolation(violations, candidate.missingAsset.status === 404, 'missing asset does not return HTTP 404')
  addViolation(violations, Object.keys(candidate.assets).length > 0, 'index does not reference a versioned asset')

  for (const [path, asset] of Object.entries(candidate.assets)) {
    const expectedMimeTypes = expectedAssetMimeTypes(path)
    addViolation(violations, asset.status === 200, `${path} is not HTTP 200`)
    addViolation(violations, expectedMimeTypes !== null, `${path} has an unsupported asset extension`)
    addViolation(violations, expectedMimeTypes?.includes(asset.mime), `${path} has an invalid MIME type`)
    addViolation(
      violations,
      asset.cache.public && asset.cache.immutable && (asset.cache.maxAgeSeconds ?? 0) > 0,
      `${path} is not cached as public, immutable with a positive max-age`,
    )
  }

  for (const [name, response] of [
    ['index', candidate.index],
    ['explicit index', candidate.explicitIndex],
    ['config.js', candidate.config],
    ['session.json', candidate.session],
    ['healthz', candidate.health],
    ['missing asset', candidate.missingAsset],
    ['SPA fallback', candidate.spaFallback],
    ...Object.entries(candidate.assets).map(([path, response]) => [path, response]),
  ]) {
    for (const header of SECURITY_HEADERS) {
      addViolation(violations, response.security[header], `${name} is missing ${header}`)
    }
    for (const [contract, valid] of Object.entries(response.securityContracts)) {
      addViolation(violations, valid, `${name} fails security header contract ${contract}`)
    }
  }

  return violations
}

function compareParity(candidate, reference) {
  const violations = []
  const observations = []
  const comparable = ['index', 'explicitIndex', 'config', 'session', 'health', 'missingAsset', 'spaFallback']

  for (const name of comparable) {
    const left = candidate[name]
    const right = reference[name]
    if (left.status !== right.status) violations.push(`${name} status differs: ${left.status} != ${right.status}`)
    if (left.mime !== right.mime) violations.push(`${name} MIME differs: ${left.mime || '(absent)'} != ${right.mime || '(absent)'}`)
  }

  if (candidate.httpRedirect || reference.httpRedirect) {
    addViolation(violations, Boolean(candidate.httpRedirect && reference.httpRedirect), 'HTTP redirect coverage differs between origins')
    if (candidate.httpRedirect && reference.httpRedirect) {
      addViolation(violations, candidate.httpRedirect.status === reference.httpRedirect.status, 'HTTP redirect statuses differ')
      addViolation(violations, reference.httpRedirect.location === `${reference.origin}/`, 'reference HTTP redirect target is not its HTTPS origin')
    }
  }

  for (const field of ['valid', 'apiVersion', 'loginUrl', 'logoutUrl', 'basePath', 'authHeader', 'metaNamespace', 'containsSessionTokenAssignment']) {
    addViolation(violations, candidate.config.shape[field] === reference.config.shape[field], `config.js ${field} contracts differ`)
  }
  addViolation(violations, candidate.session.shape.keys.join('\0') === reference.session.shape.keys.join('\0'), 'session.json response shapes differ')
  addViolation(violations, candidate.session.shape.accessToken === reference.session.shape.accessToken, 'anonymous session.json access-token states differ')
  addViolation(violations, candidate.session.shape.sessionExpiresAt === reference.session.shape.sessionExpiresAt, 'anonymous session.json expiry states differ')
  addViolation(violations, candidate.health.healthy === reference.health.healthy, 'healthz readiness markers differ')
  addViolation(violations, candidate.index.sha256 === reference.index.sha256, 'deployed index.html artifacts differ')
  addViolation(violations, candidate.spaFallback.sha256 === reference.spaFallback.sha256, 'SPA fallback artifacts differ')
  addViolation(violations, candidate.index.cache.noCache === reference.index.cache.noCache, 'index cache contracts differ')
  addViolation(violations, candidate.explicitIndex.cache.noCache === reference.explicitIndex.cache.noCache, 'explicit index cache contracts differ')
  addViolation(violations, candidate.spaFallback.cache.noCache === reference.spaFallback.cache.noCache, 'SPA fallback cache contracts differ')
  addViolation(violations, candidate.config.cache.noStore === reference.config.cache.noStore, 'config.js cache contracts differ')
  addViolation(violations, candidate.session.cache.noStore === reference.session.cache.noStore, 'session.json cache contracts differ')

  const candidateAssets = Object.keys(candidate.assets)
  const referenceAssets = Object.keys(reference.assets)
  addViolation(violations, candidateAssets.join('\0') === referenceAssets.join('\0'), 'index asset manifests differ')

  for (const path of candidateAssets.filter((assetPath) => reference.assets[assetPath])) {
    const left = candidate.assets[path]
    const right = reference.assets[path]
    addViolation(violations, left.status === right.status, `${path} statuses differ`)
    addViolation(violations, left.mime === right.mime, `${path} MIME types differ`)
    addViolation(violations, left.cache.public === right.cache.public && left.cache.immutable === right.cache.immutable, `${path} cache contracts differ`)
    addViolation(violations, left.sha256 === right.sha256, `${path} contents differ`)
  }

  for (const [name, left] of [
    ['index', candidate.index],
    ['config.js', candidate.config],
    ['session.json', candidate.session],
    ['healthz', candidate.health],
    ['SPA fallback', candidate.spaFallback],
    ...Object.entries(candidate.assets).map(([path, response]) => [path, response]),
  ]) {
    const right = name.startsWith('/') ? reference.assets[name] : {
      index: reference.index,
      'config.js': reference.config,
      'session.json': reference.session,
      healthz: reference.health,
      'SPA fallback': reference.spaFallback,
    }[name]

    if (!right) continue
    const missingOnReference = SECURITY_HEADERS.filter((header) => left.security[header] && !right.security[header])
    if (missingOnReference.length > 0) {
      observations.push(`${name}: reference is missing ${missingOnReference.join(', ')}`)
    }
  }

  if (candidate.config.shape.apiOrigin !== reference.config.shape.apiOrigin) {
    observations.push('config.js API origins differ as expected between test and reference environments')
  }

  if (
    candidate.missingAsset.cache.public !== reference.missingAsset.cache.public
    || candidate.missingAsset.cache.immutable !== reference.missingAsset.cache.immutable
  ) {
    observations.push('missing-asset cache policies differ (candidate marks the 404 public/immutable)')
  }

  return { violations, observations }
}

export async function auditDeployments({
  candidateOrigin,
  referenceOrigin,
  allowInvalidCandidateCertificate = false,
  allowInvalidReferenceCertificate = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const candidate = await inspectDeployment(normalizeOrigin(candidateOrigin, 'candidate origin'), {
    allowInvalidCertificate: allowInvalidCandidateCertificate,
    timeoutMs,
  })
  const reference = await inspectDeployment(normalizeOrigin(referenceOrigin, 'reference origin'), {
    allowInvalidCertificate: allowInvalidReferenceCertificate,
    timeoutMs,
  })
  const candidateViolations = verifyCandidate(candidate)
  const parity = compareParity(candidate, reference)

  return {
    ok: candidateViolations.length === 0 && parity.violations.length === 0,
    candidate,
    reference,
    candidateViolations,
    parityViolations: parity.violations,
    observations: parity.observations,
  }
}

export const deploymentParityInternals = {
  classifyConfig,
  classifySession,
  findAssetPaths,
  verifyCandidate,
}
