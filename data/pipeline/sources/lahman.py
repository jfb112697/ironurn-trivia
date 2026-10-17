"""Lahman / Chadwick public-domain CSV source (offline history backbone)."""
from __future__ import annotations

import pandas as pd

from ..cache import download
from ..config import LAHMAN_BASE, LAHMAN_TABLES, RAW_DIR


def fetch(refresh: bool = False) -> None:
    for table in LAHMAN_TABLES:
        download(f"{LAHMAN_BASE}/{table}", RAW_DIR / table, refresh=refresh)


def _read(name: str, **kw) -> pd.DataFrame:
    path = RAW_DIR / name
    if not path.exists():
        fetch()
    return pd.read_csv(path, low_memory=False, **kw)


def batting() -> pd.DataFrame:
    return _read("Batting.csv")


def pitching() -> pd.DataFrame:
    return _read("Pitching.csv")


def people() -> pd.DataFrame:
    return _read("People.csv")


def teams() -> pd.DataFrame:
    return _read("Teams.csv")
