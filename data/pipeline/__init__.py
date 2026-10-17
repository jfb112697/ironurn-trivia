"""IronUrn Trivia data pipeline.

Turns public baseball data into the compact JSON contract consumed by the
`workers/api` edge worker and the `apps/web` React client.

Primary source is pybaseball (Baseball Reference WAR + season stats, Chadwick
register). The public-domain Lahman/Chadwick CSVs provide the offline history
backbone so a full rebuild needs no network round-trips per season.
"""

__version__ = "1.0.0"
