/**
 * Pinpoint engine.
 *
 * Given the compact dataset plus a criteria triple (stat, year range, pool),
 * produce the ranked leaderboard, the score value of each rank, and the
 * guess-matching rules. This is a faithful port of the original site's
 * behaviour and of `data/pipeline/report.py` (which cross-checks the results).
 */
import type { Criteria, Dataset, Entry, Leaderboard, Meta, Pool, StatDef } from "./types";

export const DAILY_SIZE = 100;
export const MAX_STRIKES = 3;

const SUFFIX = /\s+(jr|sr|ii|iii|iv)$/;

/** Accent- and punctuation-insensitive search key. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSuffix(norm: string): string {
  return norm.replace(SUFFIX, "").trim();
}

function lastWord(norm: string): string {
  const parts = norm.split(" ");
  return parts[parts.length - 1] ?? "";
}

/** Well-known nicknames the original engine also accepted. */
const ALIASES: Record<string, string> = {
  "a rod": "alex rodriguez",
  arod: "alex rodriguez",
  "the kid": "ken griffey jr",
  "big papi": "david ortiz",
  miggy: "miguel cabrera",
  "king felix": "felix hernandez",
  "k rod": "francisco rodriguez",
  "the captain": "derek jeter",
  "mr october": "reggie jackson",
  "say hey kid": "willie mays",
  "the hammer": "hank aaron",
  "charlie hustle": "pete rose",
  "the ryan express": "nolan ryan",
  "the big unit": "randy johnson",
  "the rocket": "roger clemens",
  "tom terrific": "tom seaver",
  papi: "david ortiz",
  junior: "ken griffey jr",
};

/** Games per team-season, used by the rate-stat qualifier thresholds. */
const SHORT_SEASONS: Record<number, number> = {
  1871: 31, 1872: 56, 1873: 55, 1874: 60, 1875: 60, 1876: 66, 1877: 60, 1878: 60,
  1879: 70, 1880: 80, 1881: 80, 1882: 80, 1883: 98, 1884: 98, 1885: 100, 1886: 100,
  1887: 120, 1888: 130, 1889: 130, 1890: 130, 1891: 130, 1892: 150, 1893: 130,
  1894: 130, 1895: 130, 1896: 130, 1897: 130, 1898: 150, 1899: 150, 1900: 140,
  1901: 135, 1902: 135, 1903: 140, 1904: 150, 1905: 150, 1906: 150, 1907: 150,
  1908: 150, 1909: 150, 1910: 150, 1911: 150, 1912: 150, 1913: 150, 1914: 150,
  1915: 150, 1916: 150, 1917: 150, 1918: 124, 1919: 140, 1972: 156, 1981: 107,
  1994: 115, 1995: 144, 2020: 60,
};

export function seasonGames(year: number): number {
  return SHORT_SEASONS[year] ?? 162;
}

export function qualifiers(y0: number, y1: number): { minPA: number; minOuts: number } {
  const years = Math.max(1, y1 - y0 + 1);
  if (years >= 7) return { minPA: 3000, minOuts: 3000 };
  if (years === 1) {
    const g = seasonGames(y0);
    return g < 162 ? { minPA: Math.round(3.1 * g), minOuts: g * 3 } : { minPA: 502, minOuts: 486 };
  }
  let minPA = 0;
  let minOuts = 0;
  for (let y = y0; y <= y1; y++) {
    const g = seasonGames(y);
    minPA += g < 162 ? Math.round(3.1 * g) : 450;
    minOuts += g < 162 ? g * 3 : 450;
  }
  return { minPA, minOuts };
}

interface Agg {
  y0: number;
  y1: number;
  teams: Set<number>;
  pa: number; h: number; hr: number; rbi: number; r: number; sb: number;
  avgW: number; obpW: number; slgW: number; opsW: number;
  outs: number; w: number; k: number; bb: number; er: number; ph: number;
  g: number; gs: number; sv: number;
  wh: number; wp: number;
}

