import type {
  Snapshot,
  SnapshotDownload,
  SnapshotDownloadFormat,
} from "../../../lib/api/datasets";
import { safeContentUrl } from "../../../lib/safeUrl";

export interface SnapshotDownloadDraft {
  snapshotId: string;
  format: SnapshotDownloadFormat;
  fromSnapshotId: string;
  sendMail: boolean;
}

export type SnapshotDownloadValidationIssue =
  | "snapshot_required"
  | "from_snapshot_same_or_newer";

export interface SnapshotDownloadValidationResult {
  ok: boolean;
  issues: SnapshotDownloadValidationIssue[];
}

export interface SnapshotDownloadHrefOptions {
  webuiUrl?: string;
  origin?: string;
}

export type SnapshotDownloadStatus =
  | "ready"
  | "pending"
  | "expired"
  | "failed"
  | "missing_link"
  | "unknown";

export interface SnapshotDownloadStatusOptions
  extends SnapshotDownloadHrefOptions {
  href?: string;
  now?: Date | string | number;
}

const downloadUrlFields = [
  "url",
  "download_url",
  "download_link",
  "href",
  "link",
  "file_url",
] as const;

const failedStates = new Set([
  "failed",
  "failure",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "aborted",
]);

const pendingStates = new Set([
  "new",
  "pending",
  "queued",
  "created",
  "creating",
  "generating",
  "running",
  "processing",
  "waiting",
  "preparing",
  "prepared",
]);

const readyStates = new Set([
  "ready",
  "done",
  "finished",
  "completed",
  "complete",
  "available",
]);

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = nonEmptyString(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

function currentBase(options: SnapshotDownloadHrefOptions): string | undefined {
  return normalizeBaseUrl(options.webuiUrl) ?? normalizeBaseUrl(options.origin);
}

function resolveDownloadHref(
  rawHref: string,
  options: SnapshotDownloadHrefOptions,
): string {
  if (/^[\\/]{2}/.test(rawHref)) return "";
  const base = currentBase(options);
  if (!base) return safeContentUrl(rawHref) ?? "";

  try {
    return safeContentUrl(new URL(rawHref, `${base}/`).toString()) ?? "";
  } catch {
    return "";
  }
}

function lowerRecordString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = record[key];
  return nonEmptyString(raw)?.toLowerCase();
}

function positiveId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  if (value && typeof value === "object") {
    return positiveId((value as Record<string, unknown>)["id"]);
  }

  return undefined;
}

