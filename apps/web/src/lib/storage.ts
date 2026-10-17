/**
 * Personal stats. There are no accounts and no server-side leaderboards: every
 * record lives in the player's own browser (localStorage), which keeps the
 * whole thing free and unlimited.
 */
export interface BestRecord {
  /** Stable id for the game shape, e.g. "free:hr:1990-2026:all:100". */
  key: string;
  label: string;
  score: number;
  totalPoints: number;
  correct: number;
  size: number;
  won: boolean;
  at: string;
}

export interface DailyResult {
  date: string;
  mode: "daily" | "mini" | "live";
  score: number;
  totalPoints: number;
  correct: number;
  size: number;
  won: boolean;
  finished: boolean;
}

const BEST_KEY = "ironurn.bests.v1";
const DAILY_KEY = "ironurn.daily.v1";
const PREFS_KEY = "ironurn.prefs.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled / full — keep playing, just no persistence */
  }
}

export function listBests(): BestRecord[] {
  return read<BestRecord[]>(BEST_KEY, []).sort((a, b) => b.score / (b.totalPoints || 1) - a.score / (a.totalPoints || 1));
}

export function bestFor(key: string): BestRecord | undefined {
  return read<BestRecord[]>(BEST_KEY, []).find((b) => b.key === key);
}

/** Record a finished game, keeping only the player's best per game shape. */
export function recordBest(rec: BestRecord): { isBest: boolean; previous?: BestRecord } {
  const all = read<BestRecord[]>(BEST_KEY, []);
  const i = all.findIndex((b) => b.key === rec.key);
  if (i === -1) {
    all.push(rec);
    write(BEST_KEY, all);
    return { isBest: true };
  }
  const prev = all[i];
  const better = rec.score > prev.score || (rec.score === prev.score && rec.correct > prev.correct);
  if (better) {
    all[i] = rec;
    write(BEST_KEY, all);
    return { isBest: true, previous: prev };
  }
  return { isBest: false, previous: prev };
}

export function dailyResult(date: string, mode: DailyResult["mode"]): DailyResult | undefined {
  return read<Record<string, DailyResult>>(DAILY_KEY, {})[`${mode}:${date}`];
}

export function saveDailyResult(res: DailyResult): void {
  const all = read<Record<string, DailyResult>>(DAILY_KEY, {});
  all[`${res.mode}:${res.date}`] = res;
  write(DAILY_KEY, all);
}

export function recentDaily(mode: DailyResult["mode"], limit = 60): DailyResult[] {
  return Object.values(read<Record<string, DailyResult>>(DAILY_KEY, {}))
    .filter((r) => r.mode === mode)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

/** Aggregated career numbers for the stats page. */
export function careerTotals(): { played: number; won: number; points: number } {
  const bests = read<BestRecord[]>(BEST_KEY, []);
  const dailies = Object.values(read<Record<string, DailyResult>>(DAILY_KEY, {}));
  return {
    played: dailies.length || bests.length,
    won: dailies.filter((d) => d.won).length,
    points: bests.reduce((sum, b) => sum + b.score, 0) + dailies.reduce((sum, d) => sum + d.score, 0),
  };
}

export interface Prefs {
  sound: boolean;
  showRemaining: boolean;
}

export function getPrefs(): Prefs {
  return read<Prefs>(PREFS_KEY, { sound: false, showRemaining: true });
}

export function setPrefs(p: Prefs): void {
  write(PREFS_KEY, p);
}

export function clearAll(): void {
  for (const k of [BEST_KEY, DAILY_KEY]) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
