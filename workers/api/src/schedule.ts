/**
 * Deterministic daily puzzle resolver.
 *
 * This is a byte-for-byte port of `data/pipeline/schedule.py`:
 *   seed  = FNV-1a(`${date}|${salt}`)
 *   pick  = mulberry32(seed) * templateCount  (mod count)
 *
 * Because the puzzle is a pure function of the date there is no database, no
 * cron and no storage — an arbitrary date (including future ones) resolves
 * instantly and identically on every edge node.
 */

export interface PuzzleTemplate {
  stat: string;
  yearMin: number;
  yearMax: number;
  pool: { tab: "all" | "league" | "team"; league?: string; teams?: number[] };
  title: string;
}

export interface Puzzle {
  date: string;
  mode: "daily" | "mini";
  size: number;
  title: string;
  criteria: { stat: string; yearMin: number; yearMax: number; pool: PuzzleTemplate["pool"] };
}

export interface Templates {
  v: number;
  dailySize: number;
  miniSize: number;
  templates: PuzzleTemplate[];
}

/** FNV-1a over the code units of `s`, identical to the Python implementation. */
function seedFor(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Canonical mulberry32 — matches the Python `_mulberry32` bit-for-bit. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function puzzleFor(tpl: Templates, dateKey: string, mode: "daily" | "mini"): Puzzle {
  const salt = mode === "daily" ? "ppd-v1" : "ppm-v1";
  const rnd = mulberry32(seedFor(`${dateKey}|${salt}`));
  const list = tpl.templates;
  const t = list[Math.floor(rnd() * list.length) % list.length];
  return {
    date: dateKey,
    mode,
    size: mode === "daily" ? tpl.dailySize : tpl.miniSize,
    title: t.title,
    criteria: {
      stat: t.stat,
      yearMin: t.yearMin,
      yearMax: t.yearMax,
      pool: t.pool,
    },
  };
}
