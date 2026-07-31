import {
  fetchSecurityAdvisoryAffectedVps,
  type SecurityAdvisoryAffectedVps,
} from '../../lib/api/securityAdvisories';

const PUBLIC_RELATION_PAGE_SIZE = 100;

interface NumericIdRow {
  id: number;
}

function pageCursor<T extends NumericIdRow>(rows: T[]): number | null {
  let cursor: number | null = null;

  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (cursor === null || id > cursor) cursor = id;
  }

  return cursor;
}

async function fetchAllAscendingPages<T extends NumericIdRow>(
  fetchPage: (fromId: number | undefined) => Promise<T[]>,
): Promise<T[]> {
  const rowsById = new Map<number, T>();
  let fromId: number | undefined;

  for (;;) {
    const page = await fetchPage(fromId);
    for (const row of page) rowsById.set(row.id, row);

    if (page.length < PUBLIC_RELATION_PAGE_SIZE) break;

    const nextFromId = pageCursor(page);
    if (nextFromId === null || nextFromId === fromId) break;
    fromId = nextFromId;
  }

  return [...rowsById.values()];
}

export function fetchAllOwnSecurityAdvisoryVps(
  securityAdvisoryId: number,
  userId?: number,
): Promise<SecurityAdvisoryAffectedVps[]> {
  return fetchAllAscendingPages(async (fromId) => (
    await fetchSecurityAdvisoryAffectedVps({
      securityAdvisoryId,
      userId,
      limit: PUBLIC_RELATION_PAGE_SIZE,
      fromId,
      includes: 'vps,node',
    })
  ).data);
}
