import { describe, expect, it } from "vitest";

import type { Snapshot, SnapshotDownload } from "../../../lib/api/datasets";
import {
  buildSnapshotDownloadPayload,
  defaultSnapshotDownloadDraft,
  downloadChecksum,
  downloadConfirmText,
  downloadExpiration,
  findSnapshotById,
  snapshotDownloadCanOpen,
  snapshotDownloadDraftFromDownload,
  snapshotDownloadFailureMessage,
  snapshotDownloadStatus,
  incrementalFromCandidates,
  refLabel,
  snapshotDownloadHref,
  snapshotDownloadRawHref,
  snapshotLabel,
  uniqSnapshots,
  validateSnapshotDownloadDraft,
} from "./DatasetDownloadModel";

const snapshots: Snapshot[] = [
  { id: 10, name: "snap-a", label: "A" },
  { id: 11, name: "snap-b" },
  { id: 12, name: "snap-c", label: "C" },
];

describe("DatasetDownloadModel", () => {
  it("labels snapshots, refs and generated download metadata safely", () => {
    expect(snapshotLabel(snapshots[0]!)).toBe("A");
    expect(refLabel({ id: 22, name: "base" }, "fallback")).toBe("base");
    expect(refLabel({ id: 22 }, "fallback")).toBe("#22");
    expect(refLabel(null, "fallback")).toBe("fallback");

    const download: SnapshotDownload = {
      id: 7,
      snapshot: { id: 12 },
      expiration_date: "",
      expires_at: "2026-07-01T12:00:00Z",
      sha256sum: "",
      sha256: "abc123",
    };

    expect(downloadExpiration(download)).toBe("2026-07-01T12:00:00Z");
    expect(downloadChecksum(download)).toBe("abc123");
    expect(downloadConfirmText(download)).toBe("7");
  });

  it("builds resilient download hrefs from API fields and legacy fallback", () => {
    expect(
      snapshotDownloadRawHref({ id: 8, download_url: "/download/8" }),
    ).toBe("/download/8");
    expect(
      snapshotDownloadHref(
        { id: 8, download_url: "/download/8" },
        { webuiUrl: "https://legacy.example/ui/" },
      ),
    ).toBe("https://legacy.example/download/8");
    expect(
      snapshotDownloadHref(
        { id: 9, url: "https://cdn.example/file.tar.gz" },
        { webuiUrl: "https://legacy.example" },
      ),
    ).toBe("https://cdn.example/file.tar.gz");
    expect(
      snapshotDownloadHref({ id: 10 }, { webuiUrl: "https://legacy.example" }),
    ).toBe("https://legacy.example/?page=backup&action=download_link&id=10");
  });

  it("rejects executable and protocol-relative download links", () => {
    expect(
      snapshotDownloadHref({ id: 10, download_url: "javascript:alert(1)" }),
    ).toBeUndefined();
    expect(
      snapshotDownloadHref({ id: 10, download_url: "data:text/html,unsafe" }),
    ).toBeUndefined();
    expect(
      snapshotDownloadHref({ id: 10, download_url: "//attacker.example/file" }),
    ).toBeUndefined();
  });

  it("classifies download readiness, expiration and retry payloads", () => {
    const now = "2026-06-20T12:00:00Z";

    expect(
      snapshotDownloadStatus({ id: 1, ready: true }, { href: "/dl/1", now }),
    ).toBe("ready");
    expect(snapshotDownloadCanOpen("ready", "/dl/1")).toBe(true);
    expect(
      snapshotDownloadStatus({ id: 11, download_url: "/dl/11" }, { href: "/dl/11", now }),
    ).toBe("ready");
    expect(
      snapshotDownloadStatus({ id: 2, ready: false }, { href: "/dl/2", now }),
    ).toBe("pending");
    expect(
      snapshotDownloadStatus(
        { id: 3, ready: true, expires_at: "2026-06-19T12:00:00Z" },
        { href: "/dl/3", now },
      ),
    ).toBe("expired");
    expect(
      snapshotDownloadStatus(
        { id: 4, state: "failed", error_message: "zfs send failed" },
        { href: "/dl/4", now },
      ),
    ).toBe("failed");
    expect(
      snapshotDownloadFailureMessage({
        id: 4,
        error_message: "zfs send failed",
      }),
    ).toBe("zfs send failed");
    expect(snapshotDownloadStatus({ id: 5, ready: true }, { now })).toBe(
      "missing_link",
    );

    expect(
      snapshotDownloadDraftFromDownload({
        id: 6,
        snapshot: { id: 201, label: "target" },
        from_snapshot: { id: 200, label: "base" },
        format: "incremental_stream",
      }),
    ).toEqual({
      snapshotId: "201",
      format: "incremental_stream",
      fromSnapshotId: "200",
      sendMail: true,
    });
  });

  it("deduplicates candidates and only offers older snapshots for incremental streams", () => {
    const unique = uniqSnapshots([
      snapshots[2]!,
      snapshots[1]!,
      snapshots[2]!,
      snapshots[0]!,
    ]);
    expect(unique.map((snapshot) => snapshot.id)).toEqual([12, 11, 10]);

    const target = findSnapshotById(unique, "12");
    expect(
      incrementalFromCandidates(unique, target).map((snapshot) => snapshot.id),
    ).toEqual([11, 10]);
    expect(findSnapshotById(unique, "missing")).toBeNull();
  });

  it("validates and builds legacy-compatible snapshot download payloads", () => {
    expect(
      validateSnapshotDownloadDraft(defaultSnapshotDownloadDraft()),
    ).toEqual({
      ok: false,
      issues: ["snapshot_required"],
    });

    const draft = {
      ...defaultSnapshotDownloadDraft(),
      snapshotId: "12",
      format: "incremental_stream" as const,
      fromSnapshotId: "12",
      sendMail: false,
    };

    expect(validateSnapshotDownloadDraft(draft)).toEqual({
      ok: false,
      issues: ["from_snapshot_same_or_newer"],
    });

    expect(
      buildSnapshotDownloadPayload({ ...draft, fromSnapshotId: "10" }),
    ).toEqual({
      snapshot: 12,
      from_snapshot: 10,
      format: "incremental_stream",
      send_mail: false,
    });

    expect(
      buildSnapshotDownloadPayload({
        ...draft,
        format: "archive",
        fromSnapshotId: "10",
      }),
    ).toEqual({
      snapshot: 12,
      from_snapshot: undefined,
      format: "archive",
      send_mail: false,
    });
  });
});
