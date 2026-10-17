import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { Play } from "./components/Play";
import { Home } from "./pages/Home";
import { Live } from "./pages/Live";
import { FreePlaySetup } from "./pages/FreePlaySetup";
import { Stats } from "./pages/Stats";
import { HowToPlay } from "./pages/HowToPlay";
import { Archive } from "./pages/Archive";
import { loadTemplates } from "./lib/data";
import { getActiveGame } from "./lib/activeGame";
import { dateKey, puzzleFor } from "./lib/schedule";
import { navigate, useRoute } from "./lib/router";
import { dailyResult } from "./lib/storage";
import type { GameConfig, Puzzle, Templates } from "./lib/types";

export default function App() {
  const { path, segments } = useRoute();
  const [tpl, setTpl] = useState<Templates | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadTemplates()
      .then((t) => alive && setTpl(t))
      .catch((e: unknown) => alive && setTplError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  const goHome = () => navigate("/");

  let page: React.ReactNode;

  if (segments.length === 0) {
    page = <Home />;
  } else if (segments[0] === "free") {
    page = <FreePlaySetup onExit={goHome} />;
  } else if (segments[0] === "stats") {
    page = <Stats />;
  } else if (segments[0] === "how") {
    page = <HowToPlay />;
  } else if (segments[0] === "archive") {
    page = <Archive />;
  } else if (segments[0] === "live") {
    const year = Number(segments[1]) || new Date().getFullYear();
    page = <Live year={year} onExit={goHome} />;
  } else if (segments[0] === "play" && (segments[1] === "daily" || segments[1] === "mini")) {
    const mode = segments[1];
    const date = segments[2] ?? dateKey();
    if (tplError) {
      page = <div className="error">Couldn't load the puzzle schedule ({tplError}).</div>;
    } else if (!tpl) {
      page = (
        <div className="loading">
          <span className="spinner" />
          <span>Loading the board…</span>
        </div>
      );
    } else {
      const puzzle = puzzleFor(tpl, date, mode);
      page = <DailyGate key={`${mode}:${date}`} puzzle={puzzle} onExit={goHome} />;
    }
  } else if (segments[0] === "resume") {
    const game = getActiveGame();
    page = game ? (
      <Play key="resume" config={game.config} onExit={goHome} />
    ) : (
      <div className="card">
        <h2>No game in progress</h2>
        <p className="small">
          Start a Daily, Mini, Free Play or Live board and it will be waiting here until you finish it.
        </p>
        <button className="btn" onClick={goHome}>
          Back to the games
        </button>
      </div>
    );
  } else {
    page = (
      <div className="card">
        <h2>Not found</h2>
        <p>That page doesn't exist.</p>
        <button className="btn" onClick={goHome}>
          Back to the games
        </button>
      </div>
    );
  }

  return <Layout>{page}</Layout>;
}

function toConfig(puzzle: Puzzle, practice: boolean): GameConfig {
  return {
    mode: puzzle.mode,
    date: puzzle.date,
    title: puzzle.title,
    criteria: puzzle.criteria,
    size: puzzle.size,
    maxStrikes: 3,
    seconds: null,
    players: 1,
    practice,
  };
}

/** Locks a Daily/Mini once it's been played, with an explicit practice escape hatch. */
function DailyGate({ puzzle, onExit }: { puzzle: Puzzle; onExit: () => void }) {
  const [practice, setPractice] = useState(false);
  const done = dailyResult(puzzle.date, puzzle.mode);

  if (done && !practice) {
    return (
      <div className="card result-hero">
        <div className="tiny">
          {puzzle.mode === "daily" ? "Pinpoint Daily" : "Pinpoint Mini"} · {puzzle.date}
        </div>
        <h2>Already played</h2>
        <p className="small">{puzzle.title}</p>
        <div className="stat-strip" style={{ maxWidth: 480, margin: "12px auto 18px" }}>
          <div className="metric">
            <div className="v">
              {done.score.toLocaleString()}
              <span className="muted" style={{ fontSize: 13 }}>
                /{done.totalPoints}
              </span>
            </div>
            <div className="k">Points</div>
          </div>
          <div className="metric">
            <div className="v">
              {done.correct}
              <span className="muted" style={{ fontSize: 13 }}>
                /{done.size}
              </span>
            </div>
            <div className="k">Found</div>
          </div>
          <div className="metric">
            <div className="v" style={{ color: done.won ? "var(--accent)" : "var(--muted)" }}>
              {done.won ? "Yes" : "No"}
            </div>
            <div className="k">Qualified</div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={onExit}>
            Back
          </button>
          <button className="btn primary" onClick={() => setPractice(true)}>
            Replay as practice
          </button>
        </div>
      </div>
    );
  }

  return <Play config={toConfig(puzzle, practice)} onExit={onExit} />;
}
