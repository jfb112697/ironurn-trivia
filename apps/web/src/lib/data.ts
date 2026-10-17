/**
 * Dataset loading.
 *
 * Everything is fetched from the edge API (`/api/*` by default, overridable
 * with `VITE_DATA_BASE`). Datasets are immutable per dataset revision, so we
 * cache them in the browser's Cache Storage as well as in memory; the manifest
 * is the only short-lived resource and provides the revision string.
 */
import type { Dataset, Manifest, Meta, Players, Teams, Templates } from "./types";

const DATA_BASE = ((import.meta.env.VITE_DATA_BASE as string | undefined) ?? "/api").replace(/\/+$/, "");
const CACHE_NAME = "ironurn-dataset-v1";

let manifestPromise: Promise<Manifest> | null = null;
let templatesPromise: Promise<Templates> | null = null;
let metaPromise: Promise<Meta> | null = null;

const inflight = new Map<string, Promise<unknown>>();

async function readCache(url: string): Promise<Response | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(url)) ?? null;
  } catch {
    return null;
  }
}

async function writeCache(url: string, res: Response): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, res);
  } catch {
    /* Cache Storage is best-effort (private mode, quota, …) */
  }
}

/** Fetch JSON, using Cache Storage for immutable resources. */
async function fetchJson<T>(url: string, persist: boolean): Promise<T> {
  if (persist) {
    const hit = await readCache(url);
    if (hit) {
      try {
        return (await hit.json()) as T;
      } catch {
        /* corrupt entry — fall through to network */
      }
    }
  }

  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    throw new Error(`Dataset request failed (${res.status}) for ${url}`);
  }
  if (persist) void writeCache(url, res.clone());
  return (await res.json()) as T;
}

function once<T>(url: string, persist: boolean): Promise<T> {
  let p = inflight.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetchJson<T>(url, persist).catch((err) => {
      inflight.delete(url);
      throw err;
    });
    inflight.set(url, p);
  }
  return p;
}

export function loadManifest(): Promise<Manifest> {
  // Short-lived: never persisted to Cache Storage, so a data refresh is picked up.
  manifestPromise ??= fetchJson<Manifest>(`${DATA_BASE}/manifest`, false);
  return manifestPromise;
}

export function loadMeta(): Promise<Meta> {
  metaPromise ??= file<Meta>("meta.json");
  return metaPromise;
}

export function loadTemplates(): Promise<Templates> {
  templatesPromise ??= once<Templates>(`${DATA_BASE}/templates`, true);
  return templatesPromise;
}

async function file<T>(name: string, version?: string): Promise<T> {
  const url = `${DATA_BASE}/dataset/${name}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  return once<T>(url, true);
}

/** Which raw table backs a statistic. */
export function tableFor(meta: Meta, stat: string): "batting" | "pitching" | "war" {
  const def = meta.stats[stat];
  if (def?.kind === "war") return "war";
  if (def?.group === "pitching") return "pitching";
  return "batting";
}

const datasetCache = new Map<string, Promise<Dataset>>();

/**
 * Load everything needed to play a statistic: metadata, teams, players and the
 * one relevant table. The four requests run in parallel and are cached.
 */
export function loadDataset(stat: string): Promise<Dataset> {
  const key = tableForKind(stat);
  let p = datasetCache.get(key);
  if (!p) {
    p = (async () => {
      const [meta, manifest] = await Promise.all([loadMeta(), loadManifest()]);
      const table = tableFor(meta, stat);
      const [teams, players, rows] = await Promise.all([
        file<Teams>("teams.json", manifest.generated),
        file<Players>("players.json", manifest.generated),
        file<unknown[]>(`${table}.json`, manifest.generated),
      ]);
      const ds: Dataset = { meta, teams, players };
      if (table === "batting") ds.batting = rows as Dataset["batting"];
      else if (table === "pitching") ds.pitching = rows as Dataset["pitching"];
      else ds.war = rows as Dataset["war"];
      return ds;
    })().catch((err) => {
      datasetCache.delete(key);
      throw err;
    });
    datasetCache.set(key, p);
  }
  return p;
}

/** Coarse key so different stats sharing a table share one load. */
function tableForKind(stat: string): string {
  if (["war", "warh", "warp"].includes(stat)) return "war";
  if (["wins", "k", "bb", "ip", "era", "whip", "g", "sv"].includes(stat)) return "pitching";
  return "batting";
}

/** Warm the cache for a statistic without blocking on it. */
export function preload(stat: string): void {
  void loadDataset(stat).catch(() => undefined);
}
