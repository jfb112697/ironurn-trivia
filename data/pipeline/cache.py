"""Tiny on-disk cache so rebuilds are fast and can run offline."""
from __future__ import annotations

import gzip
from pathlib import Path
from typing import Callable

import pandas as pd

from .config import CACHE_DIR, RAW_DIR


def cached_frame(name: str, produce: Callable[[], pd.DataFrame], refresh: bool = False) -> pd.DataFrame:
    """Return a DataFrame, reading/writing a gzipped CSV cache under data/raw/cache."""
    path = CACHE_DIR / f"{name}.csv.gz"
    if path.exists() and not refresh:
        print(f"  cache hit   {name}")
        return pd.read_csv(path, low_memory=False)
    print(f"  fetching    {name} …")
    df = produce()
    if df is None:
        raise RuntimeError(f"source {name} returned no data")
    df.to_csv(path, index=False, compression="gzip")
    return df


def download(url: str, dest: Path, refresh: bool = False) -> Path:
    """Download a URL to dest, skipping when cached (unless refresh)."""
    if dest.exists() and dest.stat().st_size > 1024 and not refresh:
        print(f"  cached      {dest.name} ({dest.stat().st_size // 1024} KB)")
        return dest
    import requests

    print(f"  fetching    {dest.name} …")
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    return dest


def write_gzip_frame(df: pd.DataFrame, name: str) -> pd.DataFrame:
    df.to_csv(CACHE_DIR / f"{name}.csv.gz", index=False, compression="gzip")
    return df
