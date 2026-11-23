import { AxiosError, AxiosHeaders } from "axios";
import {
  begin,
  errorCode,
  markUploaded,
  MAX_ATTEMPTS,
  MAX_ENTRIES,
  newEntryId,
  prune,
  recordAttempt,
  savedOnPhone,
  type SyncEntry,
  toApiEntry,
  toUpload,
  UPLOAD_BATCH,
} from "../syncLog";

const T0 = Date.UTC(2026, 10, 24, 8, 0, 0);

const httpError = (status: number) =>
  new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
const offline = new AxiosError("Network Error", "ERR_NETWORK");
const timedOut = new AxiosError("timeout", "ECONNABORTED");

describe("newEntryId", () => {
  it("matches what the API accepts and does not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newEntryId(T0)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

describe("errorCode", () => {
  it("names HTTP refusals, network failures and timeouts with short codes", () => {
    expect(errorCode(httpError(409))).toEqual({ httpStatus: 409, error: "http_409" });
    expect(errorCode(offline)).toEqual({ httpStatus: null, error: "network" });
    expect(errorCode(timedOut)).toEqual({ httpStatus: null, error: "timeout" });
    expect(errorCode(new Error("Couldn't submit Mama Rose Bar"))).toEqual({
      httpStatus: null,
      error: "unknown",
    });
  });
});

describe("an entry's life", () => {
  it("goes from waiting through retrying to sent, keeping every try", () => {
    let log = begin([], "SL-a-00000001", "mapHotspot", T0);
    expect(log[0]).toMatchObject({ status: "waiting", attemptCount: 0, changedAt: T0 });

    log = recordAttempt(log, "SL-a-00000001", { status: "retrying", err: offline }, T0 + 1000);
    expect(log[0]).toMatchObject({ status: "retrying", attemptCount: 1 });

    log = recordAttempt(
      log,
      "SL-a-00000001",
      { status: "sent", httpStatus: 201, serverRecordId: "h-1" },
      T0 + 2000,
    );
    expect(log[0]).toMatchObject({ status: "sent", serverRecordId: "h-1", attemptCount: 2 });
    expect(log[0].attempts.map((a) => a.error)).toEqual(["network", null]);
  });

  it("does not restart an entry that already exists", () => {
    let log = begin([], "SL-a-00000001", "stockout", T0);
    log = recordAttempt(log, "SL-a-00000001", { status: "retrying", err: offline }, T0 + 1);
    // Queuing after the failed online try reuses the entry.
    expect(begin(log, "SL-a-00000001", "stockout", T0 + 2)).toBe(log);
  });

  it("keeps only the latest tries but counts them all", () => {
    let log = begin([], "SL-a-00000001", "acknowledge", T0);
    for (let i = 1; i <= MAX_ATTEMPTS + 5; i++)
      log = recordAttempt(log, "SL-a-00000001", { status: "retrying", err: offline }, T0 + i);
    expect(log[0].attemptCount).toBe(MAX_ATTEMPTS + 5);
    expect(log[0].attempts).toHaveLength(MAX_ATTEMPTS);
    expect(log[0].attempts[0].at).toBe(T0 + 6);
  });

  it("moves forward even when the phone's clock is set back", () => {
    let log = begin([], "SL-a-00000001", "mapHotspot", T0);
    log = recordAttempt(log, "SL-a-00000001", { status: "retrying", err: offline }, T0 + 5000);
    log = recordAttempt(
      log,
      "SL-a-00000001",
      { status: "refused", err: httpError(409) },
      T0 - 60_000,
    );
    expect(log[0].changedAt).toBe(T0 + 5001);
    expect(log[0].changedAt).toBeGreaterThanOrEqual(log[0].queuedAt);
  });

  it("marks actions with no endpoint as saved on the phone, never sent", () => {
    let log = begin([], "SL-a-00000001", "pickup", T0);
    log = savedOnPhone(log, "SL-a-00000001", T0 + 1);
    expect(log[0]).toMatchObject({ status: "saved_on_phone", attemptCount: 0 });
  });
});

const entry = (n: number, status: SyncEntry["status"], uploaded = false): SyncEntry => ({
  id: `SL-${n}-00000000`,
  action: "stockout",
  status,
  queuedAt: T0 + n,
  changedAt: T0 + n,
  attemptCount: 0,
  attempts: [],
  uploadedAt: uploaded ? T0 + n : undefined,
});

describe("uploading", () => {
  it("sends only versions the server does not have, oldest first, one batch at most", () => {
    const log = [entry(3, "waiting"), entry(1, "sent", true), entry(2, "retrying")];
    expect(toUpload(log).map((e) => e.id)).toEqual(["SL-2-00000000", "SL-3-00000000"]);
    const many = Array.from({ length: UPLOAD_BATCH + 20 }, (_, i) => entry(i, "waiting"));
    expect(toUpload(many)).toHaveLength(UPLOAD_BATCH);
  });

  it("drops finished entries once uploaded and keeps open ones", () => {
    const log = [entry(1, "sent"), entry(2, "retrying"), entry(3, "refused")];
    const after = markUploaded(log, log);
    expect(after.map((e) => e.id)).toEqual(["SL-2-00000000"]);
    expect(toUpload(after)).toEqual([]);
  });

  it("uploads an entry again when it changed during the upload", () => {
    const log = [entry(1, "retrying")];
    const sent = toUpload(log);
    const changed = recordAttempt(log, "SL-1-00000000", { status: "sent" }, T0 + 50);
    const after = markUploaded(changed, sent);
    expect(after).toHaveLength(1);
    expect(toUpload(after).map((e) => e.status)).toEqual(["sent"]);
  });

  it("sends metadata in the API's shape", () => {
    let log = begin([], "SL-a-00000001", "mapHotspot", T0);
    log = recordAttempt(
      log,
      "SL-a-00000001",
      { status: "refused", err: httpError(409) },
      T0 + 1000,
    );
    expect(toApiEntry(log[0])).toEqual({
      client_entry_id: "SL-a-00000001",
      action: "mapHotspot",
      status: "refused",
      server_record_id: null,
      queued_at: "2026-11-24T08:00:00.000Z",
      changed_at: "2026-11-24T08:00:01.000Z",
      attempt_count: 1,
      attempts: [{ at: "2026-11-24T08:00:01.000Z", http_status: 409, error: "http_409" }],
    });
  });
});

describe("prune", () => {
  it("when full, drops the oldest finished entries and never an open one", () => {
    const open = Array.from({ length: 10 }, (_, i) => entry(i, "retrying"));
    const done = Array.from({ length: MAX_ENTRIES }, (_, i) => entry(100 + i, "sent"));
    const after = prune([...open, ...done]);
    expect(after).toHaveLength(MAX_ENTRIES);
    expect(after.filter((e) => e.status === "retrying")).toHaveLength(10);
    expect(after.some((e) => e.id === "SL-100-00000000")).toBe(false);
  });

  it("keeps everything when the log is all open entries, even past the cap", () => {
    const open = Array.from({ length: MAX_ENTRIES + 3 }, (_, i) => entry(i, "waiting"));
    expect(prune(open)).toHaveLength(MAX_ENTRIES + 3);
  });
});
