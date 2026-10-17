"""Sanity-check the built datasets and print sample leaderboards.

Also acts as the reference implementation of the Pinpoint aggregation engine
that the TypeScript client mirrors.

    python -m pipeline report
"""
from __future__ import annotations

import json
from collections import defaultdict

from .config import OUT_DIR, RATE_SCALE


def _load(name: str):
    return json.loads((OUT_DIR / name).read_text(encoding="utf-8"))


HITTING = {"hits", "hr", "rbi", "runs", "sb", "avg", "obp", "slg", "ops"}
PITCHING = {"wins", "k", "bb", "ip", "era", "whip", "g", "sv"}
RATE = {"avg", "obp", "slg", "ops", "era", "whip"}
LOW_IS_GOOD = {"era", "whip"}
WAR_STATS = {"war", "warh", "warp"}


def season_games(year: int) -> int:
    return {2020: 60, 1995: 144, 1994: 115, 1981: 107, 1972: 156,
            1919: 140, 1918: 124, 1917: 126}.get(year, 162)


def qualifiers(y0: int, y1: int) -> dict:
    n = max(1, y1 - y0 + 1)
    if n >= 7:
        return {"minPA": 3000, "minOuts": 3000}
    if n == 1:
        g = season_games(y0)
        return {"minPA": round(3.1 * g) if g < 162 else 502,
                "minOuts": g * 3 if g < 162 else 486}
    min_pa = min_outs = 0
    for y in range(y0, y1 + 1):
        g = season_games(y)
        min_pa += round(3.1 * g) if g < 162 else 450
        min_outs += g * 3 if g < 162 else 450
    return {"minPA": min_pa, "minOuts": min_outs}


def leaderboard(data, stat: str, y0: int, y1: int, size: int = 10):
    players, ids = data["players"], data["players"]["ids"]
    is_war = stat in WAR_STATS
    is_pit = stat in PITCHING
    is_rate = stat in RATE

    agg: dict[int, dict] = defaultdict(lambda: defaultdict(float))
    rows = data["war"] if is_war else (data["pitching"] if is_pit else data["batting"])
    for r in rows:
        pid, tid, year = r[0], r[1], r[2]
        if year < y0 or year > y1:
            continue
        a = agg[pid]
        if is_war:
            a["wh"] += r[3]
            a["wp"] += r[4]
        elif is_pit:
            _, _, _, outs, w, k, bb, er, h, g, gs, sv = r
            a["outs"] += outs
            a["w"] += w
            a["k"] += k
            a["bb"] += bb
            a["er"] += er
            a["h"] += h
            a["g"] += g
            a["gs"] += gs
            a["sv"] += sv
        else:
            _, _, _, pa, h, hr, rbi, run, sb, avg, obp, slg, ops = r
            a["pa"] += pa
            a["hits"] += h
            a["hr"] += hr
            a["rbi"] += rbi
            a["runs"] += run
            a["sb"] += sb
            a["avgW"] += pa * avg
            a["obpW"] += pa * obp
            a["slgW"] += pa * slg
            a["opsW"] += pa * ops

    q = qualifiers(y0, y1)
    out = []
    for pid, a in agg.items():
        if is_rate:
            if (is_pit and a["outs"] < q["minOuts"]) or (not is_pit and a["pa"] < q["minPA"]):
                continue
        val = 0.0
        if is_war:
            val = (a["wh"] + a["wp"]) / 100 if stat == "war" else (a["wh"] if stat == "warh" else a["wp"]) / 100
        elif is_pit:
            val = {"wins": a["w"], "k": a["k"], "bb": a["bb"], "ip": a["outs"],
                   "sv": a["sv"], "g": a["g"],
                   "era": round(a["er"] * 27 * RATE_SCALE / a["outs"]) if a["outs"] else 0,
                   "whip": round((a["bb"] + a["h"]) * 3 * RATE_SCALE / a["outs"]) if a["outs"] else 0}[stat]
        else:
            if stat == "avg":
                val = a["avgW"] / a["pa"]
            elif stat == "obp":
                val = a["obpW"] / a["pa"]
            elif stat == "slg":
                val = a["slgW"] / a["pa"]
            elif stat == "ops":
                val = a["opsW"] / a["pa"]
            else:
                val = {"hits": a["hits"], "hr": a["hr"], "rbi": a["rbi"],
                       "runs": a["runs"], "sb": a["sb"]}[stat]
        if is_rate and is_pit:
            val = val  # already x1000
        out.append((val, ids[pid], players["names"][pid]))

    out.sort(key=lambda t: t[0] if stat in LOW_IS_GOOD else -t[0])
    return out[:size]


def fmt(stat: str, v: float) -> str:
    if stat in WAR_STATS:
        return f"{v:.1f}"
    if stat == "ip":
        outs = int(v)
        return f"{outs // 3}.{outs % 3}"
    if stat in RATE:
        if stat == "era" or stat == "whip":
            return f"{v / RATE_SCALE:.2f}"
        s = f"{v / RATE_SCALE:.3f}"
        return s[1:] if s.startswith("0.") else s
    return str(int(v))


def main() -> int:
    data = {
        "meta": _load("meta.json"),
        "players": _load("players.json"),
        "teams": _load("teams.json"),
        "batting": _load("batting.json"),
        "pitching": _load("pitching.json"),
        "war": _load("war.json"),
    }
    meta = data["meta"]
    print(f"Dataset {meta['generated']} · years {meta['firstYear']}–{meta['lastYear']} · "
          f"{meta['playerCount']} players")
    print(f"  batting {meta['battingRecords']} · pitching {meta['pitchingRecords']} · "
          f"war {meta['warRecords']} · franchises {meta['franchiseCount']}\n")

    # rows per recent season
    per_year = defaultdict(int)
    for r in data["batting"]:
        if r[2] >= 2018:
            per_year[r[2]] += 1
    print("batting rows by season:", dict(sorted(per_year.items())))

    # team-code sanity for the most recent season
    last = meta["lastYear"]
    codes = {r[1] for r in data["batting"] if r[2] == last}
    team_ids = data["teams"]["ids"]
    print(f"{last} teams represented: {sorted(team_ids[c] for c in codes)}\n")

    checks = [
        ("hr", 1990, 2026), ("hits", 1871, 2026), ("sb", 1970, 2026),
        ("avg", 1990, 2026), ("ops", 1990, 2026), ("k", 1990, 2026),
        ("sv", 1980, 2026), ("era", 1990, 2026), ("warh", 1990, 2026),
        ("warp", 1990, 2026), ("war", 1990, 2026), ("hr", 2026, 2026),
        ("war", 2026, 2026),
    ]
    for stat, y0, y1 in checks:
        board = leaderboard(data, stat, y0, y1, size=5)
        vals = "  ".join(f"{n} {fmt(stat, v)}" for v, _pid, n in board)
        print(f"{stat:5} {y0}-{y1}: {vals}")

    # basic integrity
    bad = [r for r in data["batting"] if r[9] > RATE_SCALE or r[12] > 2 * RATE_SCALE]
    print(f"\nintegrity: {len(bad)} out-of-range rate rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
