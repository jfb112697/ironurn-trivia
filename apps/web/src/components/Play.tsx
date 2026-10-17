import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { enterGameplay, gameIdentity, getActiveGame, setActiveGame } from "../lib/activeGame";
import { computeLeaderboard, matchGuess } from "../lib/engine";
import { loadDataset } from "../lib/data";
import { describeCriteria, formatVal } from "../lib/format";
import { recordBest, saveDailyResult } from "../lib/storage";
import type { Dataset, GameConfig, Leaderboard } from "../lib/types";
import { GuessInput } from "./GuessInput";
import { Results } from "./Results";

type Status = "loading" | "playing" | "over";

interface Verdict {
  id: number;
  text: string;
  kind: "correct" | "wrong" | "ambiguous" | "duplicate";
  note?: string;
}

/** Stable identity for a game shape, used for personal bests. */
export function gameKey(config: GameConfig): string {
  const c = config.criteria;
  if (config.mode === "daily") return `daily:${config.date}`;
  if (config.mode === "mini") return `mini:${config.date}`;
  if (config.mode === "live") return `live:${c.stat}:${c.yearMin}`;
  const pool =
    c.pool.tab === "all"
      ? "all"
      : c.pool.tab === "league"
        ? `lg:${c.pool.league}`
        : `tm:${(c.pool.teams ?? []).join("-")}`;
  return `free:${c.stat}:${c.yearMin}-${c.yearMax}:${pool}:${config.size}`;
}

