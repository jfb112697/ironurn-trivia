# IronUrn Trivia

A free, unlimited, account-free baseball trivia platform — a faithful rebuild of **Pinpoint** from
jomboytrivia.com, designed to run **entirely on free tiers**.

You get a statistic, a span of seasons and a player pool. Name the players who rank highest; the
board is 100 deep for the Daily, each rank pays points, and you have three strikes.

---

## Why this exists

The original is gated: you must sign in, and free plays are limited. This build removes accounts and
limits completely and still costs nothing to host, by making every expensive thing either
**static** or a **pure function of the date**.

## Architecture

```
                 ┌──────────────────────────── Cloudflare (free) ────────────────────────────┐
                 │                                                                          │
  browser ──────►│  Cloudflare Pages          Worker (workers/api)         R2 bucket        │
                 │  static React bundle  ───► /api/manifest              ──►  v1/*.json        │
                 │  (~65 KB gzip)             /api/dataset/:file  ────►  (immutable,        │
                 │                            /api/templates             edge-cached)       │
                 │  Daily/Mini puzzle         /api/schedule/ppd|ppm                          │
                 │  computed LOCALLY          (deterministic, no DB)                         │
                 └──────────────────────────────────────────────────────────────────────────┘
```

The key decisions that keep it free:

| Decision | Why |
| --- | --- |
| Daily/Mini puzzles are a **pure function of the date** | No database, no cron, no per-play compute. Any date — past or future — resolves instantly, so the whole archive works for free. |
| Dataset is **precomputed JSON**, not queried | The pipeline does all the work; the runtime just ships bytes. |
| Datasets are **immutable per revision** | `Cache-Control: max-age=31536000, immutable`. Repeat visitors re-download nothing. |
| The manifest is the **only** short-lived resource | A data refresh becomes visible in about a minute; everything else is version-keyed by `?v=<generated>`. |
| **No KV, no D1, no Durable Objects** | KV reads are metered per operation — at a billion reads/month that is ~$3M. R2 + the edge cache have no such cliff. |
| Personal bests live in **localStorage** | No write traffic, no auth, no leaderboard infrastructure. |

### Cost

| Resource | Free allowance | This project's usage |
| --- | --- | --- |
| Cloudflare Pages bandwidth | **Unlimited, free** | the entire app bundle + assets |
| Workers requests | 100,000/day | ~2 requests per *new* visitor (manifest + one table) |
| R2 storage | 10 GB | ~10 MB per revision |
| R2 reads (Class B) | 10 M/month | only on an edge-cache miss |
| GitHub Actions | free for public repos | a few minutes per data refresh |

Run `npm run analyze` to print the current sizes and priced scenarios. Head room: the 100k/day Worker
allowance covers roughly **1.5 million dataset-fetching visitors per month**. If you ever outgrow it,
deploy the app as **pure static** against a public R2 bucket — 0 Worker requests.

**Cloudflare Pages vs GitHub Pages:** Pages wins because static-asset bandwidth is unmetered.
GitHub Pages has a ~100 GB/month soft cap, and each first-time visitor here pulls ~4 MB, so roughly
25k visitors/month would throttle you. Pages also keeps the app and the API on one origin via a
custom domain.

---

## Quick start

```bash
npm install

# Build the dataset (Python + pybaseball; see "Data pipeline" below)
python -m venv .venv
.venv/Scripts/pip install -r data/requirements.txt   # Windows
# .venv/bin/pip install -r data/requirements.txt     # macOS/Linux
npm run data:all

# Play it
npm run dev          # http://localhost:5173
```

`npm run dev` serves `data/out/*` at `/api/*` through a Vite middleware, so the whole game works
locally with **no Cloudflare account required**.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the local dataset middleware |
| `npm run dev:api` | `wrangler dev` for the edge Worker |
| `npm run typecheck` | TypeScript for both the client and the Worker |
| `npm run build` | Production client build |
| `npm run verify` | Runs the 25-check engine self-test against Python reference output |
| `npm run analyze` | Dataset sizes + free-tier cost model |
| `npm run data:all` | Fetch + build + schedule |
| `npm run data:refresh` | Re-fetch pybaseball sources and rebuild (current-season update) |
| `npm run seed` | Upload `data/out` to R2 via wrangler |

---

## Data pipeline

