"""Deterministic daily puzzle schedule.

A Pinpoint puzzle is fully described by (stat, yearMin, yearMax, pool). We
generate one per date from a curated template list using a seeded PRNG, so the
same date always yields the same puzzle — no database, no runtime compute, and
the schedule can be precomputed and cached at the CDN edge forever.

The identical algorithm is reimplemented in the edge worker (TypeScript) so an
arbitrary date can be resolved on demand.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from .config import OUT_DIR

# Curated puzzle templates. Kept broad so daily games stay varied and always
# have a deep enough pool (validated against the built dataset).
TEMPLATES: list[dict] = [
    {"stat": "hr", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Home runs since 1990"},
    {"stat": "hr", "yearMin": 1950, "yearMax": 1989, "pool": {"tab": "all"}, "title": "Home runs, 1950–1989"},
    {"stat": "hits", "yearMin": 1970, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Hits since 1970"},
    {"stat": "hits", "yearMin": 1901, "yearMax": 1949, "pool": {"tab": "all"}, "title": "Hits, dead-ball to wartime"},
    {"stat": "rbi", "yearMin": 1980, "yearMax": 2026, "pool": {"tab": "all"}, "title": "RBI since 1980"},
    {"stat": "runs", "yearMin": 1920, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Runs since 1920"},
    {"stat": "sb", "yearMin": 1970, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Stolen bases since 1970"},
    {"stat": "sb", "yearMin": 1900, "yearMax": 1930, "pool": {"tab": "all"}, "title": "Stolen bases, dead-ball era"},
    {"stat": "avg", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Best batting averages since 1990"},
    {"stat": "obp", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "On-base leaders since 1990"},
    {"stat": "slg", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Slugging leaders since 1990"},
    {"stat": "ops", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "OPS leaders since 1990"},
    {"stat": "hr", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "league", "league": "AL"}, "title": "AL home runs since 1990"},
    {"stat": "hr", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "league", "league": "NL"}, "title": "NL home runs since 1990"},
    {"stat": "hits", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "league", "league": "AL"}, "title": "AL hits since 1990"},
    {"stat": "hits", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "league", "league": "NL"}, "title": "NL hits since 1990"},
    {"stat": "k", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Strikeout artists since 1990"},
    {"stat": "wins", "yearMin": 1970, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Winningest pitchers since 1970"},
    {"stat": "sv", "yearMin": 1980, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Saves leaders since 1980"},
    {"stat": "ip", "yearMin": 1970, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Workhorses since 1970"},
    {"stat": "era", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Best ERAs since 1990"},
    {"stat": "whip", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Lowest WHIP since 1990"},
    {"stat": "warh", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Most valuable hitters since 1990"},
    {"stat": "warp", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Most valuable pitchers since 1990"},
    {"stat": "war", "yearMin": 1990, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Most valuable players since 1990"},
    {"stat": "hr", "yearMin": 2000, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Home runs this century"},
    {"stat": "hits", "yearMin": 2000, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Hits this century"},
    {"stat": "k", "yearMin": 2000, "yearMax": 2026, "pool": {"tab": "all"}, "title": "Strikeouts this century"},
]

MINI_SIZE = 10
DAILY_SIZE = 100


def _mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def _seed_for(date_key: str, salt: str) -> int:
    h = 2166136261
    for ch in f"{date_key}|{salt}":
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def puzzle_for(date_key: str, mode: str = "daily") -> dict:
    """Resolve the puzzle definition for a date. mode: 'daily' | 'mini'."""
    salt = "ppd-v1" if mode == "daily" else "ppm-v1"
    rnd = _mulberry32(_seed_for(date_key, salt))
    tpl = TEMPLATES[int(rnd() * len(TEMPLATES)) % len(TEMPLATES)]
    size = DAILY_SIZE if mode == "daily" else MINI_SIZE
    return {
        "date": date_key,
        "mode": mode,
        "size": size,
        "title": tpl["title"],
        "criteria": {
            "stat": tpl["stat"],
            "yearMin": tpl["yearMin"],
            "yearMax": tpl["yearMax"],
            "pool": tpl["pool"],
        },
    }


def build(start: date, days: int = 730) -> dict:
    """Precompute a rolling window of daily + mini puzzles."""
    daily: dict[str, dict] = {}
    mini: dict[str, dict] = {}
    for i in range(days):
        key = (start + timedelta(days=i)).isoformat()
        daily[key] = puzzle_for(key, "daily")
        mini[key] = puzzle_for(key, "mini")

    payload = {"v": 1, "start": start.isoformat(), "days": days, "daily": daily, "mini": mini}
    path = OUT_DIR / "schedule.json"
    path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"  schedule.json   {len(daily)} daily + {len(mini)} mini puzzles "
          f"({path.stat().st_size / 1024:.0f} KB)")

    # Templates are the single source of truth shared with the edge worker, which
    # recomputes any date deterministically (no storage, no runtime state).
    tpl_path = OUT_DIR / "templates.json"
    tpl_path.write_text(json.dumps(
        {"v": 1, "dailySize": DAILY_SIZE, "miniSize": MINI_SIZE, "templates": TEMPLATES},
        separators=(",", ":"),
    ))
    print(f"  templates.json  {len(TEMPLATES)} templates")
    return payload
