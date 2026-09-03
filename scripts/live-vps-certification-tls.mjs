import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

export const LIVE_VPS_TLS_HOST = 'dev.crucio.cz';
export const LIVE_VPS_TLS_PORT = 443;
export const PINNED_LIVE_VPS_LEAF_DER_SHA256 =
  '6eded8338f574cb7169bc66a51dca334338b2cca8e68650bf31a2aa36783658f';
export const PINNED_LIVE_VPS_SPKI_SHA256_BASE64 = 'KuTsL27vrsGaAUVeUdq8XAHdQnYbvdmNOLMpZRe9ZEI=';
export const PINNED_LIVE_VPS_TLS_AUTHORIZATION_ERROR = 'DEPTH_ZERO_SELF_SIGNED_CERT';

function fail(message) {
  throw new Error(message);
}

export function assertAuditedLiveVpsTlsTrustState({ authorized, authorizationError }) {
  if (authorized !== false || authorizationError !== PINNED_LIVE_VPS_TLS_AUTHORIZATION_ERROR) {
    fail('The dev TLS certificate no longer has the audited self-signed trust state; rotate the pin deliberately.');
  }
  return PINNED_LIVE_VPS_TLS_AUTHORIZATION_ERROR;
}

export function assertPinnedLiveVpsTlsPeer({ certificate, authorized, authorizationError, now = new Date() }) {
  const trustState = assertAuditedLiveVpsTlsTrustState({ authorized, authorizationError });
  if (!certificate || !Buffer.isBuffer(certificate.raw) || certificate.raw.length === 0) {
    fail('The dev TLS peer did not expose a leaf certificate in DER form.');
  }

  const leafDerSha256 = crypto.createHash('sha256').update(certificate.raw).digest('hex');
  if (leafDerSha256 !== PINNED_LIVE_VPS_LEAF_DER_SHA256) {
    fail('The dev TLS leaf certificate does not match the code-owned certification pin.');
  }
  let spkiSha256Base64;
  try {
    const x509 = new X509Certificate(certificate.raw);
    const spkiDer = x509.publicKey.export({ type: 'spki', format: 'der' });
    spkiSha256Base64 = crypto.createHash('sha256').update(spkiDer).digest('base64');
  } catch {
    fail('The pinned dev TLS certificate does not expose a valid SPKI key.');
  }
  if (spkiSha256Base64 !== PINNED_LIVE_VPS_SPKI_SHA256_BASE64) {
    fail('The dev TLS certificate does not match the code-owned SPKI pin.');
  }

  const validFromMs = Date.parse(certificate.valid_from);
  const validToMs = Date.parse(certificate.valid_to);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (![validFromMs, validToMs, nowMs].every(Number.isFinite)) {
    fail('The pinned dev TLS certificate has an invalid validity window.');
  }
  if (nowMs < validFromMs || nowMs > validToMs) {
    fail('The pinned dev TLS certificate is outside its validity window.');
  }

  return {
    host: LIVE_VPS_TLS_HOST,
    port: LIVE_VPS_TLS_PORT,
    leafDerSha256,
    spkiSha256Base64,
    validFrom: new Date(validFromMs).toISOString(),
    validTo: new Date(validToMs).toISOString(),
    trustState,
  };
}

function connectPinnedLiveVpsTlsSocket({ timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    let deadlineTimer;

    const settle = (error, result) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (error) {
        socket?.destroy();
        reject(error);
      } else {
        socket.setTimeout(0);
        resolve(result);
      }
    };

    try {
      deadlineTimer = setTimeout(
        () => settle(new Error('Timed out while verifying the pinned dev TLS certificate.')),
        timeoutMs
      );
      socket = tls.connect({
        host: LIVE_VPS_TLS_HOST,
        port: LIVE_VPS_TLS_PORT,
        servername: LIVE_VPS_TLS_HOST,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      });
    } catch (error) {
      settle(error);
      return;
    }

    socket.setTimeout(timeoutMs, () => settle(new Error('Pinned dev TLS connection became inactive.')));
    socket.once('error', (error) => settle(error));
    socket.once('secureConnect', () => {
      try {
        const proof = assertPinnedLiveVpsTlsPeer({
          certificate: socket.getPeerCertificate(false),
          authorized: socket.authorized,
          authorizationError: socket.authorizationError,
          now: new Date(),
        });
        settle(null, { socket, proof });
      } catch (error) {
        settle(error);
      }
    });
  });
}

export async function verifyPinnedLiveVpsTlsCertificate(options = {}) {
  const { socket, proof } = await connectPinnedLiveVpsTlsSocket(options);
  socket.destroy();
  return proof;
}

class PinnedLiveVpsResponse {
  constructor(statusCode, headers, body) {
    this.statusCode = statusCode;
    this.responseHeaders = headers;
    this.responseBody = body;
  }

