import { isAxiosError } from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";
import type { ActionType } from "./types";

/**
 * The phone's sync log: one entry per saved action, recording every try to send it. It exists to
 * be uploaded (POST /sync-log) so MOH can see why a submission never arrived; field users never
 * see it. See docs/modules/sync-log.md.
 *
 * Entries hold metadata only. Payloads carry contact names, phone numbers and GPS, and errors are
 * short codes, so nothing the user typed leaves the phone through the log.
 */

export type SyncStatus = "waiting" | "retrying" | "sent" | "refused" | "saved_on_phone";

export interface SyncAttempt {
  at: number;
  httpStatus: number | null;
  /** A short code such as "network" or "http_409"; null when the try succeeded. */
  error: string | null;
}

export interface SyncEntry {
  id: string;
  action: ActionType;
  status: SyncStatus;
  serverRecordId?: string;
  queuedAt: number;
  changedAt: number;
  attemptCount: number;
  /** The latest MAX_ATTEMPTS tries, oldest first. */
  attempts: SyncAttempt[];
  /** The `changedAt` of the version the server has; the entry needs uploading while they differ. */
  uploadedAt?: number;
}

/** Actions the API has no endpoint for yet: applying them changes only the phone's copy. */
export const LOCAL_ONLY: readonly ActionType[] = ["notify", "confirmReceipt", "pickup", "deliver"];

/** The header that tags a request with its entry, so the server's audit log can be matched to it. */
export const ENTRY_HEADER = "X-Client-Entry-Id";

export const MAX_ATTEMPTS = 10;
/** Most entries kept on the phone; the API takes at most UPLOAD_BATCH per request. */
export const MAX_ENTRIES = 500;
export const UPLOAD_BATCH = 100;

const FINAL: readonly SyncStatus[] = ["sent", "refused", "saved_on_phone"];
export const isFinal = (e: SyncEntry) => FINAL.includes(e.status);

/** A new entry ID: time first, so IDs sort roughly by when they were made, then randomness. */
export function newEntryId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `SL-${now.toString(36)}-${random}`;
}

/** Headers for an API call made on behalf of an entry. */
export const entryHeaders = (entryId?: string) =>
  entryId ? { headers: { [ENTRY_HEADER]: entryId } } : undefined;

/** Start an entry for a saved action. An entry that already exists is left as it is. */
export function begin(
  log: SyncEntry[],
  id: string,
  action: ActionType,
  now: number,
  status: SyncStatus = "waiting",
): SyncEntry[] {
  if (log.some((e) => e.id === id)) return log;
  return [
    ...log,
    { id, action, status, queuedAt: now, changedAt: now, attemptCount: 0, attempts: [] },
  ];
}

function update(log: SyncEntry[], id: string, change: (e: SyncEntry) => SyncEntry): SyncEntry[] {
  return log.map((e) => (e.id === id ? change(e) : e));
}

/**
 * The server keeps the version with the latest `changedAt`, so every change moves it forward even
 * when the phone's clock has been set back.
 */
const nextChange = (e: SyncEntry, now: number) => Math.max(now, e.changedAt + 1);

/** A short code for why a try failed: "network", "timeout", "http_409" or "unknown". */
export function errorCode(err: unknown): { httpStatus: number | null; error: string } {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    if (status) return { httpStatus: status, error: `http_${status}` };
    return { httpStatus: null, error: err.code === "ECONNABORTED" ? "timeout" : "network" };
  }
  return { httpStatus: null, error: "unknown" };
}

export type Outcome =
  | { status: "sent"; httpStatus?: number; serverRecordId?: string }
  | { status: "retrying" | "refused"; err: unknown };

/** Record one try at sending an entry and where it leaves the entry. */
export function recordAttempt(
  log: SyncEntry[],
  id: string,
  outcome: Outcome,
  now: number,
): SyncEntry[] {
  return update(log, id, (e) => {
    const attempt: SyncAttempt =
      outcome.status === "sent"
        ? { at: now, httpStatus: outcome.httpStatus ?? null, error: null }
        : { at: now, ...errorCode(outcome.err) };
    return {
      ...e,
      status: outcome.status,
      serverRecordId: outcome.status === "sent" ? outcome.serverRecordId : e.serverRecordId,
      changedAt: nextChange(e, now),
      attemptCount: e.attemptCount + 1,
      attempts: [...e.attempts, attempt].slice(-MAX_ATTEMPTS),
    };
  });
}

/** Mark an entry applied to the phone's copy only, as its action has no API endpoint yet. */
export function savedOnPhone(log: SyncEntry[], id: string, now: number): SyncEntry[] {
  return update(log, id, (e) => ({
    ...e,
    status: "saved_on_phone",
    changedAt: nextChange(e, now),
  }));
}

/** Entries the server does not have in their current version, oldest first, one batch at most. */
export function toUpload(log: SyncEntry[]): SyncEntry[] {
  return log
    .filter((e) => e.uploadedAt !== e.changedAt)
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .slice(0, UPLOAD_BATCH);
}

/**
 * Note which versions the server now has, then prune: finished entries the server has are dropped,
 * and if the log is still over MAX_ENTRIES the oldest finished ones go. Open entries are never
 * dropped, so nothing still waiting to send can vanish from the log.
 */
export function markUploaded(log: SyncEntry[], sent: SyncEntry[]): SyncEntry[] {
  const versions = new Map(sent.map((e) => [e.id, e.changedAt]));
  return prune(
    log.map((e) => (versions.get(e.id) === e.changedAt ? { ...e, uploadedAt: e.changedAt } : e)),
  );
}

export function prune(log: SyncEntry[]): SyncEntry[] {
  const kept = log.filter((e) => !(isFinal(e) && e.uploadedAt === e.changedAt));
  const excess = kept.length - MAX_ENTRIES;
  if (excess <= 0) return kept;
  const oldestFinal = kept
    .filter(isFinal)
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .slice(0, excess)
    .map((e) => e.id);
  const drop = new Set(oldestFinal);
  return kept.filter((e) => !drop.has(e.id));
}

/** Versions sent to the API: letters, digits and . _ + - only, at most 40 characters. */
const version = (v: unknown) =>
  String(v ?? "")
    .replace(/[^A-Za-z0-9._+-]/g, "")
    .slice(0, 40);

/** The phone as the API describes it, or null where the log is not uploaded (web previews). */
export function device(): {
  platform: "android" | "ios";
  os_version: string;
  app_version: string;
} | null {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  return {
    platform: Platform.OS,
    os_version: version(Platform.Version),
    app_version: version(Constants.expoConfig?.version),
  };
}

/** An entry as POST /sync-log takes it. */
export function toApiEntry(e: SyncEntry) {
  const iso = (t: number) => new Date(t).toISOString();
  return {
    client_entry_id: e.id,
    action: e.action,
    status: e.status,
    server_record_id: e.serverRecordId ?? null,
    queued_at: iso(e.queuedAt),
    changed_at: iso(e.changedAt),
    attempt_count: e.attemptCount,
    attempts: e.attempts.map((a) => ({
      at: iso(a.at),
      http_status: a.httpStatus,
      error: a.error,
    })),
  };
}

/** POST /sync-log with one batch of entries. */
export async function uploadSyncLog(
  entries: SyncEntry[],
  phone: NonNullable<ReturnType<typeof device>>,
): Promise<void> {
  await api.post("/sync-log", { device: phone, entries: entries.map(toApiEntry) });
}
