import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../lib/api/securityAdvisories', () => ({
  createSecurityAdvisoryCve: vi.fn(),
  deleteSecurityAdvisoryCve: vi.fn(),
  fetchSecurityAdvisoryAffectedUsers: vi.fn(),
  fetchSecurityAdvisoryAffectedVps: vi.fn(),
  fetchSecurityAdvisoryCves: vi.fn(),
}));

import {
  createSecurityAdvisoryCve,
  deleteSecurityAdvisoryCve,
  fetchSecurityAdvisoryAffectedUsers,
  fetchSecurityAdvisoryAffectedVps,
  fetchSecurityAdvisoryCves,
} from '../../../../lib/api/securityAdvisories';
import {
  fetchAllSecurityAdvisoryAffectedUsersForAdmin,
  fetchAllSecurityAdvisoryAffectedVpsForAdmin,
  fetchAllSecurityAdvisoryCvesForAdmin,
  reconcileSecurityAdvisoryCves,
} from './securityAdvisoryAdminApi';

const createCve = vi.mocked(createSecurityAdvisoryCve);
const deleteCve = vi.mocked(deleteSecurityAdvisoryCve);
const fetchAffectedUsers = vi.mocked(fetchSecurityAdvisoryAffectedUsers);
const fetchAffectedVps = vi.mocked(fetchSecurityAdvisoryAffectedVps);
const fetchCves = vi.mocked(fetchSecurityAdvisoryCves);

describe('reconcileSecurityAdvisoryCves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCve.mockResolvedValue({ data: { id: 3 }, meta: undefined } as never);
    deleteCve.mockResolvedValue({ data: null, meta: undefined } as never);
  });

  test('creates additions before deleting obsolete CVEs', async () => {
    const calls: string[] = [];
    createCve.mockImplementation(async () => {
      calls.push('create');
      return { data: { id: 3 }, meta: undefined } as never;
    });
    deleteCve.mockImplementation(async () => {
      calls.push('delete');
      return { data: null, meta: undefined } as never;
    });

    await reconcileSecurityAdvisoryCves(
      44,
      [{ id: 1, cve_id: 'CVE-2026-1000' }],
      ['CVE-2026-2000'],
    );

    expect(calls).toEqual(['create', 'delete']);
  });

  test('keeps existing CVEs when creating an addition fails', async () => {
    createCve.mockRejectedValue(new Error('create failed'));

    await expect(
      reconcileSecurityAdvisoryCves(
        44,
        [{ id: 1, cve_id: 'CVE-2026-1000' }],
        ['CVE-2026-2000'],
      ),
    ).rejects.toThrow('create failed');

    expect(deleteCve).not.toHaveBeenCalled();
  });
});

describe('security advisory admin cursor collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('loads every CVE page and removes an inclusive cursor duplicate', async () => {
    fetchCves
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, cve_id: `CVE-2026-${index + 1}` })),
      } as never)
      .mockResolvedValueOnce({
        data: [
          { id: 100, cve_id: 'CVE-2026-100' },
          { id: 101, cve_id: 'CVE-2026-101' },
        ],
      } as never);

    const rows = await fetchAllSecurityAdvisoryCvesForAdmin(44);

    expect(rows).toHaveLength(101);
    expect(rows.at(-1)?.id).toBe(101);
    expect(fetchCves).toHaveBeenNthCalledWith(1, {
      securityAdvisoryId: 44,
      limit: 100,
      fromId: undefined,
    });
    expect(fetchCves).toHaveBeenNthCalledWith(2, {
      securityAdvisoryId: 44,
      limit: 100,
      fromId: 100,
    });
  });

  test('loads all affected users with the required relation include', async () => {
    fetchAffectedUsers
      .mockResolvedValueOnce({
        data: Array.from({ length: 1_000 }, (_, index) => ({ id: index + 1 })),
      } as never)
      .mockResolvedValueOnce({ data: [{ id: 1_001 }] } as never);

    const rows = await fetchAllSecurityAdvisoryAffectedUsersForAdmin(44);

    expect(rows).toHaveLength(1_001);
    expect(fetchAffectedUsers).toHaveBeenNthCalledWith(2, {
      securityAdvisoryId: 44,
      limit: 1_000,
      fromId: 1_000,
      includes: 'user',
    });
  });

  test('loads affected VPS with the complete relation include', async () => {
    fetchAffectedVps.mockResolvedValueOnce({ data: [{ id: 9 }] } as never);

    await expect(fetchAllSecurityAdvisoryAffectedVpsForAdmin(44)).resolves.toEqual([{ id: 9 }]);
    expect(fetchAffectedVps).toHaveBeenCalledWith({
      securityAdvisoryId: 44,
      limit: 1_000,
      fromId: undefined,
      includes: 'vps,user,environment,location,node',
    });
  });

  test('fails instead of returning a truncated relation when the cursor stalls', async () => {
    const repeatedPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
    fetchCves.mockResolvedValue({ data: repeatedPage } as never);

    await expect(fetchAllSecurityAdvisoryCvesForAdmin(44))
      .rejects.toThrow('pagination stalled before all rows were loaded');
    expect(fetchCves).toHaveBeenCalledTimes(2);
  });
});