Python, built on **[pybaseball](https://github.com/jldbc/pybaseball)** — the same library the original
site used for its WAR data.

```
data/pipeline/
  cli.py            python -m pipeline fetch|build|refresh|schedule|report|all
  build.py          merges sources into the compact JSON contract
  schedule.py       deterministic Daily/Mini schedule (+ templates.json)
  report.py         sanity checks + reference leaderboards
  sources/
    bref.py         pybaseball: chadwick_register, bwar_bat/pitch, batting/pitching_stats_bref
    lahman.py       Lahman/Chadwick public-domain CSVs (offline history backbone)
```

### Sources

| Span | Counting stats | WAR |
| --- | --- | --- |
| 1871 → last Lahman release | Lahman/Chadwick CSVs | Baseball Reference `bwar_bat` / `bwar_pitch` |
| Lahman end → current season | `batting_stats_bref` / `pitching_stats_bref` | same |

Everything is cached under `data/raw/`, so a rebuild is offline and fast. `--refresh` re-fetches.

> **Why not FanGraphs?** `pybaseball.batting_stats` (FanGraphs) is 403-blocked from most networks.
> The Baseball Reference endpoints above are reliable and are what the WAR data comes from anyway.

### Output contract (`data/out/`)

Everything is integer-dictionary encoded and deterministic:

| File | Shape |
| --- | --- |
| `meta.json` | dataset metadata + the stat registry (labels, kind, group, lowIsGood) |
| `players.json` | `{ ids[], names[], search[], debut[], last[] }` — index = player id |
| `teams.json` | `{ ids[], abbr[], franchiseOf[], leagues[[tid,year,lg]], franchises[] }` |
| `batting.json` | `[pid, tid, year, PA, H, HR, RBI, R, SB, AVG, OBP, SLG, OPS]` — rate stats ×1000 |
| `pitching.json` | `[pid, tid, year, OUTS, W, K, BB, ER, H, G, GS, SV]` |
| `war.json` | `[pid, tid, year, WAR_hitting×100, WAR_pitching×100]` |
| `manifest.json` | dataset catalogue; its `generated` date is the revision key |
| `templates.json` | 28 puzzle templates — the single source of truth for the schedule |
| `schedule.json` | a precomputed 730-day window (for bulk/archive use) |
| `live.json` | a self-contained slice of the current season for live mini-games |

Player ids are **Lahman/BRef ids**; team ids are **BRef team codes** (Lahman `teamIDBR`). League
membership is per `(team, season)`, so pool filtering is evaluated season by season.

### Current-season data

`npm run data:refresh` re-fetches the pybaseball sources and rebuilds. The refreshed dataset always
includes the in-progress season, so **Live Season** boards and `yearMin = yearMax = <current year>`
Free Play boards pick it up automatically.

### Scoring, faithfully reproduced

- Rank *n* pays `size − n + 1` points; a 100-deep Daily therefore pays 5,050.
- **Ties share both rank and points.** Because of that a tied board pays a few more than 5,050, so
  the game reports the *actual* slot total and sets the qualify line at one third of it
  (≈1,684 on a typical Daily).
- Rate stats are PA/IP-weighted with per-season qualifier minimums (502 PA / 486 outs for a full
  season), so a 3-for-4 cameo cannot win a category.
- A surname is accepted when exactly one player on the board shares it; otherwise it costs a strike.
- Guessing someone who is ranked but off the board tells you their real rank.

`npm run verify` asserts all of this, including historical reference leaderboards
(Rose 4,256 hits; Henderson 1,406 SB; Bonds 139.2 WAR) that are also printed by
`python -m pipeline report`.

---

## Deploying to Cloudflare

> Hosting is **Pages** (client) + **Workers + R2** (API/data).

### 1. Create the resources

```bash
npx wrangler login
npx wrangler r2 bucket create ironurn-dataset
npx wrangler pages project create ironurn --production-branch=main
```

### 2. Publish the dataset

```bash
npm run data:all
npm run seed
```

### 3. Deploy

```bash
npm run deploy:api     # Worker
npm run deploy:web     # Pages (apps/web)
```

Or let CI do it — push to `main` and the **Deploy** workflow handles both.

### 4. Wire the client to the API

Set the `API_BASE` repository variable to your Worker's URL so the built client knows where to fetch:

```
Repo → Settings → Secrets and variables → Actions → Variables
  API_BASE = https://ironurn-api.<your-subdomain>.workers.dev/api
```

Locally it defaults to `/api` (served by the Vite middleware).

### Configuration

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Workers Scripts:Edit, Workers R2 Storage:Edit, Cloudflare Pages:Edit, Account:Read |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | your account id |
| Variable | `API_BASE` | Worker URL baked into the client |
| Variable | `R2_BUCKET` | defaults to `ironurn-dataset` |
| Variable | `DATASET_PREFIX` | defaults to `v1` |
| Variable | `PAGES_PROJECT` | defaults to `ironurn` |

## GitHub Actions

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | push to `main`, PRs | typecheck, build the client, rebuild the dataset and run the engine self-test |
| `deploy.yml` | push to `main` (app/worker paths), manual | deploys the Worker and publishes the client to Pages |
| `refresh-data.yml` | **cron + manual** | rebuilds the dataset from pybaseball and uploads it to R2 |

### Setting the refresh interval

Edit the cron in `.github/workflows/refresh-data.yml`:

```yaml
on:
  schedule:
    - cron: "17 9 * * *"      # daily at 09:17 UTC  (default)
    # - cron: "17 */6 * * *"  # every 6 hours
    # - cron: "17 * 3-10 * *" # hourly, March–October (during the season)
```

You can also run it on demand from **Actions → Refresh dataset → Run workflow**, with optional
`modern_from` / `end_season` inputs.

Two caveats worth knowing:

1. GitHub **disables scheduled workflows after 60 days of repository inactivity**. Any push
   re-enables them, or you can re-enable from the Actions tab.
2. Scheduled runs can be delayed by several minutes under load; for a sports-data refresh that is
   fine.

---

## Project layout

```
apps/web/            React + TypeScript client (Vite)
  src/lib/engine.ts  the Pinpoint engine: ranking, scoring, guess matching
  src/lib/schedule.ts deterministic puzzle resolution (mirrors schedule.py)
  src/pages/         Home, Free Play, Live, Archive, My Stats, How to Play
data/                Python data pipeline (pybaseball + Lahman)
workers/api/         Cloudflare Worker: dataset serving + schedule resolution
scripts/             R2 seeding, cost analysis, engine self-test
```

## Notes on data

- Lahman/Chadwick "Baseball Databank" is **public domain**.
- WAR comes from **Baseball Reference** via pybaseball, matching the original site's source.
  Baseball Reference's terms do not clearly license redistribution for commercial use — if you plan
  to commercialise this, either confirm terms with Sports Reference or swap in a computed WAR
  (the pipeline isolates WAR behind a single source module, so it is a small change).
- Not affiliated with Jomboy Media or Major League Baseball.

## Roadmap

The other two games (Daily Dinger, Starting 9) are scoped, costed and deliberately deferred — see
[ROADMAP.md](./ROADMAP.md).

## License

MIT for the code in this repository.
