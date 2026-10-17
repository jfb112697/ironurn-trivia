import { useEffect, useState } from "react";
import { loadMeta, loadTemplates, preload } from "../lib/data";
import { dateKey, puzzleFor } from "../lib/schedule";
import { dailyResult } from "../lib/storage";
import { href } from "../lib/router";
import type { Meta, Puzzle, Templates } from "../lib/types";

function summary(meta: Meta | null, p: Puzzle): string {
  const label = meta?.stats[p.criteria.stat]?.label ?? p.criteria.stat.toUpperCase();
  const years = p.criteria.yearMin === p.criteria.yearMax ? `${p.criteria.yearMin}` : `${p.criteria.yearMin}–${p.criteria.yearMax}`;
  return `${label} · ${years}`;
}

export function Home() {
  const [tpl, setTpl] = useState<Templates | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = dateKey();
  const year = new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    Promise.all([loadTemplates(), loadMeta()])
      .then(([t, m]) => {
        if (!alive) return;
        setTpl(t);
        setMeta(m);
        // Warm the table the daily needs so tapping Play is instant.
        preload(puzzleFor(t, dateKey(), "daily").criteria.stat);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  const daily = tpl ? puzzleFor(tpl, today, "daily") : null;
  const mini = tpl ? puzzleFor(tpl, today, "mini") : null;
  const dailyDone = dailyResult(today, "daily");
  const miniDone = dailyResult(today, "mini");

  return (
    <div className="stack">
      <section>
        <span className="kicker">Free · Unlimited · No account</span>
        <h1>Name the best. Steal the board.</h1>
        <p className="lede">
          Pinpoint gives you a statistic, a year range and a player pool. You have three strikes to name as many of the
          top players as you can — the higher they rank, the more points they're worth. Beat one third of the total to
          qualify.
        </p>
      </section>

      {error && (
        <div className="error">
          Couldn't reach the dataset API ({error}). Run <code>npm run data:all</code> and reload.
        </div>
      )}

      <div className="grid two">
        <a className="tile" href={href(`/play/daily/${today}`)}>
          <div className="t-head">
            <span className="pill accent">Daily</span>
            <h3>Pinpoint Daily</h3>
          </div>
          <div className="t-body">
            {daily ? (
              <>
                <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>{daily.title}</div>
                {summary(meta, daily)} · top {daily.size}
              </>
            ) : (
              "Loading today's board…"
            )}
          </div>
          {dailyDone ? (
            <span className="done-strip">
              ✓ Played — {dailyDone.score.toLocaleString()} pts{dailyDone.won ? " · qualified" : ""}
            </span>
          ) : (
            <span className="btn primary">Play Daily</span>
          )}
        </a>

        <a className="tile" href={href(`/play/mini/${today}`)}>
          <div className="t-head">
            <span className="pill">Mini</span>
            <h3>Pinpoint Mini</h3>
          </div>
          <div className="t-body">
            {mini ? (
              <>
                <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>{mini.title}</div>
                {summary(meta, mini)} · top {mini.size}
              </>
            ) : (
              "Loading today's board…"
            )}
          </div>
          {miniDone ? (
            <span className="done-strip">
              ✓ Played — {miniDone.score.toLocaleString()} pts{miniDone.won ? " · qualified" : ""}
            </span>
          ) : (
            <span className="btn">Play Mini</span>
          )}
        </a>
      </div>

      <div className="grid three">
        <a className="tile" href={href("/free")}>
          <div className="t-head">
            <h3>Free Play</h3>
          </div>
          <div className="t-body">
            Pick any statistic, year range, pool and board depth. Same-screen two-player is supported.
          </div>
          <span className="btn block">Set up a game</span>
        </a>

        <a className="tile" href={href(`/live/${year}`)}>
          <div className="t-head">
            <h3>Live Season {year}</h3>
          </div>
          <div className="t-body">
            Current-season minigames built from up-to-the-minute {year} data. Perfect for the stretch run.
          </div>
          <span className="btn block">Play live boards</span>
        </a>

        <a className="tile" href={href("/archive")}>
          <div className="t-head">
            <h3>Archive</h3>
          </div>
          <div className="t-body">Missed a day? Every Daily and Mini puzzle is a pure function of its date.</div>
          <span className="btn block">Browse past puzzles</span>
        </a>
      </div>

      {meta && (
        <div className="card tight">
          <div className="spread">
            <div className="row" style={{ gap: 18 }}>
              <span className="small">
                <b style={{ color: "var(--text)" }}>{meta.playerCount.toLocaleString()}</b> players
              </span>
              <span className="small">
                <b style={{ color: "var(--text)" }}>
                  {meta.firstYear}–{meta.lastYear}
                </b>{" "}
                seasons
              </span>
              <span className="small">
                <b style={{ color: "var(--text)" }}>{(meta.battingRecords + meta.pitchingRecords).toLocaleString()}</b>{" "}
                season lines
              </span>
              <span className="small">
                <b style={{ color: "var(--text)" }}>{meta.warRecords.toLocaleString()}</b> WAR entries
              </span>
            </div>
            <span className="tiny">Updated {meta.generated}</span>
          </div>
        </div>
      )}
    </div>
  );
}
