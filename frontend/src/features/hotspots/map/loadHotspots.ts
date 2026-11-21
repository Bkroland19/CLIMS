import { parseList, toApiError, type HttpClient } from '@/lib/api';

import { mapHotspotSchema, type MapHotspot } from './records';

/*
 * Loads every hotspot the user can see, for the map, through the list endpoint
 * the rest of the app uses (`GET /hotspots?district_id=&limit=&offset=`, at most
 * 100 a page, newest first, no total).
 *
 * A national user sees about 18,000 hotspots. Paging through them all in one
 * list costs the database a sort of the whole table for every page, and the
 * deepest pages take over half a second each. One district's pages come from the
 * `(district_id, updated_at)` index in milliseconds, so a national load asks for
 * each district on its own, a few at a time, and the map fills in as they arrive.
 * Hotspots with no district recorded are not in any district's list, so a
 * national load cannot see them.
 *
 * A user scoped to their own hotspots (a VHT) or their district (a DCFP) has one
 * list; it is read several pages at a time instead.
 */

export const PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 6;
const PROGRESS_INTERVAL_MS = 500;
const RETRIES = 2;
const RETRY_DELAY_MS = 400;
const TRANSIENT = new Set(['network', 'timeout', 'server']);

/** One list to page through: a district's hotspots, or (`districtId: null`) all the user sees. */
export interface Partition {
  districtId: string | null;
  /** The district's name, to say which failed. */
  label: string;
}

export interface LoadProgress {
  /** Everything loaded so far. */
  hotspots: MapHotspot[];
  partitionsDone: number;
  partitionsTotal: number;
}

export interface LoadResult {
  hotspots: MapHotspot[];
  /** Lists that still failed after retrying; the rest of the map is usable. */
  failed: Partition[];
  partitionsTotal: number;
}

interface LoadOptions {
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: LoadProgress) => void;
  /** Waits between retries; replaced in tests. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

export async function fetchHotspotPage(
  http: HttpClient,
  districtId: string | null,
  offset: number,
  signal?: AbortSignal,
): Promise<MapHotspot[]> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (districtId) query.set('district_id', districtId);
  return parseList(mapHotspotSchema, await http.get(`/hotspots?${query}`, { signal }), 'hotspots');
}

interface PartitionState {
  partition: Partition;
  /** Offset of the first missing row once a short page has been seen. */
  end: number;
  failed: boolean;
  lanesLeft: number;
}

interface Task {
  state: PartitionState;
  offset: number;
}

export async function loadHotspots(
  http: HttpClient,
  partitions: readonly Partition[],
  { signal, concurrency = DEFAULT_CONCURRENCY, onProgress, wait = sleep }: LoadOptions = {},
): Promise<LoadResult> {
  const byId = new Map<string, MapHotspot>();
  const failures: { partition: Partition; error: unknown }[] = [];
  // One list is read `concurrency` pages at a time; many lists one page each at a time.
  const lanes = partitions.length === 1 ? concurrency : 1;
  const queue: Task[] = partitions.flatMap((partition) => {
    const state: PartitionState = { partition, end: Infinity, failed: false, lanesLeft: lanes };
    return Array.from({ length: lanes }, (_, lane) => ({ state, offset: lane * PAGE_SIZE }));
  });
  let partitionsDone = 0;
  let lastProgress = 0;

  const report = (force: boolean) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return;
    lastProgress = now;
    onProgress({
      hotspots: [...byId.values()],
      partitionsDone,
      partitionsTotal: partitions.length,
    });
  };

  const finishLane = (state: PartitionState) => {
    state.lanesLeft -= 1;
    if (state.lanesLeft === 0) partitionsDone += 1;
  };

  const fetchWithRetry = async (task: Task): Promise<MapHotspot[]> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetchHotspotPage(http, task.state.partition.districtId, task.offset, signal);
      } catch (error) {
        const kind = toApiError(error).kind;
        if (signal?.aborted || attempt >= RETRIES || !TRANSIENT.has(kind)) throw error;
        await wait(RETRY_DELAY_MS * 2 ** attempt, signal);
      }
    }
  };

  const run = async (task: Task): Promise<void> => {
    const { state } = task;
    if (state.failed || task.offset >= state.end) {
      finishLane(state);
      return;
    }
    try {
      const page = await fetchWithRetry(task);
      for (const hotspot of page) byId.set(hotspot.id, hotspot);
      if (page.length < PAGE_SIZE) {
        state.end = Math.min(state.end, task.offset + page.length);
        finishLane(state);
      } else {
        queue.push({ state, offset: task.offset + lanes * PAGE_SIZE });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      // Another lane of the same list may have failed first.
      if (!failures.some((failure) => failure.partition === state.partition)) {
        failures.push({ partition: state.partition, error });
      }
      state.failed = true;
      finishLane(state);
    }
    report(false);
  };

  // A small worker pool: each worker takes the next page until none are left.
  const worker = async (): Promise<void> => {
    for (let task = queue.shift(); task; task = queue.shift()) {
      await run(task);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(Array.from({ length: workers }, worker));

  // Nothing loaded and nothing found: report the failure rather than an empty map.
  const firstFailure = failures[0];
  if (firstFailure && failures.length === partitions.length) throw firstFailure.error;
  report(true);
  return {
    hotspots: [...byId.values()],
    failed: failures.map(({ partition }) => partition),
    partitionsTotal: partitions.length,
  };
}
