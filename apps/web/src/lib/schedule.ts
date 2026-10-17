/**
 * Deterministic daily puzzle — client port of `data/pipeline/schedule.py`.
 *
 * The puzzle is a pure function of the date, so it needs no network call and
 * no storage: every client computes the same board for a given day.
 */
import type { Templates, Puzzle } from "./types";

function seedFor(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

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

/** YYYY-MM-DD in the visitor's local timezone (what "today" means to them). */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: y === new Date().getFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** Puzzle number, counted from the project epoch (matches the original's "No." framing). */
export const PUZZLE_EPOCH = "2026-01-01";

export function puzzleNumber(dateKeyStr: string): number {
  const [y0, m0, d0] = PUZZLE_EPOCH.split("-").map(Number);
  const [y1, m1, d1] = dateKeyStr.split("-").map(Number);
  const a = Date.UTC(y0, m0 - 1, d0);
  const b = Date.UTC(y1, m1 - 1, d1);
  return Math.round((b - a) / 86400000) + 1;
}
