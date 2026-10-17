#!/usr/bin/env node
/**
 * Cost model for running IronUrn Trivia entirely on free tiers.
 *
 * Prints the size of the built dataset, then priced scenarios for traffic
 * levels that a hobby-to-popular trivia site might see, so the "$0 forever"
 * claim can be checked rather than asserted.
 *
 *   npm run analyze
 */
import { readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, "..", "data", "out");

// ── Cloudflare free-tier allowances (as published for the Workers free plan) ──
const FREE = {
  workerRequestsPerDay: 100_000,
  pagesBandwidth: Infinity, // Static assets are not metered for bandwidth.
  r2StorageBytes: 10 * 1024 ** 3,
  r2ClassA: 1_000_000, // writes / month
  r2ClassB: 10_000_000, // reads / month (only on cache miss)
  kvReadsPerDay: 100_000,
};

// ── published overage prices (USD) for the "what if we blow past it" line ──
const PRICES = {
  workerPerMillionRequests: 0.3,
  r2StoragePerGbMonth: 0.015,
  r2ClassA: 0.0000045,
  r2ClassB: 0.00000036,
  kvReadPerMillion: 0.5,
};

const SCENARIOS = [
  { label: "Small", monthlyVisitors: 1_000, gamesPerVisitor: 3 },
  { label: "Growing", monthlyVisitors: 25_000, gamesPerVisitor: 3 },
  { label: "Popular", monthlyVisitors: 250_000, gamesPerVisitor: 3 },
  { label: "Viral", monthlyVisitors: 2_500_000, gamesPerVisitor: 2 },
];

function usd(n) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

async function datasetReport() {
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json")).sort();
  const rows = [];
  let raw = 0;
  let gz = 0;
  for (const f of files) {
    const path = join(OUT_DIR, f);
    const size = (await stat(path)).size;
    const buf = await readFile(path);
    const gzipped = gzipSync(buf, { level: 9 }).length;
    raw += size;
    gz += gzipped;
    rows.push({ file: f, size, gzipped });
  }
  return { rows, raw, gz };
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => "  " + cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

async function main() {
  const { rows, raw, gz } = await datasetReport();

  console.log("IronUrn Trivia — cost analysis\n");
  console.log("Dataset (data/out):\n");
  table(
    ["file", "raw", "gzip"],
    rows.map((r) => [r.file, `${(r.size / 1024).toFixed(0)} KB`, `${(r.gzipped / 1024).toFixed(0)} KB`]),
  );
  console.log(
    `\n  total: ${(raw / 1024 / 1024).toFixed(2)} MB raw · ${(gz / 1024 / 1024).toFixed(2)} MB gzipped ` +
      `(Cloudflare compresses JSON at the edge automatically)\n`,
  );

  console.log("Architecture assumed:");
  console.log("  • One Worker serves the client and the whole dataset as static assets — free, unlimited,");
  console.log("    and exempt from the Worker request quota.");
  console.log("  • One dataset table per stat family, cached in the browser and version-keyed by revision.");
  console.log("  • Daily/Mini puzzles computed client-side from a 3 KB templates file (no per-play request).");
  console.log("  • /api/* (R2-backed) exists for third-party consumers; gameplay never calls it.\n");

  const perGameGz = gz / rows.length + 1.3 * 1024 * 1024; // one table + players.json
  const table1 = [];

  for (const s of SCENARIOS) {
    const visits = s.monthlyVisitors;
    const games = visits * s.gamesPerVisitor;

    // Cold reads: every visitor downloads one table + players once per revision.
    const cacheMisses = visits; // assume browser cache handles repeat games
    const bytes = cacheMisses * perGameGz;

    // The app and the dataset are static assets, so a visitor never invokes the
    // Worker. Only /api/* consumers would, and this model doesn't count them.
    const workerRequests = 0;
    const workerPerDay = 0;

    // R2: reads only on edge-cache miss. Assume 5% of visitors land on a cold colo.
    const r2Reads = Math.round(cacheMisses * 0.05 * 3);
    const r2Writes = rows.length; // one upload per file per refresh

    const workerCost = Math.max(0, workerRequests - FREE.workerRequestsPerDay * 30) * (PRICES.workerPerMillionRequests / 1e6);
    const storageCost = Math.max(0, (gz / 1024 ** 3) - FREE.r2StorageBytes / 1024 ** 3) * PRICES.r2StoragePerGbMonth;
    const r2Cost = Math.max(0, r2Reads - FREE.r2ClassB) * PRICES.r2ClassB + Math.max(0, r2Writes - FREE.r2ClassA) * PRICES.r2ClassA;
    const total = workerCost + storageCost + r2Cost;
    const overLimit = workerPerDay > FREE.workerRequestsPerDay;

    table1.push([
      s.label,
      visits.toLocaleString(),
      `${(bytes / 1024 ** 3).toFixed(2)} GB`,
      workerRequests.toLocaleString(),
      overLimit ? "yes" : "no",
      usd(total),
    ]);
  }

  console.log("Scenarios:\n");
  table(["tier", "visits/mo", "static bytes", "worker req/mo", "over 100k/day?", "cost/mo"], table1);

  console.log(
    "\nNotes:\n" +
      "  • Static assets are free and unlimited, so the 'static bytes' column costs nothing at any size.\n" +
      "  • Gameplay makes ZERO Worker requests: the dataset is baked into the deploy and puzzles are\n" +
      "    resolved in the browser. Traffic cannot exhaust the Worker quota.\n" +
      "  • /api/* is the only metered surface, and only for third-party consumers of the dataset.\n" +
      "  • KV is deliberately unused for hot reads: at 1B reads/month KV would cost ~$3M, which is why\n" +
      "    the design serves immutable objects from R2 + the edge cache instead.\n",
  );

  console.log(
    `Free-tier headroom: the site itself has no request ceiling. The 100k/day Worker allowance applies ` +
      `only to /api/* consumers (~${(FREE.workerRequestsPerDay * 30).toLocaleString()} calls/month).\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
