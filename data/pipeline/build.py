"""Merge sources into the compact JSON dataset contract.

The contract (all files under data/out/):

  meta.json      dataset metadata + stat registry
  players.json   { ids[], names[], search[], debut[], last[] }  (index = player id)
  teams.json     { ids[], abbr[], franchiseOf[], leagues[[t,y,lg]], franchises[] }
  batting.json   [[pid, tid, year, PA, H, HR, RBI, R, SB, AVG, OBP, SLG, OPS]]  (rate x1000)
  pitching.json  [[pid, tid, year, OUTS, W, K, BB, ER, H, G, GS, SV]]
  war.json       [[pid, tid, year, WARh x100, WARp x100]]
  manifest.json  dataset catalogue (all-time + live season pack)
  live.json      self-contained current-season slice for live mini-games

Everything is integer-dictionary encoded and deterministic so it can be cached
at the CDN edge forever.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from typing import Any

from .config import OUT_DIR, RATE_SCALE, STATS
from .sources import bref, lahman


# ── helpers ─────────────────────────────────────────────────────────────────
def normalize(s: Any) -> str:
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def isna(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float):
        return v != v  # NaN
    return False


def num(v: Any, default: float = 0.0) -> float:
    if isna(v):
        return default
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return n if n == n else default


def ip_to_outs(v: Any) -> int:
    """Convert a Baseball Reference IP string/float ("166.1") to outs."""
    if isna(v):
        return 0
    s = str(v).strip()
    if s == "" or s.lower() == "nan":
        return 0
    if "." in s:
        whole, frac = s.split(".", 1)
        frac = (frac + "0")[0]
        try:
            w = int(float(whole))
        except ValueError:
            return 0
        if frac in ("0", "1", "2"):
            return w * 3 + int(frac)
        try:
            return round(float(s) * 3)
        except ValueError:
            return w * 3
    try:
        return int(float(s)) * 3
    except ValueError:
        return 0


def _records(df) -> list[dict]:
    return df.to_dict("records")


def _write(name: str, data: Any, note: str = "") -> int:
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    path = OUT_DIR / name
    path.write_text(payload, encoding="utf-8")
    kb = len(payload.encode("utf-8")) / 1024
    size = f"{kb / 1024:.2f} MB" if kb > 1024 else f"{kb:.0f} KB"
    print(f"  {name:<16}{size:>10}   {note}")
    return len(payload.encode("utf-8"))


# ── main build ──────────────────────────────────────────────────────────────
def build(
    end_season: int | None = None,
    refresh: bool = False,
    modern_from: int | None = None,
    live: bool = True,
) -> dict:
    print("Loading sources…")
    lahman.fetch(refresh=False)
    reg = bref.register(refresh)
    wbat = _records(bref.war_bat(refresh))
    wpit = _records(bref.war_pitch(refresh))

    lbat = _records(lahman.batting())
    lpit = _records(lahman.pitching())
    lpeo = _records(lahman.people())
    ltea = _records(lahman.teams())

    # ── identity: MLBAM id -> BRef/Lahman id ────────────────────────────────
    mlbam_to_bbref: dict[int, str] = {}
    name_by_bbref: dict[str, str] = {}
    span_by_bbref: dict[str, tuple[str, str]] = {}
    for r in _records(reg):
        bb = r.get("key_bbref")
        if isna(bb):
            continue
        bb = str(bb)
        ml = r.get("key_mlbam")
        if not isna(ml):
            try:
                mlbam_to_bbref[int(float(ml))] = bb
            except (TypeError, ValueError):
                pass
        first = "" if isna(r.get("name_first")) else str(r.get("name_first")).strip()
        last = "" if isna(r.get("name_last")) else str(r.get("name_last")).strip()
        if first or last:
            name_by_bbref[bb] = f"{first} {last}".strip()
        d = "" if isna(r.get("mlb_played_first")) else str(int(num(r.get("mlb_played_first"))))
        f = "" if isna(r.get("mlb_played_last")) else str(int(num(r.get("mlb_played_last"))))
        span_by_bbref[bb] = (d, f)

    for p in lpeo:
        bb = str(p.get("playerID"))
        if bb not in name_by_bbref:
            first = str(p.get("nameFirst") or "").strip()
            last = str(p.get("nameLast") or "").strip()
            given = str(p.get("nameGiven") or "").strip()
            name_by_bbref[bb] = (f"{first} {last}".strip() or given or last or bb)

    # ── year span ───────────────────────────────────────────────────────────
    lahman_max = max(int(num(r.get("yearID"))) for r in lbat)
    bwar_max = max(int(num(r.get("year_ID"))) for r in wbat)
    end = int(end_season or bwar_max)
    lahman_upto = (modern_from - 1) if modern_from else lahman_max
    modern_years = [y for y in range(lahman_upto + 1, end + 1)]
    print(f"  Lahman ≤ {lahman_upto} · BRef seasons {modern_years or '—'} · WAR through {bwar_max}")

    # ── teams ───────────────────────────────────────────────────────────────
    lahman_team_code: dict[tuple[int, str], str] = {}
    tmeta: dict[str, dict] = {}
    leagues: set[tuple[str, int, str]] = set()
    for t in ltea:
        team_id = str(t.get("teamID") or "")
        if not team_id:
            continue
        year = int(num(t.get("yearID")))
        code = str(t.get("teamIDBR") or "").strip() or team_id
        lahman_team_code[(year, team_id)] = code
        prev = tmeta.get(code)
        if prev is None or year >= prev["year"]:
            tmeta[code] = {
                "year": year,
                "name": str(t.get("name") or code).strip(),
                "franch": str(t.get("franchID") or code).strip(),
            }
        lg = str(t.get("lgID") or "").strip()
        if lg:
            leagues.add((code, year, lg))

    codes = set(tmeta.keys())
    for r in wbat:
        if not isna(r.get("team_ID")):
            codes.add(str(r.get("team_ID")))
    for r in wpit:
        if not isna(r.get("team_ID")):
            codes.add(str(r.get("team_ID")))
    codes = sorted(codes)
    team_idx = {c: i for i, c in enumerate(codes)}

    for r in wbat:
        if not isna(r.get("lg_ID")) and not isna(r.get("team_ID")):
            leagues.add((str(r["team_ID"]), int(num(r.get("year_ID"))), str(r["lg_ID"])))
    for r in wpit:
        if not isna(r.get("lg_ID")) and not isna(r.get("team_ID")):
            leagues.add((str(r["team_ID"]), int(num(r.get("year_ID"))), str(r["lg_ID"])))

    franch_of_code: dict[str, str] = {c: tmeta.get(c, {}).get("franch", c) for c in codes}
    franch_head: dict[str, dict] = {}
    for code in codes:
        f = franch_of_code[code]
        m = tmeta.get(code)
        if not m:
            franch_head.setdefault(f, {"name": f, "abbr": code, "first": 0, "last": 0})
            continue
        h = franch_head.get(f)
        if h is None or m["year"] >= h["last"]:
            franch_head[f] = {
                "name": m["name"],
                "abbr": code,
                "first": min(h["first"], m["year"]) if h else m["year"],
                "last": m["year"],
            }
        else:
            h["first"] = min(h["first"], m["year"])
    franch_ids = sorted(franch_head.keys(), key=lambda f: franch_head[f]["name"].lower())
    franch_idx = {f: i for i, f in enumerate(franch_ids)}

    # ── modern BRef seasons (2022+) ─────────────────────────────────────────
    war_team: dict[tuple[str, int], tuple[str, float]] = {}

    def consider_war_team(pid: str, year: int, code: str, g: float) -> None:
        key = (pid, year)
        cur = war_team.get(key)
        if cur is None or g > cur[1]:
            war_team[key] = (code, g)

    for r in wbat:
        consider_war_team(str(r.get("player_ID")), int(num(r.get("year_ID"))),
                          str(r.get("team_ID")), num(r.get("G")))
    for r in wpit:
        consider_war_team(str(r.get("player_ID")), int(num(r.get("year_ID"))),
                          str(r.get("team_ID")), num(r.get("G")))

    modern_bat: list[dict] = []
    modern_pit: list[dict] = []
    for y in modern_years:
        try:
            for r in _records(bref.batting_season(y, refresh)):
                ml = r.get("mlbID")
                if isna(ml):
                    continue
                pid = mlbam_to_bbref.get(int(float(ml)))
                if not pid:
                    continue
                code = war_team.get((pid, y), ("", 0))[0]
                r["_pid"] = pid
                r["_code"] = code
                r["_year"] = y
                modern_bat.append(r)
        except Exception as e:  # noqa: BLE001
            print(f"  ! batting_stats_bref({y}) failed: {e}")
        try:
            for r in _records(bref.pitching_season(y, refresh)):
                ml = r.get("mlbID")
                if isna(ml):
                    continue
                pid = mlbam_to_bbref.get(int(float(ml)))
                if not pid:
                    continue
                code = war_team.get((pid, y), ("", 0))[0]
                r["_pid"] = pid
                r["_code"] = code
                r["_year"] = y
                modern_pit.append(r)
        except Exception as e:  # noqa: BLE001
            print(f"  ! pitching_stats_bref({y}) failed: {e}")

    # ── player universe ─────────────────────────────────────────────────────
    pids: set[str] = set()
    for r in lbat:
        if int(num(r.get("yearID"))) <= lahman_upto:
            pids.add(str(r.get("playerID")))
    for r in lpit:
        if int(num(r.get("yearID"))) <= lahman_upto:
            pids.add(str(r.get("playerID")))
    for r in wbat:
        pids.add(str(r.get("player_ID")))
    for r in wpit:
        pids.add(str(r.get("player_ID")))
    for r in modern_bat + modern_pit:
        pids.add(r["_pid"])
    player_ids = sorted(pids)
    pidx = {p: i for i, p in enumerate(player_ids)}

    # name fallbacks from bwar
    for r in wbat:
        bb = str(r.get("player_ID"))
        if bb not in name_by_bbref and not isna(r.get("name_common")):
            name_by_bbref[bb] = str(r["name_common"])

    def tid_of(code: str) -> int:
        return team_idx.get(code, -1)

    # ── batting rows ────────────────────────────────────────────────────────
    batting: list[list] = []
    pitching: list[list] = []
    for r in lbat:
        year = int(num(r.get("yearID")))
        if year > lahman_upto:
            continue
        pid = str(r.get("playerID"))
        code = lahman_team_code.get((year, str(r.get("teamID"))), str(r.get("teamID")))
        ab, h = num(r.get("AB")), num(r.get("H"))
        bb, hbp, sh, sf = num(r.get("BB")), num(r.get("HBP")), num(r.get("SH")), num(r.get("SF"))
        pa = ab + bb + hbp + sh + sf
        if pa <= 0:
            continue
        b2, b3, hr = num(r.get("2B")), num(r.get("3B")), num(r.get("HR"))
        bat = _bat_row(pidx[pid], tid_of(code), year, ab, h, bb, hbp, sf, b2, b3, hr,
                       r.get("RBI"), r.get("R"), r.get("SB"), pa)
        if bat:
            batting.append(bat)

    for r in modern_bat:
        code = r["_code"]
        if not code or tid_of(code) < 0:
            continue
        year = int(r["_year"])
        ab, h = num(r.get("AB")), num(r.get("H"))
        bb, hbp, sh, sf = num(r.get("BB")), num(r.get("HBP")), num(r.get("SH")), num(r.get("SF"))
        pa = num(r.get("PA")) or (ab + bb + hbp + sh + sf)
        if pa <= 0:
            continue
        b2, b3, hr = num(r.get("2B")), num(r.get("3B")), num(r.get("HR"))
        bat = _bat_row(pidx[r["_pid"]], tid_of(code), year, ab, h, bb, hbp, sf, b2, b3, hr,
                       r.get("RBI"), r.get("R"), r.get("SB"), pa)
        if bat:
            batting.append(bat)

    for r in lpit:
        year = int(num(r.get("yearID")))
        if year > lahman_upto:
            continue
        pid = str(r.get("playerID"))
        code = lahman_team_code.get((year, str(r.get("teamID"))), str(r.get("teamID")))
        outs = num(r.get("IPouts"))
        if outs <= 0:
            continue
        pitching.append([pidx[pid], tid_of(code), year, int(outs), int(num(r.get("W"))),
                         int(num(r.get("SO"))), int(num(r.get("BB"))), int(num(r.get("ER"))),
                         int(num(r.get("H"))), int(num(r.get("G"))), int(num(r.get("GS"))),
                         int(num(r.get("SV")))])

    for r in modern_pit:
        code = r["_code"]
        if not code or tid_of(code) < 0:
            continue
        year = r.get("_year")
        if year is None:
            continue
        outs = ip_to_outs(r.get("IP"))
        if outs <= 0:
            continue
        pitching.append([pidx[r["_pid"]], tid_of(code), int(year), int(outs), int(num(r.get("W"))),
                         int(num(r.get("SO"))), int(num(r.get("BB"))), int(num(r.get("ER"))),
                         int(num(r.get("H"))), int(num(r.get("G"))), int(num(r.get("GS"))),
                         int(num(r.get("SV")))])

    # ── WAR rows ────────────────────────────────────────────────────────────
    war: dict[tuple[str, str, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in wbat:
        if isna(r.get("WAR")):
            continue
        if str(r.get("pitcher") or "").strip().upper() == "Y":
            continue
        key = (str(r.get("player_ID")), str(r.get("team_ID")), int(num(r.get("year_ID"))))
        war[key][0] += float(r["WAR"])
    for r in wpit:
        if isna(r.get("WAR")):
            continue
        key = (str(r.get("player_ID")), str(r.get("team_ID")), int(num(r.get("year_ID"))))
        war[key][1] += float(r["WAR"])

    war_rows: list[list] = []
    for (pid, code, year), (wh, wp) in war.items():
        if abs(wh) < 0.05 and abs(wp) < 0.05:
            continue
        t = tid_of(code)
        if pid not in pidx or t < 0:
            continue
        war_rows.append([pidx[pid], t, year, round(wh * 100), round(wp * 100)])
    war_rows.sort(key=lambda r: (r[2], r[0], r[1]))

    return _emit(end, lahman_upto, modern_years, player_ids, name_by_bbref, span_by_bbref,
                 codes, tmeta, franch_of_code, franch_head, franch_ids, franch_idx,
                 leagues, batting, pitching, war_rows, live)


def _bat_row(pid, tid, year, ab, h, bb, hbp, sf, b2, b3, hr, rbi, runs, sb, pa):
    if tid < 0:
        return None
    tb = h + b2 + 2 * b3 + 3 * hr
    avg = h / ab if ab > 0 else 0.0
    denom = ab + bb + hbp + sf
    obp = (h + bb + hbp) / denom if denom > 0 else 0.0
    slg = tb / ab if ab > 0 else 0.0
    return [
        pid, tid, year, int(pa),
        int(h), int(hr), int(num(rbi)), int(num(runs)), int(num(sb)),
        round(avg * RATE_SCALE), round(obp * RATE_SCALE), round(slg * RATE_SCALE),
        round((obp + slg) * RATE_SCALE),
    ]


def _emit(end, lahman_upto, modern_years, player_ids, name_by_bbref, span_by_bbref,
          codes, tmeta, franch_of_code, franch_head, franch_ids, franch_idx,
          leagues, batting, pitching, war_rows, live) -> dict:
    print("Writing datasets…")
    generated = date.today().isoformat()
    tidx = {c: i for i, c in enumerate(codes)}

    names = []
    search = []
    debut = []
    last = []
    for p in player_ids:
        nm = name_by_bbref.get(p, p)
        names.append(nm)
        search.append(normalize(nm))
        d, f = span_by_bbref.get(p, ("", ""))
        debut.append(d)
        last.append(f)

    players = {"v": 1, "ids": player_ids, "names": names, "search": search,
               "debut": debut, "last": last}

    teams = {
        "v": 1,
        "ids": codes,
        "abbr": list(codes),
        "franchiseOf": [franch_idx.get(franch_of_code.get(c, c), -1) for c in codes],
        "leagues": sorted([[tidx[c], y, lg] for (c, y, lg) in leagues if c in tidx]),
        "franchises": [
            {
                "id": f,
                "name": franch_head[f]["name"],
                "abbr": franch_head[f]["abbr"],
                "first": franch_head[f]["first"],
                "last": franch_head[f]["last"],
                "teams": sorted(i for i, c in enumerate(codes) if franch_of_code.get(c) == f),
            }
            for f in franch_ids
        ],
    }

    years_present = sorted({r[2] for r in batting} | {r[2] for r in pitching} | {r[2] for r in war_rows})
    meta = {
        "v": 1,
        "source": "Lahman / Chadwick Baseball Databank + Baseball Reference (via pybaseball)",
        "warSource": "Baseball Reference WAR (bwar_bat / bwar_pitch)",
        "generated": generated,
        "firstYear": years_present[0] if years_present else 0,
        "lastYear": years_present[-1] if years_present else 0,
        "playerCount": len(player_ids),
        "battingRecords": len(batting),
        "pitchingRecords": len(pitching),
        "warRecords": len(war_rows),
        "franchiseCount": len(franch_ids),
        "stats": STATS,
    }

    total = 0
    total += _write("meta.json", meta, "metadata + stat registry")
    total += _write("players.json", players, f"{len(player_ids)} players")
    total += _write("teams.json", teams, f"{len(codes)} team codes / {len(franch_ids)} franchises")
    total += _write("batting.json", batting, f"{len(batting)} season batting lines")
    total += _write("pitching.json", pitching, f"{len(pitching)} season pitching lines")
    total += _write("war.json", war_rows, f"{len(war_rows)} WAR rows")

    live_meta = None
    if live and years_present:
        live_meta = _emit_live(years_present[-1], player_ids, name_by_bbref, codes, tmeta,
                               batting, pitching, war_rows, generated)

    manifest = {
        "v": 1,
        "generated": generated,
        "years": years_present,
        "modernFrom": (modern_years[0] if modern_years else None),
        "allTime": {
            "path": "out/",
            "meta": "meta.json",
            "players": "players.json",
            "teams": "teams.json",
            "batting": "batting.json",
            "pitching": "pitching.json",
            "war": "war.json",
            "playerCount": len(player_ids),
            "firstYear": years_present[0] if years_present else 0,
            "lastYear": years_present[-1] if years_present else 0,
        },
        "live": live_meta,
        "stats": STATS,
    }
    total += _write("manifest.json", manifest, "dataset catalogue")

    print(f"\nDone — {total / 1024 / 1024:.2f} MB total, years "
          f"{years_present[0] if years_present else '?'}–{years_present[-1] if years_present else '?'}, "
          f"{len(player_ids)} players.")
    return meta


def _emit_live(year, player_ids, name_by_bbref, codes, tmeta, batting, pitching, war_rows, generated):
    """Self-contained slice for the current season (live mini-games)."""
    b = [r for r in batting if r[2] == year]
    p = [r for r in pitching if r[2] == year]
    w = [r for r in war_rows if r[2] == year]

    used_p = sorted({r[0] for r in b} | {r[0] for r in p} | {r[0] for r in w})
    used_t = sorted({r[1] for r in b} | {r[1] for r in p} | {r[1] for r in w})
    p_remap = {old: i for i, old in enumerate(used_p)}
    t_remap = {old: i for i, old in enumerate(used_t)}

    def remap_bat(rows):
        return [[p_remap[r[0]], t_remap[r[1]], *r[2:]] for r in rows]

    pack = {
        "v": 1,
        "year": year,
        "generated": generated,
        "players": {
            "ids": [player_ids[i] for i in used_p],
            "names": [name_by_bbref.get(player_ids[i], player_ids[i]) for i in used_p],
            "search": [normalize(name_by_bbref.get(player_ids[i], player_ids[i])) for i in used_p],
        },
        "teams": {
            "ids": [codes[i] for i in used_t],
            "abbr": [codes[i] for i in used_t],
        },
        "batting": remap_bat(b),
        "pitching": remap_bat(p),
        "war": remap_bat(w),
        "counts": {"players": len(used_p), "batting": len(b), "pitching": len(p), "war": len(w)},
    }
    _write("live.json", pack, f"live {year} pack ({len(used_p)} players)")
    return {"path": "live.json", "year": year, "counts": pack["counts"], "generated": generated}
