#!/usr/bin/env node
/**
 * Restore the built dataset (`data/out/*.json`) from R2 before a deploy, so a
 * code-only push still ships the current data as static assets.
 *
 * Best-effort by design:
 *   • If a local dataset already exists (a data refresh just built one), this
 *     is a no-op — it never overwrites fresher local data with older R2 data.
 *   • If the bucket is empty (first ever deploy), it exits 0 and the Worker
 *     serves /data/* from R2 instead.
 *
 * Requires an authenticated wrangler, or the CLOUDFLARE_API_TOKEN /
 * CLOUDFLARE_ACCOUNT_ID environment variables in CI.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = join(ROOT, "data", "out");

const BUCKET = process.env.R2_BUCKET || "ironurn-dataset";
const PREFIX = (process.env.DATASET_PREFIX || "v1").replace(/\/+$/, "");

/** Everything the app and the API can ask for. */
const FILES = [
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
];

function wrangler(args) {
  return spawnSync("npx", ["wrangler", ...args], {
    stdio: "ignore",
    cwd: ROOT,
    // npm/npx are .cmd shims on Windows, which require a shell to spawn.
    shell: process.platform === "win32",
  });
}

async function main() {
  if (existsSync(join(OUT_DIR, "manifest.json"))) {
    console.log("Local dataset already present — keeping it (not restoring from R2).");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  let restored = 0;
  for (const file of FILES) {
    const key = `${BUCKET}/${PREFIX}/${file}`;
    const res = wrangler(["r2", "object", "get", key, `--file=${join(OUT_DIR, file)}`, "--remote"]);
    if (res.status === 0 && existsSync(join(OUT_DIR, file))) restored += 1;
  }

  if (restored === 0) {
    console.log("R2 is empty (first deploy?) — the Worker will serve /data/* from R2 until the first refresh.");
  } else {
    console.log(`Restored ${restored}/${FILES.length} dataset files from r2://${BUCKET}/${PREFIX}/.`);
  }
}

main().catch((err) => {
  // Never fail a deploy over this: the Worker's /data/* fallback still works.
  console.warn(`dataset restore skipped: ${err.message}`);
});
