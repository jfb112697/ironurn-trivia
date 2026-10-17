import { useEffect, useState } from "react";
import { loadTemplates } from "../lib/data";
import { dateKey, prettyDate, puzzleFor, shiftKey } from "../lib/schedule";
import { dailyResult } from "../lib/storage";
import { href } from "../lib/router";
import type { Templates } from "../lib/types";

const DAYS = 60;

export function Archive() {
  const [tpl, setTpl] = useState<Templates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadTemplates()
      .then((t) => alive && setTpl(t))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const today = dateKey();
  const days = Array.from({ length: DAYS }, (_, i) => shiftKey(today, -i));

  return (
    <div className="stack">
      <div>
        <span className="kicker">Archive</span>
        <h1 style={{ marginBottom: 6 }}>Past puzzles</h1>
        <p className="lede">
          Every puzzle is derived from its date alone, so the whole archive is available instantly — no waiting for a
          reset. Pick any day and play it as a practice board.
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card tight">
        <table className="stats">
          <thead>
            <tr>
              <th>Date</th>
              <th>Daily</th>
              <th className="n">Daily result</th>
              <th>Mini</th>
              <th className="n">Mini result</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const daily = tpl ? puzzleFor(tpl, d, "daily") : null;
              const mini = tpl ? puzzleFor(tpl, d, "mini") : null;
              const dr = dailyResult(d, "daily");
              const mr = dailyResult(d, "mini");
              return (
                <tr key={d}>
                  <td style={{ whiteSpace: "nowrap" }}>{prettyDate(d)}</td>
                  <td>
                    <a href={href(`/play/daily/${d}`)} style={{ color: "var(--accent)" }}>
                      {daily ? daily.title : "—"}
                    </a>
                  </td>
                  <td className="n muted">{dr ? `${dr.score.toLocaleString()} pts` : "—"}</td>
                  <td>
                    <a href={href(`/play/mini/${d}`)} style={{ color: "var(--accent)" }}>
                      {mini ? mini.title : "—"}
                    </a>
                  </td>
                  <td className="n muted">{mr ? `${mr.score.toLocaleString()} pts` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
