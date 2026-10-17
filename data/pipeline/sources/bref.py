"""pybaseball source: Chadwick register, Baseball Reference WAR, BRef season stats.

FanGraphs leaderboards (``batting_stats`` / ``pitching_stats``) are 403-blocked
from many networks, so we deliberately build on the two sources that are
reliable and that the original site also used:

  * ``bwar_bat`` / ``bwar_pitch``            -> Baseball Reference WAR, 1871-2026
  * ``batting_stats_bref`` / ``pitching_stats_bref`` -> per-season counting stats
  * ``chadwick_register``                    -> identity + MLBAM <-> BRef ID map
"""
from __future__ import annotations

import pandas as pd

from ..cache import cached_frame

# pybaseball prints helpful-but-noisy progress; keep the build output clean.
import logging

logging.getLogger("pybaseball").setLevel(logging.WARNING)


def register(refresh: bool = False) -> pd.DataFrame:
    def produce() -> pd.DataFrame:
        from pybaseball import chadwick_register

        return chadwick_register()

    return cached_frame("chadwick_register", produce, refresh)


def war_bat(refresh: bool = False) -> pd.DataFrame:
    def produce() -> pd.DataFrame:
        from pybaseball import bwar_bat

        return bwar_bat()

    return cached_frame("bwar_bat", produce, refresh)


def war_pitch(refresh: bool = False) -> pd.DataFrame:
    def produce() -> pd.DataFrame:
        from pybaseball import bwar_pitch

        return bwar_pitch()

    return cached_frame("bwar_pitch", produce, refresh)


def batting_season(year: int, refresh: bool = False) -> pd.DataFrame:
    def produce() -> pd.DataFrame:
        from pybaseball import batting_stats_bref

        return batting_stats_bref(year)

    return cached_frame(f"bref_bat_{year}", produce, refresh)


def pitching_season(year: int, refresh: bool = False) -> pd.DataFrame:
    def produce() -> pd.DataFrame:
        from pybaseball import pitching_stats_bref

        return pitching_stats_bref(year)

    return cached_frame(f"bref_pitch_{year}", produce, refresh)
