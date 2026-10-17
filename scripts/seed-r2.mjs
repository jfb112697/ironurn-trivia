#!/usr/bin/env node
/**
 * Upload the built dataset (`data/out/*.json`) to the Cloudflare R2 bucket that
 * backs the edge API.
 *
 *   npm run seed            # local wrangler session, remote bucket
 *   npm run seed:remote     # same thing (kept for symmetry)
 *   node scripts/seed-r2.mjs --dry-run
 *
 * Requires an authenticated wrangler (`npx wrangler login`) or, in CI, the
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID environment variables.
 */
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = join(ROOT, "data", "out");

const BUCKET = process.env.R2_BUCKET || "ironurn-dataset";
const PREFIX = (process.env.DATASET_PREFIX || "v1").replace(/\/+$/, "");
const DRY = process.argv.includes("--dry-run");

const IMMUTABLE = new Set(["meta.json", "players.json", "teams.json", "batting.json", "pitching.json", "war.json", "templates.json"]);
const cacheControlFor = (file) => (IMMUTABLE.has(file) ? "public, max-age=31536000, immutable" : "public, max-age=300");

function wrangler(args) {
  const res = spawnSync("npx", ["wrangler", ...args], {
    stdio: "inherit",
    cwd: ROOT,
    // npm/npx are .cmd shims on Windows, which require a shell to spawn.
    shell: process.platform === "win32",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} exited with ${res.status}`);
}

async function main() {
  const entries = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json")).sort();
  if (!entries.length) {
    console.error(`No dataset files in ${OUT_DIR}. Run \`npm run data:all\` first.`);
    process.exit(1);
  }

  let bytes = 0;
  console.log(`Uploading ${entries.length} objects to r2://${BUCKET}/${PREFIX}/`);
  for (const file of entries) {
    const path = join(OUT_DIR, file);
    const size = (await stat(path)).size;
    bytes += size;
    const key = `${BUCKET}/${PREFIX}/${file}`;
    console.log(`  ${file.padEnd(16)} ${(size / 1024).toFixed(0).padStart(6)} KB`);
    if (DRY) continue;
    wrangler([
      "r2",
      "object",
      "put",
      key,
      `--file=${path}`,
      "--content-type=application/json; charset=utf-8",
      `--cache-control=${cacheControlFor(file)}`,
      "--remote",
    ]);
  }

  console.log(`\nDone. ${(bytes / 1024 / 1024).toFixed(2)} MB uploaded to ${PREFIX}/.`);
  if (DRY) console.log("(dry run — nothing was written)");
}

main().catch((err) => {
  console.error(`\nseed failed: ${err.message}`);
  process.exit(1);
});
