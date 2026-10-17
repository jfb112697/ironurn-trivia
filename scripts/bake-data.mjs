#!/usr/bin/env node
/**
 * Copy the built dataset (`data/out/*.json`) into the client's build output
 * (`apps/web/dist/data/`).
 *
 * Cloudflare serves everything in the build output as *static assets*, and
 * static-asset requests are free and unlimited and do not count against the
 * Worker request quota. Baking the dataset into the deploy is therefore what
 * makes the site free at any scale: page loads, scripts and the whole dataset
 * are all static, and the Worker is only reached for the `/api/*` endpoints.
 *
 * Run after `vite build` — the root `npm run build` does this for you.
 */
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const SRC_DIR = join(ROOT, "data", "out");
const DIST_DIR = join(ROOT, "apps", "web", "dist");
const DEST_DIR = join(DIST_DIR, "data");

/**
 * `schedule.json` is deliberately not shipped to the browser: the client
 * derives every daily and mini puzzle locally from `templates.json` (see
 * `apps/web/src/lib/schedule.ts`), so the precomputed 730-day schedule is only
 * used by the data pipeline and the edge API.
 */
const SKIP = new Set(["schedule.json"]);

export async function bakeData() {
  if (!existsSync(join(DIST_DIR, "index.html"))) {
    throw new Error(
      `No client build found at ${DIST_DIR}. Build it first: npm --workspace apps/web run build`,
    );
  }

  // `data/out` is gitignored, so a code-only deploy may not have it. That is
  // fine: the Worker serves /data/* from R2 whenever a file was not baked.
  let files = [];
  try {
    files = (await readdir(SRC_DIR)).filter((f) => f.endsWith(".json") && !SKIP.has(f)).sort();
    // eslint-disable-next-line no-empty
  } catch {}

  if (!files.length) return { files, bytes: 0 };

  await mkdir(DEST_DIR, { recursive: true });

  let bytes = 0;
  for (const file of files) {
    bytes += (await stat(join(SRC_DIR, file))).size;
    await copyFile(join(SRC_DIR, file), join(DEST_DIR, file));
  }

  return { files, bytes };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  bakeData()
    .then(({ files, bytes }) => {
      if (!files.length) {
        console.warn(
          "No dataset found in data/out — skipping the bake.\n" +
            "The Worker will serve /data/* from R2 until the next `Refresh dataset` run.",
        );
        return;
      }
      console.log(
        `Baked ${files.length} dataset files (${(bytes / 1024 / 1024).toFixed(2)} MB) into apps/web/dist/data\n` +
          `These ship as static assets: free, unlimited, and they never touch the Worker quota.`,
      );
    })
    .catch((err) => {
      console.error(`bake failed: ${err.message}`);
      process.exit(1);
    });
}
