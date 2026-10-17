import { useEffect, useMemo, useState } from "react";
import { Play } from "../components/Play";
import { loadDataset, loadManifest, loadMeta } from "../lib/data";
import type { GameConfig, Manifest, Meta, Pool } from "../lib/types";

const SIZES = [10, 25, 50, 100];
const STRIKE_OPTIONS = [
  { label: "3 strikes", value: 3 },
  { label: "5 strikes", value: 5 },
  { label: "10 strikes", value: 10 },
  { label: "No limit", value: 0 },
];
const TIMER_OPTIONS = [
  { label: "No timer", value: 0 },
  { label: "1:00", value: 60 },
  { label: "2:00", value: 120 },
  { label: "3:00", value: 180 },
];

/** Display order for the statistic picker. */
const ORDER = [
  "hits", "hr", "rbi", "runs", "sb", "avg", "obp", "slg", "ops",
  "wins", "k", "bb", "ip", "era", "whip", "g", "sv",
  "warh", "warp", "war",
];

const GROUP_LABEL: Record<string, string> = {
  hitting: "Batting",
  pitching: "Pitching",
  all: "WAR (combined)",
};

export function FreePlaySetup({ onExit }: { onExit: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stat, setStat] = useState("hr");
  const [yearMin, setYearMin] = useState(1990);
  const [yearMax, setYearMax] = useState(2026);
  const [tab, setTab] = useState<Pool["tab"]>("all");
  const [league, setLeague] = useState("AL");
  const [teams, setTeams] = useState<number[]>([]);
  const [size, setSize] = useState(25);
  const [strikes, setStrikes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [playerCount, setPlayerCount] = useState<1 | 2>(1);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadMeta(), loadManifest()])
      .then(([m, man]) => {
        if (!alive) return;
        setMeta(m);
        setManifest(man);
        setYearMin(Math.max(m.firstYear, 1990));
        setYearMax(m.lastYear);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!meta) return [];
    const ordered = ORDER.filter((k) => k in meta.stats);
    const rest = Object.keys(meta.stats).filter((k) => !ordered.includes(k));
    return [...ordered, ...rest];
  }, [meta]);

  const years = manifest?.years ?? [];
  const pool: Pool =
    tab === "all" ? { tab: "all" } : tab === "league" ? { tab: "league", league } : { tab: "team", teams };

  if (running) {
    const config: GameConfig = {
      mode: "free",
      title: "Free Play",
      criteria: { stat, yearMin, yearMax, pool },
      size,
      maxStrikes: strikes,
      seconds: seconds || null,
      players: playerCount,
    };
    return <Play config={config} onExit={() => setRunning(false)} />;
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <span className="kicker">Free Play</span>
          <h1 style={{ marginBottom: 6 }}>Build your own board</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Any statistic, any era, any pool — and same-screen two-player if you want a duel. Scores are kept as
            personal bests in this browser.
          </p>
        </div>
        <button className="btn ghost sm" onClick={onExit}>
          Back
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="grid two" style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="fp-stat">Statistic</label>
            <select id="fp-stat" value={stat} onChange={(e) => setStat(e.target.value)} disabled={!meta}>
              {["hitting", "pitching", "all"].map((group) => {
                const inGroup = stats.filter((k) => meta?.stats[k]?.group === group);
                if (!inGroup.length) return null;
                return (
                  <optgroup key={group} label={GROUP_LABEL[group]}>
                    {inGroup.map((k) => (
                      <option key={k} value={k}>
                        {meta?.stats[k]?.label ?? k}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="field">
            <label>Season range</label>
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <select aria-label="From season" value={yearMin} onChange={(e) => setYearMin(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span className="muted">–</span>
              <select aria-label="Through season" value={yearMax} onChange={(e) => setYearMax(Number(e.target.value))}>
                {years
                  .filter((y) => y >= yearMin)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Pool</label>
          <div className="tabs">
            {(["all", "league", "team"] as Pool["tab"][]).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === "all" ? "All MLB" : t === "league" ? "One league" : "Franchises"}
              </button>
            ))}
          </div>
        </div>

        {tab === "league" && (
          <div className="chips" style={{ marginBottom: 16 }}>
            {["AL", "NL"].map((l) => (
              <button key={l} className="chip" aria-pressed={league === l} onClick={() => setLeague(l)}>
                {l === "AL" ? "American League" : "National League"}
              </button>
            ))}
          </div>
        )}

        {tab === "team" && <TeamPicker yearMin={yearMin} yearMax={yearMax} selected={teams} onChange={setTeams} />}

        <div className="grid two" style={{ margin: "16px 0" }}>
          <div className="field">
            <label>Board depth</label>
            <div className="chips">
              {SIZES.map((s) => (
                <button key={s} className="chip" aria-pressed={size === s} onClick={() => setSize(s)}>
                  Top {s}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Strikes</label>
            <div className="chips">
              {STRIKE_OPTIONS.map((o) => (
                <button key={o.value} className="chip" aria-pressed={strikes === o.value} onClick={() => setStrikes(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid two" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Timer</label>
            <div className="chips">
              {TIMER_OPTIONS.map((o) => (
                <button key={o.value} className="chip" aria-pressed={seconds === o.value} onClick={() => setSeconds(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Players</label>
            <div className="chips">
              <button className="chip" aria-pressed={playerCount === 1} onClick={() => setPlayerCount(1)}>
                Solo
              </button>
              <button className="chip" aria-pressed={playerCount === 2} onClick={() => setPlayerCount(2)}>
                Two-player
              </button>
            </div>
          </div>
        </div>

        <button className="btn primary block" onClick={() => setRunning(true)} disabled={!meta}>
          Start game
        </button>
        {tab === "team" && teams.length === 0 && (
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Pick at least one franchise, or the board will fall back to all of MLB.
          </p>
        )}
      </div>
    </div>
  );
}

/** Franchise multi-select, limited to clubs active inside the chosen range. */
function TeamPicker({
  yearMin,
  yearMax,
  selected,
  onChange,
}: {
  yearMin: number;
  yearMax: number;
  selected: number[];
  onChange: (v: number[]) => void;
}) {
  const [teams, setTeams] = useState<{ idx: number; abbr: string; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    loadDataset("hits")
      .then((ds) => {
        if (!alive) return;
        setTeams(
          ds.teams.franchises
            .map((f, idx) => ({ idx, abbr: f.abbr, name: f.name, first: f.first, last: f.last }))
            .filter((f) => f.last >= yearMin && f.first <= yearMax)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ idx, abbr, name }) => ({ idx, abbr, name })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [yearMin, yearMax]);

  return (
    <div
      style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}
    >
      {teams.length === 0 ? (
        <span className="small muted">Loading franchises…</span>
      ) : (
        <div className="chips">
          {teams.map((t) => (
            <button
              key={t.idx}
              className="chip team"
              aria-pressed={selected.includes(t.idx)}
              title={t.name}
              onClick={() => onChange(selected.includes(t.idx) ? selected.filter((i) => i !== t.idx) : [...selected, t.idx])}
            >
              {t.abbr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
