import { fetchNodes, type Node } from './nodes';

export class NodeCreateReconciliationIncompleteError extends Error {
  constructor() {
    super('The bounded node scan ended before the full list could be verified.');
    this.name = 'NodeCreateReconciliationIncompleteError';
  }
}

export interface NodeCreateFingerprint {
  name: string;
  ip_addr: string;
}

type NodeCreateReconciliationResult =
  | { status: 'found'; node: Node }
  | { status: 'absent' };

/**
 * Reconcile a node create whose response was lost. Node index in vpsAdmin API
 * 4.1/4.2 has no exact name/IP filter, so this deliberately scans the complete
 * admin index with supported `state`, `limit` and `from_id` parameters. The
 * hard cap prevents an accidental unbounded loop; reaching it is inconclusive
 * and must keep another create attempt blocked.
 */
export async function reconcileNodeCreate(
  fingerprint: NodeCreateFingerprint,
  opts: { pageSize?: number; maxNodes?: number } = {}
): Promise<NodeCreateReconciliationResult> {
  const pageSize = Math.max(1, Math.min(500, Math.floor(opts.pageSize ?? 200)));
  const maxNodes = Math.max(pageSize, Math.floor(opts.maxNodes ?? 5000));
  const expectedName = fingerprint.name.trim();
  const expectedIp = fingerprint.ip_addr.trim();
  const seenNodeIds = new Set<number>();
  let fromId: number | undefined;
  let scanned = 0;

  while (scanned < maxNodes) {
    const limit = Math.min(pageSize, maxNodes - scanned);
    const page = (await fetchNodes({ limit, fromId, state: 'all' })).data;
    const found = page.find((node) => (
      String(node.name ?? '').trim() === expectedName
      && String(node.ip_addr ?? '').trim() === expectedIp
    ));
    if (found) return { status: 'found', node: found };

    for (const node of page) {
      const id = Number(node.id);
      if (Number.isFinite(id) && id > 0) seenNodeIds.add(id);
    }
    scanned = seenNodeIds.size;
    if (page.length < limit) return { status: 'absent' };

    // HaveAPI Node::Index is ordered ascending and `from_id` advances with
    // `id > cursor`, so the next cursor is the greatest ID from this page.
    const cursor = page.reduce<number | null>((max, node) => {
      const id = Number(node.id);
      if (!Number.isFinite(id) || id <= 0) return max;
      return max === null || id > max ? id : max;
    }, null);
    if (cursor === null || (fromId !== undefined && cursor <= fromId)) {
      throw new NodeCreateReconciliationIncompleteError();
    }
    fromId = cursor;
  }

  throw new NodeCreateReconciliationIncompleteError();
}

/**
 * A transport failure does not prove that the original POST stopped running.
 * Do not unlock another create after one fast read: require the exact
 * fingerprint to remain absent across several complete scans separated by a
 * settling window. A late commit is returned as soon as it becomes visible.
 */
export async function reconcileNodeCreateAfterSettling(
  fingerprint: NodeCreateFingerprint,
  opts: {
    pageSize?: number;
    maxNodes?: number;
    attempts?: number;
    settleDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {}
): Promise<Extract<NodeCreateReconciliationResult, { status: 'found' }> | { status: 'unresolved' }> {
  const attempts = Math.max(2, Math.min(6, Math.floor(opts.attempts ?? 4)));
  const settleDelayMs = Math.max(0, Math.floor(opts.settleDelayMs ?? 2_000));
  const sleep = opts.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  }));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await reconcileNodeCreate(fingerprint, {
      pageSize: opts.pageSize,
      maxNodes: opts.maxNodes,
    });
    if (result.status === 'found') return result;
    if (attempt < attempts - 1) await sleep(settleDelayMs);
  }

  // Even stable absence is not definitive: Node.register! can continue after
  // the client lost its response and commit much later. Keep the caller
  // fail-closed and let an operator repeat reconciliation later.
  return { status: 'unresolved' };
}
