/** Shapes of the datasets produced by `data/pipeline` and served by the edge API. */

export type StatKind = "count" | "rate" | "innings" | "war";
export type StatGroup = "hitting" | "pitching" | "all";

export interface StatDef {
  label: string;
  short: string;
  kind: StatKind;
  group: StatGroup;
  lowIsGood?: boolean;
}

export interface Meta {
  v: number;
  source: string;
  warSource: string;
  generated: string;
  firstYear: number;
  lastYear: number;
  playerCount: number;
  battingRecords: number;
  pitchingRecords: number;
  warRecords: number;
  franchiseCount: number;
  stats: Record<string, StatDef>;
}

export interface Players {
  v: number;
  ids: string[];
  names: string[];
  search: string[];
  debut: string[];
  last: string[];
}

export interface Franchise {
  id: string;
  name: string;
  abbr: string;
  first: number;
  last: number;
  teams: number[];
}

export interface Teams {
  v: number;
  ids: string[];
  abbr: string[];
  franchiseOf: number[];
  /** [teamIndex, year, league] triples. */
  leagues: [number, number, string][];
  franchises: Franchise[];
}

/** [pid, tid, year, PA, H, HR, RBI, R, SB, AVG, OBP, SLG, OPS] — rate stats x1000. */
export type BattingRow = [
  number, number, number, number, number, number, number,
  number, number, number, number, number, number,
];

/** [pid, tid, year, OUTS, W, K, BB, ER, H, G, GS, SV] */
export type PitchingRow = [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

/** [pid, tid, year, WAR_hitting x100, WAR_pitching x100] */
export type WarRow = [number, number, number, number, number];

export interface LivePack {
  v: number;
  year: number;
  generated: string;
  players: { ids: string[]; names: string[]; search: string[] };
  teams: { ids: string[]; abbr: string[] };
  batting: BattingRow[];
  pitching: PitchingRow[];
  war: WarRow[];
  counts: { players: number; batting: number; pitching: number; war: number };
}

export interface Manifest {
  v: number;
  generated: string;
  years: number[];
  modernFrom: number | null;
  allTime: {
    path: string;
    meta: string;
    players: string;
    teams: string;
    batting: string;
    pitching: string;
    war: string;
    playerCount: number;
    firstYear: number;
    lastYear: number;
  };
  live: { path: string; year: number; counts: Record<string, number>; generated: string } | null;
  stats: Record<string, StatDef>;
}

export interface Dataset {
  meta: Meta;
  teams: Teams;
  players: Players;
  batting?: BattingRow[];
  pitching?: PitchingRow[];
  war?: WarRow[];
  /** Present when the dataset is a self-contained single-season pack. */
  year?: number;
}

export interface Pool {
  tab: "all" | "league" | "team";
  league?: string;
  /** Franchise indices (see `Teams.franchises`). */
  teams?: number[];
}

export interface Criteria {
  stat: string;
  yearMin: number;
  yearMax: number;
  pool: Pool;
}

export interface Puzzle {
  date: string;
  mode: "daily" | "mini";
  size: number;
  title: string;
  criteria: Criteria;
}

export interface Templates {
  v: number;
  dailySize: number;
  miniSize: number;
  templates: { stat: string; yearMin: number; yearMax: number; pool: Pool; title: string }[];
}

export interface Entry {
  pid: number;
  rank: number;
  val: number;
  points: number;
  name: string;
  search: string;
  searchStripped: string;
  last: string;
  years: string;
  teams: string;
}

export interface Leaderboard {
  entries: Entry[];
  full: Entry[];
  /** Points available on this board (5050 for a Daily; a little more when ranks tie). */
  totalPoints: number;
  /** Score needed to "win": ceil(totalPoints / 3). */
  targetScore: number;
  poolSize: number;
}

export interface GameConfig {
  mode: "daily" | "mini" | "free" | "live";
  date?: string;
  title: string;
  criteria: Criteria;
  size: number;
  maxStrikes: number;
  seconds: number | null;
  players: 1 | 2;
  /** Replaying an already-finished Daily/Mini: keeps the record but not the daily lock. */
  practice?: boolean;
}
