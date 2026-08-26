import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { auditDeployments, normalizeOrigin } from './deployment-parity.mjs'

const assetBody = 'console.log("same artifact")\n'
const secretThatMustNotLeak = 'test-secret-never-report'

function securityHeaders(enabled, contentSecurityPolicy) {
  if (!enabled) return {}
  return {
    'Content-Security-Policy': contentSecurityPolicy
      ?? "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
}

async function startFixture({
  secureHeaders,
  differentAsset = false,
  sessionToken = null,
  assetPath = '/assets/index-test.js',
  assetContentType = 'application/javascript',
  assetCacheControl = 'public, max-age=2592000, immutable',
  configBasePath = '',
  configMetaNamespace = '_meta',
  contentSecurityPolicy,
}) {
  const requests = []
  let origin = null
  const html = `<!doctype html><script type="module" src="${assetPath}"></script>`
  const server = createServer((request, response) => {
    requests.push({ method: request.method, authorization: request.headers.authorization, cookie: request.headers.cookie })
    const common = securityHeaders(secureHeaders, contentSecurityPolicy)

    if (request.url === '/config.js') {
      response.writeHead(200, {
        ...common,
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store',
        ...(secureHeaders ? { 'Cross-Origin-Resource-Policy': 'same-origin' } : {}),
      })
      response.end([
        'window.vpsAdmin = window.vpsAdmin || {};',
        `window.vpsAdmin.api = ${JSON.stringify({ url: origin, version: '7.0' })};`,
        'window.vpsAdmin.webuiNext = window.vpsAdmin.webuiNext || {};',
        `Object.assign(window.vpsAdmin.webuiNext, ${JSON.stringify({
          loginUrl: '/oauth/login',
          logoutUrl: '/oauth/logout',
          basePath: configBasePath,
          haveApi: { authHeader: 'X-HaveAPI-OAuth2-Token', metaNamespace: configMetaNamespace },
        })});`,
      ].join('\n'))
      return
    }

    if (request.url === '/session.json') {
      assert.equal(request.headers['sec-fetch-site'], 'same-origin')
      assert.equal(request.headers.referer, `${origin}/`)
      response.writeHead(200, {
        ...common,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(secureHeaders ? { 'Cross-Origin-Resource-Policy': 'same-origin' } : {}),
      })
      response.end(JSON.stringify({ accessToken: sessionToken, sessionExpiresAt: null }))
      return
    }

    if (request.url === '/healthz') {
      response.writeHead(200, { ...common, 'Content-Type': 'text/plain' })
      response.end('ok')
      return
    }

    if (request.url === assetPath) {
      response.writeHead(200, {
        ...common,
        'Content-Type': assetContentType,
        'Cache-Control': assetCacheControl,
      })
      response.end(differentAsset ? `${assetBody}// changed` : assetBody)
      return
    }

    if (request.url === '/assets/__deployment_parity_missing__.js') {
      response.writeHead(404, { ...common, 'Content-Type': 'text/html' })
      response.end('not found')
      return
    }

    response.writeHead(200, {
      ...common,
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
    })
    response.end(html)
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`

  return {
    origin,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

test('origin validation rejects credentials and paths', () => {
  assert.equal(normalizeOrigin('https://example.test/'), 'https://example.test')
  assert.throws(() => normalizeOrigin('https://user:password@example.test'), /without credentials/)
  assert.throws(() => normalizeOrigin('https://example.test/path'), /without credentials/)
})

test('audit uses anonymous GETs, redacts session fields and treats reference header gaps as observations', async () => {
  const candidate = await startFixture({ secureHeaders: true })
  const reference = await startFixture({ secureHeaders: false })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, true)
    assert.deepEqual(report.candidateViolations, [])
    assert.deepEqual(report.parityViolations, [])
    assert(report.observations.some((entry) => entry.includes('reference is missing')))
    assert.equal(report.candidate.session.shape.accessToken, 'null')
    assert.equal(report.reference.session.shape.accessToken, 'null')
    assert(!JSON.stringify(report).includes(secretThatMustNotLeak))
    assert([...candidate.requests, ...reference.requests].every((request) => request.method === 'GET'))
    assert([...candidate.requests, ...reference.requests].every((request) => !request.authorization && !request.cookie))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('session values are redacted even when an endpoint unexpectedly returns a token', async () => {
  const candidate = await startFixture({ secureHeaders: true })
  const reference = await startFixture({ secureHeaders: false, sessionToken: secretThatMustNotLeak })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert.equal(report.reference.session.shape.accessToken, 'present-redacted')
    assert(report.parityViolations.includes('anonymous session.json access-token states differ'))
    assert(!JSON.stringify(report).includes(secretThatMustNotLeak))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('audit blocks deployment artifact drift', async () => {
  const candidate = await startFixture({ secureHeaders: true })
  const reference = await startFixture({ secureHeaders: false, differentAsset: true })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert(report.parityViolations.includes('/assets/index-test.js contents differ'))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('candidate immutable assets require a positive max-age', async () => {
  const candidate = await startFixture({
    secureHeaders: true,
    assetCacheControl: 'public, max-age=0, immutable',
  })
  const reference = await startFixture({
    secureHeaders: false,
    assetCacheControl: 'public, max-age=0, immutable',
  })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert(report.candidateViolations.includes(
      '/assets/index-test.js is not cached as public, immutable with a positive max-age',
    ))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('CSP matching rejects directive and token substring lookalikes', async () => {
  const lookalikeCsp = "default-src 'selfish'; object-src 'noneish'; base-uri 'selfish'; frame-ancestors 'selfish'"
  const candidate = await startFixture({ secureHeaders: true, contentSecurityPolicy: lookalikeCsp })
  const reference = await startFixture({ secureHeaders: false })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert(report.candidateViolations.includes('index fails security header contract cspBaseline'))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('assets are validated against MIME types for their file extension', async () => {
  const candidate = await startFixture({
    secureHeaders: true,
    assetPath: '/assets/styles-test.css',
    assetContentType: 'application/javascript',
  })
  const reference = await startFixture({
    secureHeaders: false,
    assetPath: '/assets/styles-test.css',
    assetContentType: 'application/javascript',
  })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert(report.candidateViolations.includes('/assets/styles-test.css has an invalid MIME type'))
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('non-script assets pass when their extension and MIME type agree', async () => {
  const candidate = await startFixture({
    secureHeaders: true,
    assetPath: '/assets/icon-test.svg',
    assetContentType: 'image/svg+xml',
  })
  const reference = await startFixture({
    secureHeaders: false,
    assetPath: '/assets/icon-test.svg',
    assetContentType: 'image/svg+xml',
  })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, true)
    assert.deepEqual(report.candidateViolations, [])
  } finally {
    await candidate.close()
    await reference.close()
  }
})

test('candidate config requires the root base path and HaveAPI metadata namespace', async () => {
  const candidate = await startFixture({
    secureHeaders: true,
    configBasePath: '/unexpected',
    configMetaNamespace: 'metadata',
  })
  const reference = await startFixture({
    secureHeaders: false,
    configBasePath: '/unexpected',
    configMetaNamespace: 'metadata',
  })

  try {
    const report = await auditDeployments({
      candidateOrigin: candidate.origin,
      referenceOrigin: reference.origin,
    })

    assert.equal(report.ok, false)
    assert(report.candidateViolations.includes('candidate config.js base path must be empty'))
    assert(report.candidateViolations.includes('candidate config.js metadata namespace is invalid'))
  } finally {
    await candidate.close()
    await reference.close()
  }
})
