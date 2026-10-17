/**
 * IronUrn Trivia — edge API.
 *
 * This Worker also hosts the React app: everything in `apps/web/dist` (the
 * client bundle plus the baked dataset) is served as static assets, which are
 * free, unlimited and exempt from the Worker request quota. The Worker script
 * itself only runs for requests that match no asset — in practice `/api/*`.
 *
 * Responsibilities of the script (deliberately tiny, so it stays free at any
 * scale):
 *   • Serve the compact, prebuilt datasets from R2 through the edge cache.
 *   • Resolve daily/mini puzzles deterministically (no database, no cron).
 *
 * Everything it returns is public and immutable-per-revision, so responses are
 * cached at the edge and in the browser for a year.
 */
import { puzzleFor, type Templates } from "./schedule";

export interface Env {
  DATASET: R2Bucket;
  DATASET_PREFIX: string;
  ALLOWED_ORIGIN: string;
}

/** Dataset objects that may be fetched through /api/dataset/:file. */
const DATASET_FILES = new Set([
  "meta.json",
  "players.json",
  "teams.json",
  "batting.json",
  "pitching.json",
  "war.json",
  "live.json",
  "manifest.json",
  "templates.json",
  "schedule.json",
]);

let templatesMemo: Templates | null = null;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function resolveOrigin(request: Request, env: Env): string {
  const allowed = (env.ALLOWED_ORIGIN || "*").trim();
  if (allowed === "*") return "*";
  const reqOrigin = request.headers.get("origin") || "";
  const list = allowed.split(",").map((s) => s.trim());
  return list.includes(reqOrigin) ? reqOrigin : list[0] ?? "*";
}

function json(data: unknown, status: number, origin: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

const CACHE_CONTROL: Record<string, string> = {
  // Datasets are immutable for a given revision; the client appends ?v=<generated>.
  immutable: "public, max-age=31536000, immutable",
  // The manifest defines the current revision, so it is only cached briefly —
  // that's what makes a data refresh visible within about a minute.
  short: "public, max-age=60, s-maxage=120, stale-while-revalidate=3600",
};

async function serveObject(
  env: Env,
  ctx: ExecutionContext,
  file: string,
  cacheKind: keyof typeof CACHE_CONTROL,
  origin: string,
  method: string,
  version = "",
): Promise<Response> {
  const key = `${env.DATASET_PREFIX}/${file}`;
  const cache = caches.default;
  // The revision is part of the cache key: object keys stay stable, but a new
  // dataset revision (manifest `generated`) gets a cold, fresh edge entry.
  const cacheKey = new Request(`https://ironurn.internal/${key}${version ? `?v=${version}` : ""}`, {
    method: "GET",
  });

  const hit = await cache.match(cacheKey);
  if (hit) {
    const headers = new Headers(hit.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
    return new Response(method === "HEAD" ? null : hit.body, { status: 200, headers });
  }

  const obj = await env.DATASET.get(key);
  if (!obj) {
    return json(
      { error: "dataset_missing", key, hint: "Run `npm run seed` to upload data/out to R2." },
      404,
      origin,
    );
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("content-type", headers.get("content-type") || "application/json; charset=utf-8");
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", CACHE_CONTROL[cacheKind]);
  if (headers.get("content-type")?.includes("json")) headers.set("content-type", "application/json; charset=utf-8");

  const body = await obj.arrayBuffer();
  const response = new Response(body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  const out = new Response(method === "HEAD" ? null : response.body, { status: 200, headers: new Headers(headers) });
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

async function loadTemplates(env: Env, ctx: ExecutionContext, origin: string): Promise<Templates> {
  if (templatesMemo) return templatesMemo;
  const res = await serveObject(env, ctx, "templates.json", "immutable", origin, "GET");
  templatesMemo = (await res.json()) as Templates;
  return templatesMemo;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveOrigin(request, env);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/health") {
        return json({ ok: true, prefix: env.DATASET_PREFIX, time: new Date().toISOString() }, 200, origin);
      }

      if (path === "/api/manifest") {
        return await serveObject(env, ctx, "manifest.json", "short", origin, method);
      }

      if (path === "/api/templates") {
        return await serveObject(env, ctx, "templates.json", "immutable", origin, method);
      }

      // Plain-file aliases. A client built with `VITE_DATA_BASE=<worker>/api`
      // then uses exactly the same `/data/<file>.json` URL shapes it uses
      // against the static assets, which keeps both delivery paths identical.
      const alias = /^\/api\/([a-z]+)\.json$/.exec(path);
      if (alias) {
        const file = `${alias[1]}.json`;
        if (DATASET_FILES.has(file) && file !== "schedule.json") {
          const kind = file === "manifest.json" ? "short" : "immutable";
          return await serveObject(env, ctx, file, kind, origin, method, url.searchParams.get("v") ?? "");
        }
      }

      // /data/<file>.json is normally served directly as a static asset, which
      // is free and unlimited. It only reaches this code when the file was not
      // baked into the deploy (e.g. a code-only deploy before the first data
      // refresh) — then R2 keeps the app working.
      const dataFile = /^\/data\/([a-z]+)\.json$/.exec(path);
      if (dataFile) {
        const file = `${dataFile[1]}.json`;
        if (DATASET_FILES.has(file) && file !== "schedule.json") {
          const kind = file === "manifest.json" ? "short" : "immutable";
          return await serveObject(env, ctx, file, kind, origin, method, url.searchParams.get("v") ?? "");
        }
      }

      if (path.startsWith("/api/dataset/")) {
        const file = path.slice("/api/dataset/".length);
        if (!DATASET_FILES.has(file) || file === "schedule.json") {
          return json({ error: "not_found" }, 404, origin);
        }
        const kind = file === "manifest.json" ? "short" : "immutable";
        return await serveObject(env, ctx, file, kind, origin, method, url.searchParams.get("v") ?? "");
      }

      if (path === "/api/schedule" || path.startsWith("/api/schedule/")) {
        const part = path === "/api/schedule" ? "ppd" : path.slice("/api/schedule/".length);
        const mode = part === "ppd" ? "daily" : part === "ppm" ? "mini" : null;
        if (!mode) return json({ error: "not_found" }, 404, origin);
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad_date" }, 400, origin);
        const tpl = await loadTemplates(env, ctx, origin);
        const puzzle = puzzleFor(tpl, date, mode);
        return json(puzzle, 200, origin, {
          "cache-control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
        });
      }

      return json({ error: "not_found", path }, 404, origin);
    } catch (err) {
      return json({ error: "internal", message: err instanceof Error ? err.message : String(err) }, 500, origin);
    }
  },
} satisfies ExportedHandler<Env>;
