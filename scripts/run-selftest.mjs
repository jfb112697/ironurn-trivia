#!/usr/bin/env node
/**
 * Bundles `scripts/engine-selftest.ts` with esbuild and runs it, so the
 * TypeScript engine can be verified against the Python reference output.
 *
 *   npm run verify
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const outdir = join(root, "node_modules", ".cache", "selftest");
mkdirSync(outdir, { recursive: true });
const outfile = join(outdir, "engine-selftest.mjs");

await build({
  entryPoints: [join(root, "scripts", "engine-selftest.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  outfile,
});

await import(pathToFileURL(outfile).href);
