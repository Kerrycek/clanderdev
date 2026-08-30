function fail(message) {
  throw new Error(message);
}

function candidateId(match) {
  const id = match?.identity?.id;
  if (!Number.isSafeInteger(id) || id <= 0) fail('Exact VPS reconciliation match has an invalid ID.');
  return id;
}

const LIVE_VPS_RECONCILIATION_INCLUDES = 'node__location__environment,user,os_template';

export function buildExactLiveVpsPresenceUrl({ apiVersion, vpsId, hostname, ownerId, nodeId }) {
  if (apiVersion !== '7.0') fail('Exact VPS presence proof requires API protocol 7.0.');
  if (!Number.isSafeInteger(vpsId) || vpsId <= 0) fail('Exact VPS presence proof requires a positive VPS ID.');
  if (typeof hostname !== 'string' || hostname.trim() === '') {
    fail('Exact VPS presence proof requires the immutable guarded hostname.');
  }
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    fail('Exact VPS presence proof requires a positive owner ID.');
  }
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0) {
    fail('Exact VPS presence proof requires a positive node ID.');
  }
  const query = new URLSearchParams();
  // The audited API's VPS index has no ID input. Use only its documented exact
  // immutable run-identity filters, then require any returned row to have the
  // ledger's already-verified VPS ID. An unsupported vps[id] parameter would
  // make the cleanup proof fail on the live API instead of proving absence.
  query.set('vps[hostname_exact]', hostname);
  query.set('vps[user]', String(ownerId));
  query.set('vps[node]', String(nodeId));
  query.set('vps[limit]', '2');
  query.set('_meta[includes]', LIVE_VPS_RECONCILIATION_INCLUDES);
  query.set('_meta[count]', 'true');
  return `/v${apiVersion}/vpses?${query.toString()}`;
}

export function classifyExactLiveVpsPresenceEnvelope(envelope, { vpsId }) {
  if (!Number.isSafeInteger(vpsId) || vpsId <= 0) fail('Exact VPS presence proof requires a positive VPS ID.');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.status !== true) {
    fail('Exact VPS presence proof requires an authenticated status:true HaveAPI envelope.');
  }
  const response = envelope.response;
  const rows = response?.vpses;
  const totalCount = response?._meta?.total_count;
  if (!Array.isArray(rows) || !Number.isSafeInteger(totalCount) || totalCount < 0) {
    fail('Exact VPS presence proof requires vpses rows and a non-negative integer total_count.');
  }
  if (totalCount !== rows.length) {
    fail('Exact VPS presence proof must be complete and untruncated.');
  }
  if (totalCount === 0) return { exists: false, resource: null };
  if (totalCount !== 1) fail('Exact guarded VPS identity query returned more than one row.');
  const [resource] = rows;
  if (!resource || typeof resource !== 'object' || Array.isArray(resource) || resource.id !== vpsId) {
    fail('Exact guarded VPS identity query returned a different or invalid VPS ID.');
  }
  return { exists: true, resource };
}

export function classifyExactLiveVpsPresenceResponse({ httpStatus, envelope, vpsId }) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus > 299) {
    fail(`Authenticated exact VPS presence query must return HTTP 2xx, got ${httpStatus}.`);
  }
  return classifyExactLiveVpsPresenceEnvelope(envelope, { vpsId });
}

export function classifyLiveVpsHardDeleteEvidence({ terminalProofSucceeded, exactPresence }) {
  if (terminalProofSucceeded !== true && terminalProofSucceeded !== false) {
    fail('Hard-delete terminal proof result must be explicit.');
  }
  if (
    !exactPresence ||
    typeof exactPresence !== 'object' ||
    typeof exactPresence.exists !== 'boolean' ||
    (exactPresence.exists === false && exactPresence.resource !== null)
  ) {
    fail('Hard-delete evidence requires a valid exact VPS presence result.');
  }
  if (!terminalProofSucceeded) {
    return {
      kind: 'manual-review',
      canMarkCleaned: false,
      reason: exactPresence.exists
        ? 'terminal delete proof failed and the exact VPS still exists'
        : 'terminal delete proof failed even though the exact query returned zero rows',
    };
  }
  if (exactPresence.exists) {
    return {
      kind: 'incomplete',
      canMarkCleaned: false,
      reason: 'terminal delete proof succeeded but the exact VPS still exists',
    };
  }
  return { kind: 'cleaned', canMarkCleaned: true, reason: null };
}

export function buildLiveVpsReconciliationUrl({ apiVersion, hostname, ownerId, nodeId }) {
  if (apiVersion !== '7.0') fail('Live VPS reconciliation requires API protocol 7.0.');
  if (typeof hostname !== 'string' || hostname.trim() === '') {
    fail('Live VPS reconciliation requires an exact non-empty hostname.');
  }
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    fail('Live VPS reconciliation owner ID must be a positive integer.');
  }
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0) {
    fail('Live VPS reconciliation node ID must be a positive integer.');
  }

  const query = new URLSearchParams();
  query.set('vps[hostname_exact]', hostname);
  query.set('vps[user]', String(ownerId));
  query.set('vps[node]', String(nodeId));
  query.set('vps[limit]', '100');
  query.set('_meta[includes]', LIVE_VPS_RECONCILIATION_INCLUDES);
  // HaveAPI omits total_count unless it is requested explicitly. Without this
  // proof the runner cannot distinguish a unique result from a truncated page.
  query.set('_meta[count]', 'true');
  return `/v${apiVersion}/vpses?${query.toString()}`;
}

export function classifyExactVpsCandidateSet(matches, { registeredId = null } = {}) {
  if (!Array.isArray(matches)) fail('Exact VPS reconciliation matches must be an array.');
  if (registeredId !== null && (!Number.isSafeInteger(registeredId) || registeredId <= 0)) {
    fail('Registered VPS ID must be a positive integer.');
  }
  if (matches.length === 0) return { kind: 'none', candidateIds: [], match: null };

  const candidateIds = [...new Set(matches.map(candidateId))].sort((a, b) => a - b);
  if (matches.length !== 1) {
    return { kind: 'manual-review', reason: 'multiple exact guarded candidates found', candidateIds, match: null };
  }
  const [match] = matches;
  const id = candidateId(match);
  if (registeredId !== null && id !== registeredId) {
    return { kind: 'manual-review', reason: 'exact candidate has a foreign registered ID', candidateIds, match: null };
  }
  return { kind: 'unique', candidateIds, match };
}
