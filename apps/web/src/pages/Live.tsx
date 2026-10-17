import { useEffect, useState } from "react";
import { Play } from "../components/Play";
import { loadMeta } from "../lib/data";
import type { GameConfig, Meta } from "../lib/types";

interface Preset {
  stat: string;
  label: string;
  size: number;
}

const PRESETS: Preset[] = [
  { stat: "hr", label: "Home runs", size: 10 },
  { stat: "hits", label: "Hits", size: 10 },
  { stat: "rbi", label: "RBI", size: 10 },
  { stat: "sb", label: "Stolen bases", size: 10 },
  { stat: "k", label: "Strikeouts (pitching)", size: 10 },
  { stat: "wins", label: "Wins", size: 10 },
  { stat: "sv", label: "Saves", size: 10 },
  { stat: "ops", label: "OPS", size: 10 },
  { stat: "war", label: "WAR", size: 10 },
];

/**
 * Current-season minigames. The dataset is rebuilt from Baseball Reference by
 * the scheduled refresh job, so these boards always reflect the live season.
 */
export function Live({ year, onExit }: { year: number; onExit: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [active, setActive] = useState<Preset | null>(null);

  useEffect(() => {
    void loadMeta().then(setMeta).catch(() => undefined);
  }, []);

  if (active) {
    const config: GameConfig = {
      mode: "live",
      date: undefined,
      title: `${year} ${active.label}`,
      criteria: { stat: active.stat, yearMin: year, yearMax: year, pool: { tab: "all" } },
      size: active.size,
      maxStrikes: 3,
      seconds: null,
      players: 1,
    };
    return <Play config={config} onExit={() => setActive(null)} />;
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <span className="kicker">Live</span>
          <h1 style={{ marginBottom: 6 }}>{year} season boards</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Every board below is scoped to the {year} season only. The dataset refreshes on a schedule, so the names
            change as the season moves.
          </p>
        </div>
        <button className="btn ghost sm" onClick={onExit}>
          Back
        </button>
      </div>

      <div className="grid three">
        {PRESETS.filter((p) => !meta || meta.stats[p.stat]).map((p) => (
          <button key={p.stat} className="tile" style={{ textAlign: "left" }} onClick={() => setActive(p)}>
            <div className="t-head">
              <h3>{p.label}</h3>
            </div>
            <div className="t-body">
              {year} only · top {p.size}
            </div>
            <span className="btn primary block">Start</span>
          </button>
        ))}
      </div>

      {meta && meta.lastYear < year && (
        <div className="flash warn">
          The dataset currently ends at {meta.lastYear}. Run <code>npm run data:refresh</code> to pull the latest season.
        </div>
      )}
    </div>
  );
}
