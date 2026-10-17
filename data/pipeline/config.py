"""Shared configuration: paths, constants and the stat registry."""
from __future__ import annotations

from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = DATA_DIR / "raw"
CACHE_DIR = RAW_DIR / "cache"
OUT_DIR = DATA_DIR / "out"

RAW_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Public-domain Lahman / Chadwick "Baseball Databank" core tables.
LAHMAN_BASE = (
    "https://raw.githubusercontent.com/cbwinslow/baseballdatabank/master/core"
)
LAHMAN_TABLES = ["Batting.csv", "Pitching.csv", "People.csv", "Teams.csv"]

# Rate stats are stored as integers x 1000 (matches the original engine).
RATE_SCALE = 1000
FIRST_YEAR = 1871

# Stat registry — the contract shared by the worker and the web client.
# kind: count | rate | innings | war ; lowIsGood flags "lower is better".
STATS: dict[str, dict] = {
    "hits": {"label": "Hits", "short": "H", "kind": "count", "group": "hitting"},
    "hr": {"label": "Home Runs", "short": "HR", "kind": "count", "group": "hitting"},
    "rbi": {"label": "RBI", "short": "RBI", "kind": "count", "group": "hitting"},
    "runs": {"label": "Runs", "short": "R", "kind": "count", "group": "hitting"},
    "sb": {"label": "Stolen Bases", "short": "SB", "kind": "count", "group": "hitting"},
    "avg": {"label": "Batting Average", "short": "AVG", "kind": "rate", "group": "hitting"},
    "obp": {"label": "On-Base %", "short": "OBP", "kind": "rate", "group": "hitting"},
    "slg": {"label": "Slugging %", "short": "SLG", "kind": "rate", "group": "hitting"},
    "ops": {"label": "OPS", "short": "OPS", "kind": "rate", "group": "hitting"},
    "wins": {"label": "Wins", "short": "W", "kind": "count", "group": "pitching"},
    "k": {"label": "Strikeouts", "short": "K", "kind": "count", "group": "pitching"},
    "bb": {"label": "Walks", "short": "BB", "kind": "count", "group": "pitching"},
    "ip": {"label": "Innings Pitched", "short": "IP", "kind": "innings", "group": "pitching"},
    "era": {"label": "ERA", "short": "ERA", "kind": "rate", "group": "pitching", "lowIsGood": True},
    "whip": {"label": "WHIP", "short": "WHIP", "kind": "rate", "group": "pitching", "lowIsGood": True},
    "g": {"label": "Games Pitched", "short": "G", "kind": "count", "group": "pitching"},
    "sv": {"label": "Saves", "short": "SV", "kind": "count", "group": "pitching"},
    "warh": {"label": "WAR", "short": "WAR", "kind": "war", "group": "hitting"},
    "warp": {"label": "WAR", "short": "WAR", "kind": "war", "group": "pitching"},
    "war": {"label": "WAR", "short": "WAR", "kind": "war", "group": "all"},
}
