/**
 * Engine self-test: verifies the browser-side Pinpoint engine against the
 * reference results produced by `python -m pipeline report`.
 *
 * Run with `npm run verify` (bundled through esbuild, since it imports TS).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeLeaderboard, matchGuess, normalize } from "../apps/web/src/lib/engine";
import { formatVal } from "../apps/web/src/lib/format";
import { puzzleFor as clientPuzzleFor, puzzleNumber } from "../apps/web/src/lib/schedule";
import { puzzleFor as workerPuzzleFor } from "../workers/api/src/schedule";
import type { Dataset, Puzzle, Templates } from "../apps/web/src/lib/types";

const OUT = join(process.cwd(), "data", "out");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(OUT, f), "utf8")) as T;

const meta = read<Dataset["meta"]>("meta.json");
const ds: Dataset = {
  meta,
  teams: read<Dataset["teams"]>("teams.json"),
  players: read<Dataset["players"]>("players.json"),
  batting: read<Dataset["batting"]>("batting.json"),
  pitching: read<Dataset["pitching"]>("pitching.json"),
  war: read<Dataset["war"]>("war.json"),
};

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

function top(stat: string, y0: number, y1: number, size = 5): string[] {
  const lb = computeLeaderboard(ds, { stat, yearMin: y0, yearMax: y1, pool: { tab: "all" }, size });
  return lb.entries.map((e) => `${e.name} ${formatVal(stat, e.val, meta)}`);
}

console.log(`\nDataset ${meta.generated} · ${meta.playerCount} players · ${meta.firstYear}-${meta.lastYear}\n`);

console.log("Reference leaderboards (must match python -m pipeline report):");
check("HR 1990-2026", top("hr", 1990, 2026), [
  "Albert Pujols 703",
  "Alex Rodriguez 696",
  "Barry Bonds 678",
  "Ken Griffey 614",
  "Jim Thome 612",
]);
check("Hits 1871-2026", top("hits", 1871, 2026), [
  "Pete Rose 4256",
  "Ty Cobb 4189",
  "Hank Aaron 3771",
  "Stan Musial 3630",
  "Tris Speaker 3514",
]);
check("SB 1970-2026", top("sb", 1970, 2026), [
  "Rickey Henderson 1406",
  "Tim Raines 806",
  "Vince Coleman 752",
  "Willie Wilson 668",
  "Kenny Lofton 622",
]);
check("AVG 1990-2026", top("avg", 1990, 2026), [
  "Tony Gwynn .343",
  "Vladimir Guerrero .318",
  "Todd Helton .317",
  "Luis Arr\u00e1ez .314",
  "Larry Walker .314",
]);
check("OPS 1990-2026", top("ops", 1990, 2026), [
  "Barry Bonds 1.120",
  "Mark McGwire 1.026",
  "Aaron Judge 1.016",
  "Manny Ramirez .997",
  "Yordan \u00c1lvarez .977",
]);
check("K 1990-2026", top("k", 1990, 2026), [
  "Randy Johnson 4720",
  "Justin Verlander 3599",
  "Max Scherzer 3579",
  "Roger Clemens 3457",
  "Pedro Mart\u00ednez 3154",
]);

console.log("\nScoring:");
const daily = computeLeaderboard(ds, { stat: "hr", yearMin: 1990, yearMax: 2026, pool: { tab: "all" }, size: 100 });
check("Daily board is 100 deep", daily.entries.length, 100);
check("Rank 1 pays 100", daily.entries[0].points, 100);
check("Rank 100 pays 1", daily.entries[99].points, 1);
check("Slot points sum exactly to totalPoints", daily.entries.reduce((s, e) => s + e.points, 0), daily.totalPoints);
check("Board pays at least the 5050 base", daily.totalPoints >= 5050, true);
check("Qualify at one third", daily.targetScore, Math.ceil(daily.totalPoints / 3));
console.log(
  `      (this board pays ${daily.totalPoints}: ties share rank and points, so a tied board pays a few more than 5050)`,
);

console.log("\nPools:");
const al = computeLeaderboard(ds, { stat: "hr", yearMin: 1990, yearMax: 2026, pool: { tab: "league", league: "AL" }, size: 5 });
check("AL-only HR leader", al.entries[0].name, "Alex Rodriguez");
console.log(`      (AL top 5: ${al.entries.map((e) => e.name).join(", ")})`);
const yankees = computeLeaderboard(ds, {
  stat: "hr",
  yearMin: 1990,
  yearMax: 2026,
  pool: { tab: "team", teams: [ds.teams.franchises.findIndex((f) => f.abbr === "NYY")] },
  size: 5,
});
check("Yankees-only HR leader", yankees.entries[0].name, "Aaron Judge");
console.log(`      (NYY top 5: ${yankees.entries.map((e) => e.name).join(", ")})`);

console.log("\nGuess matching:");
const board = daily.entries;
const full = daily.full;
const guessed = new Set<number>();

const exact = matchGuess(board, full, guessed, "barry bonds");
check("full name matches", exact.kind, "correct");
check("resolved to rank 3", exact.kind === "correct" ? exact.entry.rank : null, 3);

const surname = matchGuess(board, full, guessed, "pujols");
check("unique surname matches", surname.kind, "correct");

const offBoard = full.slice(100).find((e) => !new Set(board.map((b) => b.last)).has(e.last))!;
const off = matchGuess(board, full, guessed, offBoard.name);
check("off-board player reports their real rank", off.kind === "wrong" ? off.rank : null, offBoard.rank);
console.log(`      (${offBoard.name} ranks #${offBoard.rank} \u2014 outside the top 100, so it costs a strike)`);

const preWar = matchGuess(board, full, guessed, "babe ruth");
check("player with no seasons in the window has no rank", preWar.kind === "wrong" && preWar.rank === null, true);

const nonsense = matchGuess(board, full, guessed, "zzzzqqq");
check("nonsense is 'wrong' with no rank", nonsense.kind === "wrong" && nonsense.rank === null, true);

const dup = matchGuess(board, full, new Set([board[2].pid]), "barry bonds");
check("already-found name is a duplicate (no strike)", dup.kind, "duplicate");

const alias = matchGuess(board, full, guessed, "a-rod");
check("nickname alias resolves", alias.kind, "correct");

check("normalize strips accents", normalize("Jos\u00e9 Ram\u00edrez"), "jose ramirez");

console.log("\nSuffix handling:");
const griffey = matchGuess(board, full, guessed, "griffey");
check("'griffey' resolves despite the Jr. suffix", griffey.kind, "correct");

console.log("\nRecent seasons:");
const y2026 = computeLeaderboard(ds, { stat: "hr", yearMin: 2026, yearMax: 2026, pool: { tab: "all" }, size: 3 });
console.log(`      2026 HR top 3: ${y2026.entries.map((e) => `${e.name} ${e.val}`).join(", ")}`);
check("2026 season is present", y2026.poolSize > 50, true);
const war2026 = computeLeaderboard(ds, { stat: "war", yearMin: 2026, yearMax: 2026, pool: { tab: "all" }, size: 3 });
console.log(`      2026 WAR top 3: ${war2026.entries.map((e) => `${e.name} ${e.val.toFixed(1)}`).join(", ")}`);

console.log("\nDeterministic schedule (both TS generators vs python -m pipeline schedule):");
const tpl = read<Templates>("templates.json");
const sched = read<{
  start: string;
  days: number;
  daily: Record<string, Puzzle>;
  mini: Record<string, Puzzle>;
}>("schedule.json");

check("schedule window is non-empty", Object.keys(sched.daily).length > 0, true);
check("daily and mini cover the same dates", Object.keys(sched.daily).length, Object.keys(sched.mini).length);
check("schedule start is an ISO date", /^\d{4}-\d{2}-\d{2}$/.test(sched.start), true);
check("puzzle #1 is the epoch day", puzzleNumber("2026-01-01"), 1);

const samePuzzle = (a: Puzzle, b: Puzzle): boolean =>
  a.size === b.size &&
  a.title === b.title &&
  a.criteria.stat === b.criteria.stat &&
  a.criteria.yearMin === b.criteria.yearMin &&
  a.criteria.yearMax === b.criteria.yearMax &&
  JSON.stringify(a.criteria.pool) === JSON.stringify(b.criteria.pool);

for (const [label, gen] of [
  ["client", clientPuzzleFor],
  ["worker", workerPuzzleFor],
] as const) {
  let bad = 0;
  let total = 0;
  for (const mode of ["daily", "mini"] as const) {
    for (const [date, expected] of Object.entries(sched[mode])) {
      total++;
      const got = gen(tpl, date, mode);
      if (!samePuzzle(got, expected)) {
        bad++;
        if (bad <= 2) {
          console.log(
            `      ${label} mismatch on ${mode} ${date}: ${JSON.stringify(got.criteria)} vs ${JSON.stringify(expected.criteria)}`,
          );
        }
      }
    }
  }
  check(`${label}: all ${total} scheduled puzzles match Python exactly`, bad, 0);
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
