/** Number/stat formatting shared by the board, input and results. */
import type { Criteria, Dataset, Meta } from "./types";

const RATE_3 = new Set(["avg", "obp", "slg", "ops"]);
const RATE_2 = new Set(["era", "whip"]);

/** Value as stored (rate stats x1000, innings as outs, WAR x100) -> display text. */
export function formatVal(stat: string, val: number, meta: Meta): string {
  const def = meta.stats[stat];
  const kind = def?.kind ?? "count";

  if (kind === "innings") {
    const outs = Math.max(0, Math.round(val));
    return `${Math.floor(outs / 3)}.${outs % 3}`;
  }
  if (kind === "war") return (val).toFixed(1);
  if (kind === "rate") {
    if (RATE_2.has(stat)) return (val / 1000).toFixed(2);
    if (RATE_3.has(stat)) {
      const s = (val / 1000).toFixed(3);
      return s.startsWith("0.") ? s.slice(1) : s;
    }
  }
  return String(Math.round(val));
}

export function describeCriteria(ds: Dataset, criteria: Criteria): string {
  const def = ds.meta.stats[criteria.stat];
  const label = def?.label ?? criteria.stat;
  const years = criteria.yearMin === criteria.yearMax ? String(criteria.yearMin) : `${criteria.yearMin}\u2013${criteria.yearMax}`;
  return `${label} \u00b7 ${years}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 90) return "just now";
  const mins = secs / 60;
  if (mins < 90) return `${Math.round(mins)} min ago`;
  const hours = mins / 60;
  if (hours < 36) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
