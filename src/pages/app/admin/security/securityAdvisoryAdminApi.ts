import {
  createSecurityAdvisoryCve,
  deleteSecurityAdvisoryCve,
  fetchSecurityAdvisoryAffectedUsers,
  fetchSecurityAdvisoryAffectedVps,
  fetchSecurityAdvisoryCves,
  type SecurityAdvisoryAffectedUser,
  type SecurityAdvisoryAffectedVps,
  type SecurityAdvisoryCve,
} from '../../../../lib/api/securityAdvisories';

const MAX_CURSOR_PAGES = 1_000;

async function collectCursorPages<T extends { id: number }>(
  fetchPage: (fromId: number | undefined) => Promise<{ data: T[] }>,
  pageSize: number,
): Promise<T[]> {
  const rows: T[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  let cursor: number | undefined;

  for (let page = 0; page < MAX_CURSOR_PAGES; page += 1) {
    const result = await fetchPage(cursor);
    for (const row of result.data) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      rows.push(row);
    }

    if (result.data.length < pageSize) return rows;
    const nextCursor = result.data.at(-1)?.id;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error('Security advisory relation pagination stalled before all rows were loaded');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error('Security advisory cursor pagination exceeded its safety limit');
}

export function fetchAllSecurityAdvisoryCvesForAdmin(
  securityAdvisoryId: number,
): Promise<SecurityAdvisoryCve[]> {
  return collectCursorPages((fromId) => fetchSecurityAdvisoryCves({
    securityAdvisoryId,
    limit: 100,
    fromId,
  }), 100);
}

export function fetchAllSecurityAdvisoryAffectedUsersForAdmin(
  securityAdvisoryId: number,
): Promise<SecurityAdvisoryAffectedUser[]> {
  return collectCursorPages((fromId) => fetchSecurityAdvisoryAffectedUsers({
    securityAdvisoryId,
    limit: 1_000,
    fromId,
    includes: 'user',
  }), 1_000);
}

export function fetchAllSecurityAdvisoryAffectedVpsForAdmin(
  securityAdvisoryId: number,
): Promise<SecurityAdvisoryAffectedVps[]> {
  return collectCursorPages((fromId) => fetchSecurityAdvisoryAffectedVps({
    securityAdvisoryId,
    limit: 1_000,
    fromId,
    includes: 'vps,user,environment,location,node',
  }), 1_000);
}

/**
 * Reconcile the child CVE resources after the advisory itself is saved. CVEs
 * are keyed by their normalized identifier, so unchanged rows keep their ids.
 */
export async function reconcileSecurityAdvisoryCves(
  securityAdvisoryId: number,
  existing: SecurityAdvisoryCve[],
  desiredCves: string[],
): Promise<void> {
  const wanted = new Set(desiredCves.map((item) => item.trim().toUpperCase()).filter(Boolean));
  const current = new Map(
    existing
      .filter((item) => typeof item.cve_id === 'string' && item.cve_id.trim())
      .map((item) => [String(item.cve_id).trim().toUpperCase(), item]),
  );

  // Create additions before deleting obsolete rows. HaveAPI does not expose an
  // atomic parent+children mutation, so this ordering preserves the existing
  // CVE set if a newly requested identifier is rejected.
  await Promise.all(
    [...wanted]
      .filter((cve) => !current.has(cve))
      .map((cve) => createSecurityAdvisoryCve({ security_advisory: securityAdvisoryId, cve_id: cve })),
  );

  await Promise.all(
    [...current.entries()]
      .filter(([cve]) => !wanted.has(cve))
      .map(([, item]) => deleteSecurityAdvisoryCve(item.id)),
  );
}
