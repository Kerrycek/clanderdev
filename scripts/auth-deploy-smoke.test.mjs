import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const smokeScript = new URL('../deploy/smoke-auth-endpoints.sh', import.meta.url)

async function withServer(handler, run) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address()
    assert(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('auth deployment smoke accepts correctly routed BFF endpoints', async () => {
  await withServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('ok')
      return
    }

    if (request.url === '/session.json') {
      assert.equal(request.headers['sec-fetch-site'], 'same-origin')
      assert.match(request.headers.referer ?? '', /^http:\/\/127\.0\.0\.1:/)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ accessToken: null, sessionExpiresAt: null }))
      return
    }

    if (request.url === '/oauth/login') {
      response.writeHead(302, { Location: '/authorize' })
      response.end()
      return
    }

    response.writeHead(404)
    response.end()
  }, async (baseUrl) => {
    const result = await execFileAsync('bash', [smokeScript.pathname, baseUrl])
    assert.match(result.stdout, /Auth endpoints OK/)
  })
})

test('auth deployment smoke rejects an SPA fallback for session.json', async () => {
  await withServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('ok')
      return
    }

    if (request.url === '/session.json') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<!doctype html><title>SPA</title>')
      return
    }

    response.writeHead(404)
    response.end()
  }, async (baseUrl) => {
    await assert.rejects(
      execFileAsync('bash', [smokeScript.pathname, baseUrl]),
      (error) => {
        assert.match(error.stderr, /instead of JSON/)
        return true
      },
    )
  })
})
