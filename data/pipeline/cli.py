"""Command-line entrypoint: ``python -m pipeline <command>``."""
from __future__ import annotations

import argparse
import sys
from datetime import date

from . import __version__


def main(argv: list[str] | None = None) -> int:
    # Windows consoles default to cp1252; the pipeline prints a few non-ASCII
    # glyphs (≤, ·, —) and we want clean output everywhere.
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    parser = argparse.ArgumentParser(prog="pipeline", description="IronUrn Trivia data pipeline")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    for name, help_text in [
        ("fetch", "download the Lahman CSVs and prime the pybaseball caches"),
        ("build", "build datasets (uses caches; no network unless missing)"),
        ("refresh", "re-fetch pybaseball sources and rebuild (current-season update)"),
        ("schedule", "generate the deterministic daily puzzle schedule"),
        ("report", "sanity-check the built datasets and print sample leaderboards"),
        ("all", "fetch + build + schedule"),
    ]:
        p = sub.add_parser(name, help=help_text)
        p.add_argument("--end-season", type=int, default=None, help="last season to include")
        p.add_argument("--modern-from", type=int, default=None,
                       help="first season to source from Baseball Reference (default: after Lahman)")
        p.add_argument("--no-live", action="store_true", help="skip the live season pack")
        p.add_argument("--days", type=int, default=730, help="schedule horizon in days")

    args = parser.parse_args(argv)

    from . import build as build_mod
    from .sources import lahman, bref
    from . import schedule as schedule_mod

    if args.command == "report":
        from . import report as report_mod

        return report_mod.main()

    if args.command in ("build", "refresh", "all"):
        refresh = args.command in ("refresh", "all")
        build_mod.build(
            end_season=args.end_season,
            refresh=refresh,
            modern_from=args.modern_from,
            live=not args.no_live,
        )
    elif args.command == "fetch":
        lahman.fetch(refresh=False)
        bref.register()
        bref.war_bat()
        bref.war_pitch()

    if args.command in ("schedule", "all"):
        schedule_mod.build(date.today(), days=args.days)

    return 0


if __name__ == "__main__":
    sys.exit(main())
