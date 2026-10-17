# Roadmap

## Status

| # | Game | Status | Data needed | Runtime compute | New infrastructure |
| --- | --- | --- | --- | --- | --- |
| **1** | **Pinpoint** (Daily, Mini, Free Play, Live Season) | ✅ **Shipped** | 1871 → current, historical | none (client-side) | — |
| 2 | **Starting 9** (Lineup Card) | 📋 Scoped | historical only | none (client-side) | none |
| 3 | **Daily Dinger** | 📋 Scoped | historical **+ live daily slate** | none (client-side) | one extra daily job + ~1 KB/day |

The order matters: **Starting 9 before Daily Dinger**, because Starting 9 adds a game without adding
a single new moving part, while Daily Dinger is the first thing in this project that needs *live,
post-game* data.

---

## 1. Pinpoint ✅

Daily (100 deep), Mini (10 deep), Free Play (any stat / era / pool / depth, optional timer and
same-screen two-player) and Live Season boards. Personal bests in `localStorage`.

**Cost: $0.** No database, no per-play compute — puzzles are a pure function of the date, and the
dataset is immutable, CDN-cached JSON. See the cost table in [README.md](./README.md).

---

## 2. Starting 9 (Lineup Card)

Build a nine-man lineup under constraints — one player per franchise, a salary or WAR cap, an era
restriction — then score it against the real stat.

**Why it's cheap:** it is a *pure query over the dataset we already ship*. Every constraint
(one per franchise, under a WAR budget, from a decade) is expressible with `teams.json` +
`franchises` + `war.json`, exactly the way Free Play pools already work. The board, scoring and
share-string code is reusable.

**Work required**

- A lineup validation + scoring module (~ a few hundred lines of TypeScript).
- A constraint generator, so a Daily lineup has a deterministic seed from its date — same pattern as
  `schedule.py`, so the archive works for free.
- UI: nine slots, a player picker (reuse `GuessInput`'s search), a constraint panel.
- Dataset: **zero** new bytes. Optionally precompute ~50 curated constraint sets at build time.

**Cost: $0, no new infrastructure.** Same static bundle, same R2 objects, same cache headers.
The only real cost is engineering time.

**Risks:** constraint sets can be unsatisfiable (no valid lineup exists). Mitigation: validate every
generated constraint set at build time against the dataset — the pipeline already has every number
needed, and it can fail the build instead of shipping an impossible puzzle.

---

## 3. Daily Dinger

A daily prediction game over the real slate — the first feature that depends on **live** data rather
than history.

**Why it's different:** the outcome only exists *after* the games finish. That means a write, on a
schedule, after the last pitch — a genuinely new shape of work for this project.

**Work required**

- Ingest the day's slate + lineups + home-run results. The **MLB Stats API** (`statsapi.mlb.com`) is
  free, official and needs no key: schedule, lineups and game feeds.
- Record the day's outcomes into R2 as a tiny object (`results/YYYY-MM-DD.json`, well under 1 KB).
- Two extra scheduled runs per day (one pre-game to publish the slate, one post-game to record
  results) — or one run at ~06:00 UTC that resolves yesterday and publishes today.
- A client fetches `results/<today>.json` (a few hundred bytes) and scores locally.

**Cost: still $0.** Concretely:

| Item | Usage | Free allowance |
| --- | --- | --- |
| Extra GitHub Actions runs | ~2 × few min/day | free for public repos |
| R2 writes | ~1 object/day | 1 M Class A ops/month |
| R2 storage | ~365 KB/year | 10 GB |
| Worker requests | +1 small GET per player per day | shares the existing 100k/day |
| Client bytes | ~0.5 KB/day | negligible |

**Risks**

1. **Schedule fragility.** If the post-game job doesn't run, results are missing. Mitigation: make
   the job idempotent and self-healing — recompute the last *N* days on every run rather than only
   yesterday, so a missed run is repaired automatically.
2. **Roster/lineup accuracy.** Late scratches and doubleheaders make "who was in the lineup" fuzzy.
   Mitigation: score on *outcomes* (who actually hit a home run), not on predicted lineups, which
   removes the need for pre-game lineup accuracy entirely.
3. **Postponements.** A rained-out game must void those picks rather than count them as misses.
4. **Scope creep.** It is tempting to make this interactive/live-scoring, which would drag in
   Durable Objects or D1 and break the free-tier budget. Keep it to a daily resolved snapshot.

---

## What keeps all three free

The budget survives because of three rules, and any future feature should be checked against them:

1. **Nothing is queried per player action.** Everything expensive happens at build time or is a pure
   function of the date. A player pressing a button must never cause a database round-trip.
2. **No KV, no D1, no Durable Objects for hot reads.** KV is metered per operation; at a billion
   reads/month it would cost roughly $3M. R2 plus the edge cache has no comparable cliff.
3. **Prefer static over dynamic.** If a feature can be precomputed and served as an immutable object,
   it costs nothing forever.

The one shared ceiling is the **100,000 Workers requests/day** free allowance — and the escape hatch
is always the same: publish the dataset to a public R2 bucket and let the client fetch it directly,
which reduces Worker usage to zero while staying free.
