#!/usr/bin/env node
/**
 * Bundles a TypeScript entry with esbuild and runs it, so scripts can import
 * the app's TS modules directly (used by `npm run verify`).
 *
 *   node scripts/run-ts.mjs scripts/engine-selftest.ts
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) {
  console.error("usage: node scripts/run-ts.mjs <entry.ts>");
  process.exit(2);
}

const root = resolve(import.meta.dirname, "..");
const outdir = join(root, "node_modules", ".cache", "ts-run");
mkdirSync(outdir, { recursive: true });
const outfile = join(outdir, `${basename(entry).replace(/\.ts$/, "")}.mjs`);

await build({
  entryPoints: [resolve(root, entry)],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  outfile,
});

await import(pathToFileURL(outfile).href);