function optionNowMillis(value: SnapshotDownloadStatusOptions["now"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  return Date.now();
}

function dateMillis(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rawLifecycleState(download: SnapshotDownload): string | undefined {
  const record = download as Record<string, unknown>;
  return (
    lowerRecordString(record, "state") ??
    lowerRecordString(record, "status") ??
    lowerRecordString(record, "object_state") ??
    lowerRecordString(record, "download_state") ??
    lowerRecordString(record, "file_state")
  );
}

export function snapshotLabel(snapshot: Snapshot): string {
  return String(snapshot.label ?? snapshot.name ?? `#${snapshot.id}`);
}

export function refLabel(ref: unknown, fallback: string): string {
  if (!ref || typeof ref !== "object") return fallback;
  const record = ref as Record<string, unknown>;
  const label = record["label"] ?? record["name"];
  if (label !== undefined && label !== null && String(label).trim()) {
    return String(label);
  }
  const id = record["id"];
  return id !== undefined && id !== null ? `#${id}` : fallback;
}

export function downloadExpiration(
  download: SnapshotDownload,
): string | undefined {
  for (const raw of [download.expiration_date, download.expires_at]) {
    if (typeof raw === "string" && raw.trim()) return raw;
  }
  return undefined;
}

export function downloadChecksum(
  download: SnapshotDownload,
): string | undefined {
  const fallback = download["sha256"];
  for (const raw of [
    download.sha256sum,
    typeof fallback === "string" ? fallback : undefined,
  ]) {
    if (typeof raw === "string" && raw.trim()) return raw;
  }
  return undefined;
}

export function snapshotDownloadFailureMessage(
  download: SnapshotDownload,
): string | undefined {
  const record = download as Record<string, unknown>;
  for (const key of [
    "error_message",
    "last_error",
    "failed_reason",
    "failure_reason",
    "fail_reason",
    "failure",
    "error",
  ]) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return undefined;
}

export function snapshotDownloadRawHref(
  download: SnapshotDownload,
): string | undefined {
  for (const key of downloadUrlFields) {
    const value = nonEmptyString(download[key]);
    if (value) return value;
  }
  return undefined;
}

export function legacySnapshotDownloadHref(
  id: number,
  options: SnapshotDownloadHrefOptions,
): string | undefined {
  if (!Number.isFinite(id) || id <= 0) return undefined;
  const base = currentBase(options);
  const query = `?page=backup&action=download_link&id=${encodeURIComponent(String(id))}`;
  return base ? `${base}/${query}` : `/${query}`;
}

export function snapshotDownloadHref(
  download: SnapshotDownload,
  options: SnapshotDownloadHrefOptions = {},
): string | undefined {
  const raw = snapshotDownloadRawHref(download);
  if (raw) return resolveDownloadHref(raw, options) || undefined;
  return legacySnapshotDownloadHref(Number(download.id), options);
}

export function snapshotDownloadStatus(
  download: SnapshotDownload,
  options: SnapshotDownloadStatusOptions = {},
): SnapshotDownloadStatus {
  const record = download as Record<string, unknown>;
  const state = rawLifecycleState(download);
  const hasHref = Boolean(nonEmptyString(options.href));
  const failureMessage = snapshotDownloadFailureMessage(download);

  if (state && failedStates.has(state)) return "failed";
  if (record["failed"] === true || record["success"] === false || failureMessage) {
    return "failed";
  }

  const expiresAt = dateMillis(downloadExpiration(download));
  if (expiresAt !== undefined && expiresAt <= optionNowMillis(options.now)) {
    return "expired";
  }

  if (download.ready === false) return "pending";
  if (state && pendingStates.has(state)) return "pending";

  if (download.ready === true) return hasHref ? "ready" : "missing_link";
  if (state && readyStates.has(state)) return hasHref ? "ready" : "missing_link";

  // Older API/legacy responses sometimes omit `ready` but already expose a usable URL.
  if (hasHref) return "ready";

  return "unknown";
}

export function snapshotDownloadCanOpen(
  status: SnapshotDownloadStatus,
  href: string | undefined,
): boolean {
  return status === "ready" && Boolean(nonEmptyString(href));
}

export function snapshotDownloadDraftFromDownload(
  download: SnapshotDownload,
): SnapshotDownloadDraft {
  const snapshotId = positiveId(download.snapshot);
  const fromSnapshotId = positiveId(download.from_snapshot);
  const format =
    download.format === "archive" ||
    download.format === "stream" ||
    download.format === "incremental_stream"
      ? download.format
      : "archive";

  return {
    snapshotId: snapshotId ? String(snapshotId) : "",
    format,
    fromSnapshotId:
      format === "incremental_stream" && fromSnapshotId
        ? String(fromSnapshotId)
        : "",
    sendMail: true,
  };
}

export function uniqSnapshots(input: Snapshot[]): Snapshot[] {
  const byId = new Map<number, Snapshot>();
  for (const snapshot of input) {
    const id = Number(snapshot.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!byId.has(id)) byId.set(id, snapshot);
  }
  return [...byId.values()];
}

export function findSnapshotById(
  snapshots: Snapshot[],
  idValue: string,
): Snapshot | null {
  const id = Number(idValue);
  if (!Number.isFinite(id) || id <= 0) return null;
  return snapshots.find((snapshot) => Number(snapshot.id) === id) ?? null;
}

export function incrementalFromCandidates(
  snapshots: Snapshot[],
  target: Snapshot | null,
): Snapshot[] {
  const targetId = target ? Number(target.id) : NaN;
  return snapshots
    .filter((snapshot) => {
      const id = Number(snapshot.id);
      if (!Number.isFinite(targetId)) return true;
      return Number.isFinite(id) ? id < targetId : true;
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

export function defaultSnapshotDownloadDraft(): SnapshotDownloadDraft {
  return {
    snapshotId: "",
    format: "archive",
    fromSnapshotId: "",
    sendMail: true,
  };
}

export function validateSnapshotDownloadDraft(
  draft: SnapshotDownloadDraft,
): SnapshotDownloadValidationResult {
  const issues: SnapshotDownloadValidationIssue[] = [];
  const snapshot = Number(draft.snapshotId);
  const fromSnapshot = Number(draft.fromSnapshotId);

  if (!Number.isFinite(snapshot) || snapshot <= 0) {
    issues.push("snapshot_required");
  }

  if (
    draft.format === "incremental_stream" &&
    Number.isFinite(snapshot) &&
    Number.isFinite(fromSnapshot) &&
    fromSnapshot > 0 &&
    fromSnapshot >= snapshot
  ) {
    issues.push("from_snapshot_same_or_newer");
  }

  return { ok: issues.length === 0, issues };
}

export function buildSnapshotDownloadPayload(draft: SnapshotDownloadDraft) {
  return {
    snapshot: Number(draft.snapshotId),
    from_snapshot:
      draft.format === "incremental_stream" && draft.fromSnapshotId
        ? Number(draft.fromSnapshotId)
        : undefined,
    format: draft.format,
    send_mail: draft.sendMail,
  };
}

export function resetSnapshotDownloadDraftPatch() {
  return defaultSnapshotDownloadDraft();
}

export function downloadConfirmText(
  download: SnapshotDownload | null,
): string | undefined {
  return download ? String(download.id) : undefined;
}