function blankAgg(): Agg {
  return {
    y0: 0, y1: 0, teams: new Set<number>(),
    pa: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0,
    avgW: 0, obpW: 0, slgW: 0, opsW: 0,
    outs: 0, w: 0, k: 0, bb: 0, er: 0, ph: 0, g: 0, gs: 0, sv: 0,
    wh: 0, wp: 0,
  };
}

const leagueKeyCache = new WeakMap<Dataset, Map<number, string>>();

function leagueIndex(ds: Dataset): Map<number, string> {
  let m = leagueKeyCache.get(ds);
  if (m) return m;
  m = new Map<number, string>();
  for (const [t, y, lg] of ds.teams.leagues) m.set(t * 10000 + y, lg);
  leagueKeyCache.set(ds, m);
  return m;
}

/** Compile a pool filter into a fast (teamIndex, year) predicate. */
function poolFilter(ds: Dataset, pool: Pool): (tid: number, year: number) => boolean {
  const tab = pool?.tab ?? "all";
  if (tab === "all") return () => true;

  if (tab === "league") {
    const want = new Set((pool.league ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (!want.size) return () => true;
    const idx = leagueIndex(ds);
    return (tid, year) => want.has(idx.get(tid * 10000 + year) ?? "");
  }

  const want = new Set(pool.teams ?? []);
  if (!want.size) return () => true;
  const of = ds.teams.franchiseOf;
  return (tid) => want.has(of[tid] ?? -1);
}

function displayTeams(ds: Dataset, tids: Set<number>): string {
  const abbrs = new Set<string>();
  for (const t of tids) {
    const f = ds.teams.franchiseOf[t];
    const fr = f >= 0 ? ds.teams.franchises[f] : undefined;
    abbrs.add(fr ? fr.abbr : ds.teams.abbr[t] ?? "");
  }
  const list = [...abbrs].filter(Boolean).sort();
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")} +${list.length - 3}`;
}

function statOf(meta: Meta, stat: string): StatDef {
  return (
    meta.stats[stat] ?? { label: stat, short: stat.toUpperCase(), kind: "count", group: "hitting" }
  );
}

export interface ComputeInput {
  stat: string;
  yearMin: number;
  yearMax: number;
  pool: Pool;
  size: number;
}

/**
 * Rank every qualifying player for the criteria and cut the top `size`.
 * Returns both the scored board and the full ranking (used to tell a player
 * where a wrong guess actually placed).
 */
export function computeLeaderboard(ds: Dataset, input: ComputeInput): Leaderboard {
  const { stat, yearMin, yearMax, pool, size } = input;
  const def = statOf(ds.meta, stat);
  const filter = poolFilter(ds, pool);
  const agg = new Map<number, Agg>();

  const bump = (pid: number, tid: number, year: number): Agg => {
    let a = agg.get(pid);
    if (!a) {
      a = blankAgg();
      a.y0 = year;
      a.y1 = year;
      agg.set(pid, a);
    } else {
      if (year < a.y0) a.y0 = year;
      if (year > a.y1) a.y1 = year;
    }
    a.teams.add(tid);
    return a;
  };

  if (def.kind === "war") {
    for (const r of ds.war ?? []) {
      const [pid, tid, year, wh, wp] = r;
      if (year < yearMin || year > yearMax || !filter(tid, year)) continue;
      const a = bump(pid, tid, year);
      a.wh += wh;
      a.wp += wp;
    }
  } else if (def.group === "pitching") {
    for (const r of ds.pitching ?? []) {
      const [pid, tid, year, outs, w, k, bb, er, h, g, gs, sv] = r;
      if (year < yearMin || year > yearMax || !filter(tid, year)) continue;
      const a = bump(pid, tid, year);
      a.outs += outs; a.w += w; a.k += k; a.bb += bb; a.er += er;
      a.ph += h; a.g += g; a.gs += gs; a.sv += sv;
    }
  } else {
    for (const r of ds.batting ?? []) {
      const [pid, tid, year, pa, h, hr, rbi, runs, sb, avg, obp, slg, ops] = r;
      if (year < yearMin || year > yearMax || !filter(tid, year)) continue;
      const a = bump(pid, tid, year);
      a.pa += pa; a.h += h; a.hr += hr; a.rbi += rbi; a.r += runs; a.sb += sb;
      a.avgW += pa * avg; a.obpW += pa * obp; a.slgW += pa * slg; a.opsW += pa * ops;
    }
  }

  const q = qualifiers(yearMin, yearMax);
  const isRate = def.kind === "rate";
  const lowIsGood = !!def.lowIsGood;

  const rows: Entry[] = [];
  for (const [pid, a] of agg) {
    if (isRate) {
      if (def.group === "pitching") {
        if (a.outs < q.minOuts) continue;
      } else if (a.pa < q.minPA) continue;
    }

    let val = 0;
    switch (stat) {
      case "hits": val = a.h; break;
      case "hr": val = a.hr; break;
      case "rbi": val = a.rbi; break;
      case "runs": val = a.r; break;
      case "sb": val = a.sb; break;
      case "avg": val = a.pa ? Math.round(a.avgW / a.pa) : 0; break;
      case "obp": val = a.pa ? Math.round(a.obpW / a.pa) : 0; break;
      case "slg": val = a.pa ? Math.round(a.slgW / a.pa) : 0; break;
      case "ops": val = a.pa ? Math.round(a.opsW / a.pa) : 0; break;
      case "wins": val = a.w; break;
      case "k": val = a.k; break;
      case "bb": val = a.bb; break;
      case "ip": val = a.outs; break;
      case "sv": val = a.sv; break;
      case "g": val = a.g; break;
      case "era": val = a.outs ? Math.round((a.er * 27 * 1000) / a.outs) : 0; break;
      case "whip": val = a.outs ? Math.round(((a.bb + a.ph) * 3 * 1000) / a.outs) : 0; break;
      case "war": val = (a.wh + a.wp) / 100; break;
      case "warh": val = a.wh / 100; break;
      case "warp": val = a.wp / 100; break;
      default: continue;
    }

    const name = ds.players.names[pid] ?? ds.players.ids[pid] ?? String(pid);
    const search = ds.players.search[pid] ?? normalize(name);
    rows.push({
      pid,
      rank: 0,
      val,
      points: 0,
      name,
      search,
      searchStripped: stripSuffix(search),
      last: lastWord(stripSuffix(search)),
      years: a.y0 === a.y1 ? String(a.y0) : `${a.y0}\u2013${a.y1}`,
      teams: displayTeams(ds, a.teams),
    });
  }

  rows.sort((x, y) => (lowIsGood ? x.val - y.val : y.val - x.val) || (x.pid - y.pid));

  let prevVal: number | null = null;
  let prevRank = 0;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (prevVal !== null && e.val === prevVal) {
      e.rank = prevRank;
    } else {
      e.rank = i + 1;
      prevRank = e.rank;
      prevVal = e.val;
    }
    e.points = e.rank <= size ? size - e.rank + 1 : 0;
  }

  const entries = rows.slice(0, size);
  // Ties share a rank *and* its points, which means a board with ties can pay a
  // few points more than the theoretical n(n+1)/2 (5050 for a Daily). The total
  // is therefore the sum of the slots actually on the board, so "score / total",
  // the qualify threshold and the tier ladder all stay internally consistent.
  const totalPoints = entries.reduce((sum, e) => sum + e.points, 0);
  return {
    entries,
    full: rows,
    totalPoints,
    targetScore: Math.ceil(totalPoints / 3),
    poolSize: rows.length,
  };
}

export type MatchResult =
  | { kind: "correct"; entry: Entry }
  | { kind: "duplicate"; entry: Entry }
  | { kind: "ambiguous"; count: number }
  | { kind: "wrong"; rank: number | null; years?: string; teams?: string };

/** Resolve a typed guess against the board using the original's rules. */
export function matchGuess(
  board: Entry[],
  full: Entry[],
  guessed: Set<number>,
  raw: string,
): MatchResult | null {
  const norm = normalize(raw);
  if (!norm) return null;

  const byExact = board.find((e) => e.search === norm || e.searchStripped === norm);
  if (byExact) {
    return guessed.has(byExact.pid) ? { kind: "duplicate", entry: byExact } : { kind: "correct", entry: byExact };
  }

  const alias = ALIASES[norm] ?? ALIASES[stripSuffix(norm)];
  if (alias) {
    const target = normalize(alias);
    const hit = board.find((e) => e.search === target || e.searchStripped === target);
    if (hit) {
      return guessed.has(hit.pid) ? { kind: "duplicate", entry: hit } : { kind: "correct", entry: hit };
    }
  }

  const last = lastWord(stripSuffix(norm));
  if (last.length >= 3) {
    const hits = board.filter((e) => e.last === last);
    if (hits.length === 1) {
      const e = hits[0];
      return guessed.has(e.pid) ? { kind: "duplicate", entry: e } : { kind: "correct", entry: e };
    }
    if (hits.length > 1) return { kind: "ambiguous", count: hits.length };
  }

  const exactFull = full.find((e) => e.search === norm || e.searchStripped === norm);
  if (exactFull) return { kind: "wrong", rank: exactFull.rank, years: exactFull.years, teams: exactFull.teams };

  if (last.length >= 4) {
    const lh = full.filter((e) => e.last === last);
    if (lh.length === 1) {
      return { kind: "wrong", rank: lh[0].rank, years: lh[0].years, teams: lh[0].teams };
    }
  }

  return { kind: "wrong", rank: null };
}

/** Autocomplete across the whole player pool. */
export function searchPlayers(ds: Dataset, query: string, limit = 8): { pid: number; name: string }[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const out: { pid: number; name: string }[] = [];
  const search = ds.players.search;

  for (let i = 0; i < search.length && out.length < limit; i++) {
    if (search[i].startsWith(q)) out.push({ pid: i, name: ds.players.names[i] });
  }
  if (out.length >= limit) return out;

  for (let i = 0; i < search.length && out.length < limit; i++) {
    const s = search[i];
    const at = s.indexOf(q);
    if (at > 0 && !out.some((o) => o.pid === i)) out.push({ pid: i, name: ds.players.names[i] });
  }
  return out;
}

export type Tier = "perfect" | "legend" | "gold" | "silver" | "bronze" | "qualified" | "missed";

/** Score-to-tier mapping (same intent as the original's tier ladder). */
export function tierFor(score: number, total: number): Tier {
  if (total <= 0) return "missed";
  const pct = (score / total) * 100;
  if (pct >= 100) return "perfect";
  if (pct >= 90) return "legend";
  if (pct >= 75) return "gold";
  if (pct >= 60) return "silver";
  if (pct >= 50) return "bronze";
  if (pct >= 100 / 3) return "qualified";
  return "missed";
}

export const TIER_LABEL: Record<Tier, string> = {
  perfect: "Perfect",
  legend: "Legend",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  qualified: "Qualified",
  missed: "Missed",
};

export function describeCriteria(ds: Dataset, criteria: Criteria): string {
  const def = statOf(ds.meta, criteria.stat);
  return `${def.label} \u00b7 ${criteria.yearMin}\u2013${criteria.yearMax} \u00b7 ${describePool(ds, criteria.pool)}`;
}

export function describePool(ds: Dataset, pool: Pool): string {
  if (pool.tab === "league") return `${(pool.league ?? "").split(",").filter(Boolean).join("/")} only`;
  if (pool.tab === "team") {
    const names = (pool.teams ?? []).map((i) => ds.teams.franchises[i]?.abbr ?? "?").filter(Boolean);
    if (!names.length) return "All MLB";
    return names.length <= 3 ? names.join(", ") : `${names.length} teams`;
  }
  return "All MLB";
}