export function Play({ config, onExit }: { config: GameConfig; onExit: () => void }) {
  const playerCount = config.players;
  const unlimited = config.maxStrikes <= 0;

  const [ds, setDs] = useState<Dataset | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [solved, setSolved] = useState<Record<number, number>>({});
  const [strikes, setStrikes] = useState<number[]>(() => Array(playerCount).fill(0));
  const [out, setOut] = useState<boolean[]>(() => Array(playerCount).fill(false));
  const [turn, setTurn] = useState(0);
  const [feed, setFeed] = useState<Verdict[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(config.seconds);
  const [showMissed, setShowMissed] = useState(false);

  const feedId = useRef(0);
  const savedRef = useRef(false);
  const identity = useMemo(() => gameIdentity(config), [config]);

  // Hide the layout's Continue bar while a board is actually on screen.
  useEffect(() => enterGameplay(), []);

  // ── load + rank ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(null);
    setShowMissed(false);
    savedRef.current = false;

    // Resume an unfinished game when this is the same board; otherwise start
    // fresh (which also replaces any other saved game).
    const saved = getActiveGame();
    const resume = saved && gameIdentity(saved.config) === identity ? saved : null;
    setSolved(resume?.solved ?? {});
    setStrikes(resume?.strikes ?? Array(playerCount).fill(0));
    setOut(resume?.out ?? Array(playerCount).fill(false));
    setTurn(resume?.turn ?? 0);
    setFeed(resume?.feed ?? []);
    setSecondsLeft(resume?.secondsLeft ?? config.seconds);
    feedId.current = resume?.feed?.length ? Math.max(...resume.feed.map((f) => f.id)) : 0;

    loadDataset(config.criteria.stat)
      .then((dataset) => {
        if (!alive) return;
        const lb = computeLeaderboard(dataset, {
          stat: config.criteria.stat,
          yearMin: config.criteria.yearMin,
          yearMax: config.criteria.yearMax,
          pool: config.criteria.pool,
          size: config.size,
        });
        setDs(dataset);
        setBoard(lb);
        setStatus("playing");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("over");
      });

    return () => {
      alive = false;
    };
  }, [config, playerCount]);

  // ── countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config.seconds || status !== "playing") return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [config.seconds, status]);

  const solvedCount = Object.keys(solved).length;

  const scores = useMemo(() => {
    const s = Array<number>(playerCount).fill(0);
    if (!board) return s;
    for (const e of board.entries) {
      const p = solved[e.pid];
      if (p !== undefined) s[p] += e.points;
    }
    return s;
  }, [board, solved, playerCount]);

  const soloScore = scores[0] ?? 0;
  const won = board ? soloScore >= board.targetScore : false;
  const complete = solvedCount >= config.size;
  const allOut = out.every(Boolean);

  // ── end conditions ────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "playing") return;
    if (complete || (!unlimited && allOut) || secondsLeft === 0) setStatus("over");
  }, [status, complete, allOut, secondsLeft, unlimited]);

  // ── persist the outcome once ──────────────────────────────────────────
  useEffect(() => {
    if (status !== "over" || !board || !ds || savedRef.current || error) return;
    savedRef.current = true;
    if (playerCount !== 1) return;

    if (!config.practice && (config.mode === "daily" || config.mode === "mini" || config.mode === "live")) {
      saveDailyResult({
        date: config.date ?? "",
        mode: config.mode,
        score: soloScore,
        totalPoints: board.totalPoints,
        correct: solvedCount,
        size: config.size,
        won,
        finished: true,
      });
    }
    recordBest({
      key: gameKey(config),
      label: `${describeCriteria(ds, config.criteria)} \u00b7 ${config.size} deep`,
      score: soloScore,
      totalPoints: board.totalPoints,
      correct: solvedCount,
      size: config.size,
      won,
      at: new Date().toISOString(),
    });
  }, [status, board, ds, error, playerCount, soloScore, solvedCount, config, won]);

  // ── keep the resumable snapshot in sync while playing ─────────────────
  useEffect(() => {
    if (status !== "playing" || !board || !ds) return;
    setActiveGame({
      config,
      label: config.mode === "free" || config.mode === "live" ? describeCriteria(ds, config.criteria) : config.title,
      solved,
      strikes,
      out,
      turn,
      feed,
      secondsLeft,
      updatedAt: Date.now(),
    });
    // `secondsLeft` is intentionally not a dependency: persisting once per tick
    // would be wasteful, and the last write already carries a sane value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, board, ds, identity, solved, strikes, out, turn, feed]);

  // A finished game is no longer resumable.
  useEffect(() => {
    if (status === "over") setActiveGame(null);
  }, [status]);

  // ── guessing ──────────────────────────────────────────────────────────
  const push = useCallback((v: Omit<Verdict, "id">) => {
    setFeed((f) => [...f.slice(-40), { ...v, id: ++feedId.current }]);
  }, []);

  const submit = useCallback(
    (text: string) => {
      if (!board || !ds || status !== "playing" || out[turn]) return;
      const res = matchGuess(board.entries, board.full, new Set(Object.keys(solved).map(Number)), text);
      if (!res) return;

      if (res.kind === "correct") {
        setSolved((prev) => ({ ...prev, [res.entry.pid]: turn }));
        push({
          text: res.entry.name,
          kind: "correct",
          note: `${formatVal(config.criteria.stat, res.entry.val, ds.meta)} \u00b7 +${res.entry.points}`,
        });
        if (playerCount === 2) setTurn((t) => nextTurn(t, out));
        return;
      }

      if (res.kind === "duplicate") {
        push({ text: res.entry.name, kind: "duplicate", note: "already found" });
        return;
      }

      if (res.kind === "ambiguous") {
        push({ text, kind: "ambiguous", note: `${res.count} players match` });
      } else {
        push({ text, kind: "wrong", note: res.rank ? `that's #${res.rank}` : "not ranked" });
      }

      if (unlimited) return;

      const n = strikes[turn] + 1;
      const isOut = n >= config.maxStrikes;
      const nextStrikes = [...strikes];
      nextStrikes[turn] = n;
      const nextOut = out.map((v, i) => (i === turn ? isOut : v));
      setStrikes(nextStrikes);
      setOut(nextOut);
      if (playerCount === 2) setTurn((t) => nextTurn(t, nextOut));
    },
    [board, ds, status, out, turn, solved, push, config, unlimited, playerCount, strikes],
  );

  // ── render ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="card">
        <h2>Couldn't load the dataset</h2>
        <p className="error">{error}</p>
        <p className="small">
          If you're running locally, build the data first: <code>npm run data:all</code>.
        </p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  if (status === "loading" || !board || !ds) {
    return (
      <div className="loading">
        <span className="spinner" />
        <span>Ranking the leaderboard…</span>
      </div>
    );
  }

  if (status === "over") {
    return (
      <Results
        config={config}
        ds={ds}
        board={board}
        solved={solved}
        scores={scores}
        won={won}
        out={out}
        onExit={onExit}
        onReplay={config.mode === "free" && config.players === 1 ? onExit : undefined}
      />
    );
  }

  const timer =
    secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : null;
  const short = ds.meta.stats[config.criteria.stat]?.short ?? config.criteria.stat.toUpperCase();

  return (
    <>
      <div className="game-head">
        <div className="spread">
          <div>
            <div className="tiny">
              {config.mode === "daily" && `Pinpoint Daily · ${config.date}`}
              {config.mode === "mini" && `Pinpoint Mini · ${config.date}`}
              {config.mode === "live" && `Live Season ${config.criteria.yearMin}`}
              {config.mode === "free" && "Free Play"}
            </div>
            <div className="criteria-title">{describeCriteria(ds, config.criteria)}</div>
            <div className="crit-meta">
              <span className="pill accent">
                Top {config.size} by {short}
              </span>
              <span className="pill">{poolLabel(ds, config)}</span>
              {playerCount === 2 && <span className="pill amber">Player {turn + 1}'s turn</span>}
            </div>
          </div>
          <button className="btn ghost sm" onClick={onExit}>
            Exit
          </button>
        </div>

        <div className="stat-strip" style={{ marginTop: 14 }}>
          <div className="metric">
            <div className="v">
              {soloScore}
              <span className="muted" style={{ fontSize: 13 }}>
                /{board.totalPoints}
              </span>
            </div>
            <div className="k">Score</div>
          </div>
          <div className="metric">
            <div className="v">
              {solvedCount}
              <span className="muted" style={{ fontSize: 13 }}>
                /{config.size}
              </span>
            </div>
            <div className="k">Found</div>
          </div>
          <div className="metric">
            <div className="v">{board.targetScore}</div>
            <div className="k">To qualify</div>
          </div>
          {timer && (
            <div className="metric">
              <div className="v" style={{ color: secondsLeft !== null && secondsLeft <= 10 ? "var(--red)" : undefined }}>
                {timer}
              </div>
              <div className="k">Time</div>
            </div>
          )}
          <div className="metric">
            <div className="v" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {playerCount === 1 ? (
                unlimited ? (
                  <span className="muted" style={{ fontSize: 13 }}>
                    Unlimited
                  </span>
                ) : (
                  <span className="strikes">
                    {Array.from({ length: config.maxStrikes }, (_, i) => (
                      <span key={i} className={`strike${i < strikes[0] ? " on" : ""}`} />
                    ))}
                  </span>
                )
              ) : (
                out.map((isOut, i) => (
                  <span key={i} className="tiny" style={{ color: isOut ? "var(--red)" : "var(--muted)" }}>
                    P{i + 1} {isOut ? "OUT" : `${scores[i]}p`}
                  </span>
                ))
              )}
            </div>
            <div className="k">{playerCount === 1 ? "Strikes" : "Players"}</div>
          </div>
        </div>

        <div className="bar">
          <i style={{ width: `${(solvedCount / config.size) * 100}%` }} />
        </div>
      </div>

      {playerCount === 2 && out[turn] && <div className="flash bad">Player {turn + 1} is out of strikes.</div>}

      <GuessInput ds={ds} disabled={playerCount === 2 && out[turn]} onSubmit={submit} />

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => setShowMissed((v) => !v)}>
          {showMissed ? "Hide" : "Show"} remaining ranks
        </button>
        <button className="btn ghost sm" onClick={() => setStatus("over")}>
          Give up
        </button>
      </div>

      <div className="board">
        <div className="board-head">
          <span>#</span>
          <span>Player</span>
          <span style={{ textAlign: "right" }}>Value</span>
        </div>
        <div className="slots">
          {board.entries.map((e) => {
            const by = solved[e.pid];
            const filled = by !== undefined;
            return (
              <div key={e.pid} className={`slot${filled ? " filled" : " hidden"}`}>
                <span className="rk">{e.rank}</span>
                <span className="who">
                  <span className="nm">{filled ? e.name : "•••••••"}</span>
                  <span className="sub">
                    {filled
                      ? `${e.years}${e.teams ? ` · ${e.teams}` : ""}`
                      : showMissed
                        ? `${e.years} · ${e.teams}`
                        : `${e.points} pts available`}
                  </span>
                </span>
                <span className="right">
                  {playerCount === 2 && filled && <span className="pts">P{by + 1}</span>}
                  <span className="val">{filled ? formatVal(config.criteria.stat, e.val, ds.meta) : "—"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {feed.length > 0 && (
        <div className="feed">
          {feed.map((f) => (
            <div key={f.id} className={`feed-item ${f.kind}`}>
              <span>
                {f.kind === "correct" && "✓ "}
                {f.kind === "wrong" && "✗ "}
                {f.kind === "ambiguous" && "? "}
                {f.kind === "duplicate" && "↺ "}
                <b>{f.text}</b>
              </span>
              {f.note && <span className="note">{f.note}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function nextTurn(from: number, out: boolean[]): number {
  const n = from + 1;
  if (n < out.length) return n;
  const firstAlive = out.findIndex((o) => !o);
  return firstAlive === -1 ? 0 : firstAlive;
}

function poolLabel(ds: Dataset, config: GameConfig): string {
  const pool = config.criteria.pool;
  if (pool.tab === "league") return `${(pool.league ?? "").split(",").filter(Boolean).join("/")} only`;
  if (pool.tab === "team") {
    const names = (pool.teams ?? []).map((i) => ds.teams.franchises[i]?.abbr ?? "?").filter(Boolean);
    return names.length ? names.join(", ") : "All MLB";
  }
  return "All MLB";
}
