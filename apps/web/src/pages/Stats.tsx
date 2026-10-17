import { useMemo, useState } from "react";
import { clearAll, careerTotals, listBests, recentDaily } from "../lib/storage";
import { prettyDate } from "../lib/schedule";

export function Stats() {
  const [nonce, setNonce] = useState(0);
  const bests = useMemo(() => listBests(), [nonce]);
  const totals = useMemo(() => careerTotals(), [nonce]);
  const dailies = useMemo(() => recentDaily("daily", 20), [nonce]);
  const minis = useMemo(() => recentDaily("mini", 20), [nonce]);

  const clear = () => {
    if (!window.confirm("Delete all personal bests and history stored in this browser?")) return;
    clearAll();
    setNonce((n) => n + 1);
  };

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <span className="kicker">My stats</span>
          <h1 style={{ marginBottom: 6 }}>Personal bests</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Everything here lives in this browser only — no account, no server, nothing to sign up for.
          </p>
        </div>
        <button className="btn ghost sm" onClick={clear}>
          Clear data
        </button>
      </div>

      <div className="grid three">
        <div className="card tight">
          <div className="metric" style={{ border: 0, padding: 0 }}>
            <div className="v">{totals.played}</div>
            <div className="k">Games played</div>
          </div>
        </div>
        <div className="card tight">
          <div className="metric" style={{ border: 0, padding: 0 }}>
            <div className="v" style={{ color: "var(--accent)" }}>
              {totals.won}
            </div>
            <div className="k">Dailies qualified</div>
          </div>
        </div>
        <div className="card tight">
          <div className="metric" style={{ border: 0, padding: 0 }}>
            <div className="v">{totals.points.toLocaleString()}</div>
            <div className="k">Career points</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Records</h2>
        {bests.length === 0 ? (
          <div className="empty">No games yet. Play a Daily to set your first record.</div>
        ) : (
          <table className="stats">
            <thead>
              <tr>
                <th>Game</th>
                <th className="n">Found</th>
                <th className="n">Score</th>
                <th className="n">%</th>
              </tr>
            </thead>
            <tbody>
              {bests.map((b) => (
                <tr key={b.key}>
                  <td>{b.label}</td>
                  <td className="n">
                    {b.correct}/{b.size}
                  </td>
                  <td className="n">
                    {b.score.toLocaleString()}
                    <span className="muted">/{b.totalPoints}</span>
                  </td>
                  <td className="n" style={{ color: b.won ? "var(--accent)" : "var(--muted)" }}>
                    {Math.round((b.score / (b.totalPoints || 1)) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Recent Dailies</h2>
          {dailies.length === 0 ? (
            <div className="empty">Nothing yet.</div>
          ) : (
            <table className="stats">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="n">Found</th>
                  <th className="n">Score</th>
                </tr>
              </thead>
              <tbody>
                {dailies.map((d) => (
                  <tr key={d.date}>
                    <td>{prettyDate(d.date)}</td>
                    <td className="n">
                      {d.correct}/{d.size}
                    </td>
                    <td className="n" style={{ color: d.won ? "var(--accent)" : undefined }}>
                      {d.score.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Recent Minis</h2>
          {minis.length === 0 ? (
            <div className="empty">Nothing yet.</div>
          ) : (
            <table className="stats">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="n">Found</th>
                  <th className="n">Score</th>
                </tr>
              </thead>
              <tbody>
                {minis.map((d) => (
                  <tr key={d.date}>
                    <td>{prettyDate(d.date)}</td>
                    <td className="n">
                      {d.correct}/{d.size}
                    </td>
                    <td className="n" style={{ color: d.won ? "var(--accent)" : undefined }}>
                      {d.score.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
