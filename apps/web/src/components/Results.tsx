import { useMemo, useState } from "react";
import { TIER_LABEL, tierFor } from "../lib/engine";
import { describeCriteria, formatVal } from "../lib/format";
import { puzzleNumber } from "../lib/schedule";
import type { Dataset, GameConfig, Leaderboard } from "../lib/types";

interface Props {
  config: GameConfig;
  ds: Dataset;
  board: Leaderboard;
  solved: Record<number, number>;
  scores: number[];
  won: boolean;
  out: boolean[];
  onExit: () => void;
  onReplay?: () => void;
}

export function Results({ config, ds, board, solved, scores, won, out, onExit, onReplay }: Props) {
  const [copied, setCopied] = useState(false);
  const twoPlayer = config.players === 2;
  const score = scores[0] ?? 0;
  const correct = Object.keys(solved).length;
  const total = board.totalPoints;
  const tier = tierFor(score, total);

  const label =
    config.mode === "daily"
      ? `Pinpoint Daily #${puzzleNumber(config.date ?? "")}`
      : config.mode === "mini"
        ? `Pinpoint Mini #${puzzleNumber(config.date ?? "")}`
        : config.mode === "live"
          ? `Live Season ${config.criteria.yearMin}`
          : "Free Play";

  const missed = useMemo(
    () => board.entries.filter((e) => solved[e.pid] === undefined).slice(0, 12),
    [board, solved],
  );

  const shareText = useMemo(() => {
    const cells = board.entries
      .slice(0, config.size)
      .map((e) => (solved[e.pid] !== undefined ? "\u{1F7E9}" : "\u2B1C"));
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 10) rows.push(cells.slice(i, i + 10).join(""));
    return [
      `IronUrn ${label}`,
      `${describeCriteria(ds, config.criteria)} \u00b7 ${config.size} deep`,
      twoPlayer
        ? `P1 ${scores[0]} \u00b7 P2 ${scores[1]}`
        : `${correct}/${config.size} found \u00b7 ${score.toLocaleString()} pts \u00b7 ${TIER_LABEL[tier]}`,
      ...rows,
    ].join("\n");
  }, [board, config, correct, ds, label, score, solved, tier, twoPlayer, scores]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="card result-hero">
        <div className="tiny">
          {label} \u00b7 {config.date}
        </div>
        {!twoPlayer && <div className={`tier ${tier}`}>{TIER_LABEL[tier]}</div>}
        <h2 style={{ marginTop: 4 }}>
          {twoPlayer
            ? scores[0] === scores[1]
              ? "Dead heat"
              : `Player ${scores[0] > scores[1] ? 1 : 2} wins`
            : correct === config.size
              ? "Board cleared"
              : won
                ? "You qualified!"
                : "Out of strikes"}
        </h2>
        <p className="small">{describeCriteria(ds, config.criteria)} \u00b7 {config.size} deep</p>

        <div className="stat-strip" style={{ maxWidth: 560, margin: "12px auto 0" }}>
          {twoPlayer ? (
            <>
              <div className="metric">
                <div className="v">{scores[0]}</div>
                <div className="k">Player 1{out[0] ? " \u00b7 out" : ""}</div>
              </div>
              <div className="metric">
                <div className="v">{scores[1]}</div>
                <div className="k">Player 2{out[1] ? " \u00b7 out" : ""}</div>
              </div>
            </>
          ) : (
            <>
              <div className="metric">
                <div className="v">
                  {score}
                  <span className="muted" style={{ fontSize: 13 }}>
                    /{total}
                  </span>
                </div>
                <div className="k">Points</div>
              </div>
              <div className="metric">
                <div className="v">
                  {correct}
                  <span className="muted" style={{ fontSize: 13 }}>
                    /{config.size}
                  </span>
                </div>
                <div className="k">Found</div>
              </div>
              <div className="metric">
                <div className="v">{board.targetScore}</div>
                <div className="k">Needed</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="spread" style={{ marginBottom: 10 }}>
          <h3>Share your result</h3>
          <button className="btn sm" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="share">{shareText}</pre>
      </div>

      {missed.length > 0 && !twoPlayer && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Biggest names you missed</h3>
          <div className="slots">
            {missed.map((e) => (
              <div key={e.pid} className="slot filled" style={{ background: "transparent" }}>
                <span className="rk">{e.rank}</span>
                <span className="who">
                  <span className="nm">{e.name}</span>
                  <span className="sub">
                    {e.years}
                    {e.teams ? ` \u00b7 ${e.teams}` : ""}
                  </span>
                </span>
                <span className="right">
                  <span className="val">{formatVal(config.criteria.stat, e.val, ds.meta)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary" onClick={onExit}>
          Done
        </button>
        {onReplay && (
          <button className="btn" onClick={onReplay}>
            Play again
          </button>
        )}
      </div>
    </>
  );
}