  ok() {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  status() {
    return this.statusCode;
  }

  async text() {
    return this.responseBody.toString('utf8');
  }

  async body() {
    return Buffer.from(this.responseBody);
  }

  headers() {
    return { ...this.responseHeaders };
  }

  async json() {
    return JSON.parse(await this.text());
  }
}

function assertExactRequestPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    fail('Pinned dev HTTPS requests require an absolute path on the exact audited origin.');
  }
  const parsed = new URL(pathname, `https://${LIVE_VPS_TLS_HOST}`);
  if (
    parsed.origin !== `https://${LIVE_VPS_TLS_HOST}` ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    `${parsed.pathname}${parsed.search}` !== pathname
  ) {
    fail('Pinned dev HTTPS requests cannot change origin, credentials, fragment or normalized path.');
  }
  return pathname;
}

export class PinnedLiveVpsHttpsClient {
  constructor({ adminToken = '', maxResponseBytes = 16 * 1024 * 1024 } = {}) {
    if (typeof adminToken !== 'string') fail('Pinned HTTPS admin token must be a string.');
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
      fail('Pinned HTTPS maxResponseBytes must be a positive integer.');
    }
    this.adminToken = adminToken;
    this.maxResponseBytes = maxResponseBytes;
  }

  async fetch(pathname, options = {}) {
    const exactPath = assertExactRequestPath(pathname);
    if (options.maxRedirects !== undefined && options.maxRedirects !== 0) {
      fail('Pinned dev HTTPS transport never follows redirects.');
    }
    const method = String(options.method ?? 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) {
      fail(`Pinned dev HTTPS transport rejects unsupported method ${method}.`);
    }
    const timeoutMs = options.timeout ?? 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15 * 60 * 1000) {
      fail('Pinned dev HTTPS request timeout is outside the guarded range.');
    }

    const requestStartedAt = Date.now();
    // The TLS socket is connected and both leaf/SPKI pins are verified before
    // the request (and therefore its authentication header/body) is created.
    const { socket } = await connectPinnedLiveVpsTlsSocket({ timeoutMs: Math.min(timeoutMs, 15_000) });
    const remainingMs = timeoutMs - (Date.now() - requestStartedAt);
    if (remainingMs <= 0) {
      socket.destroy();
      fail('Pinned dev HTTPS request exhausted its absolute deadline during TLS verification.');
    }
    const body = options.data === undefined ? null : Buffer.from(JSON.stringify(options.data));
    const headers = {
      Accept: 'application/json',
      Connection: 'close',
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } : {}),
      ...(this.adminToken ? { 'X-HaveAPI-Auth-Token': this.adminToken } : {}),
    };
    const agent = new https.Agent({ keepAlive: false });
    let socketClaimed = false;
    agent.createConnection = () => {
      if (socketClaimed) fail('A pinned TLS socket cannot be reused for another request.');
      socketClaimed = true;
      return socket;
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      const deadlineTimer = setTimeout(() => {
        const error = new Error('Pinned dev HTTPS request exceeded its absolute deadline.');
        if (request) request.destroy(error);
        else finish(error);
      }, remainingMs);
      const finish = (error, response) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineTimer);
        agent.destroy();
        socket.destroy();
        if (error) reject(error);
        else resolve(response);
      };

      try {
        request = https.request({
          protocol: 'https:',
          hostname: LIVE_VPS_TLS_HOST,
          port: LIVE_VPS_TLS_PORT,
          servername: LIVE_VPS_TLS_HOST,
          method,
          path: exactPath,
          headers,
          agent,
          rejectUnauthorized: false,
        }, (incoming) => {
          const chunks = [];
          let received = 0;
          incoming.on('data', (chunk) => {
            received += chunk.length;
            if (received > this.maxResponseBytes) {
              incoming.destroy(new Error('Pinned dev HTTPS response exceeded the guarded size limit.'));
              return;
            }
            chunks.push(chunk);
          });
          incoming.once('error', (error) => finish(error));
          incoming.once('end', () => {
            const statusCode = Number(incoming.statusCode);
            if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
              finish(new Error('Pinned dev HTTPS response omitted a valid status code.'));
              return;
            }
            const responseHeaders = {};
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (typeof value === 'string') responseHeaders[name.toLowerCase()] = value;
              else if (Array.isArray(value)) responseHeaders[name.toLowerCase()] = value.join(', ');
            }
            finish(null, new PinnedLiveVpsResponse(statusCode, responseHeaders, Buffer.concat(chunks)));
          });
        });
      } catch (error) {
        finish(error);
        return;
      }
      request.setTimeout(remainingMs, () => request.destroy(new Error('Pinned dev HTTPS request became inactive.')));
      request.once('error', (error) => finish(error));
      if (body) request.end(body);
      else request.end();
    });
  }

  get(pathname, options = {}) {
    return this.fetch(pathname, { ...options, method: 'GET' });
  }

  async dispose() {}
}
