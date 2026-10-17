/**
 * The single in-progress game.
 *
 * There are no accounts, so an unfinished board lives in localStorage. A small
 * floating bar in the layout ("Continue") jumps straight back into it — that
 * includes Free Play and Live boards, whose configs never appear in the URL.
 *
 * Starting another game replaces the record (which is what makes a new game
 * override the Continue button) and finishing one clears it.
 */
import { useSyncExternalStore } from "react";
import type { GameConfig } from "./types";

export interface VerdictItem {
  id: number;
  text: string;
  kind: "correct" | "wrong" | "ambiguous" | "duplicate";
  note?: string;
}

export interface ActiveGame {
  config: GameConfig;
  /** Human-readable board description (Free Play/Live have a generic title). */
  label?: string;
  solved: Record<number, number>;
  strikes: number[];
  out: boolean[];
  turn: number;
  feed: VerdictItem[];
  secondsLeft: number | null;
  updatedAt: number;
}

const KEY = "ironurn.active.v1";

let snapshot: ActiveGame | null = null;
let loaded = false;
let playing = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function read(): ActiveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ActiveGame) : null;
    return parsed && parsed.config ? parsed : null;
  } catch {
    return null;
  }
}

export function getActiveGame(): ActiveGame | null {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }
  return snapshot;
}

export function setActiveGame(game: ActiveGame | null): void {
  snapshot = game;
  loaded = true;
  try {
    if (game) localStorage.setItem(KEY, JSON.stringify(game));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — the bar just won't survive a reload */
  }
  notify();
}

export function subscribeActiveGame(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Stable identity for "is this the same game?". */
export function gameIdentity(config: GameConfig): string {
  return JSON.stringify([
    config.mode,
    config.date ?? "",
    config.criteria,
    config.size,
    config.maxStrikes,
    config.seconds,
    config.players,
    config.practice,
  ]);
}

/**
 * Called by the play screen while it is mounted. The Continue bar hides itself
 * whenever a board is on screen (Free Play and Live render their games on the
 * same route, so a route check would not be enough).
 */
export function enterGameplay(): () => void {
  playing += 1;
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    playing -= 1;
    notify();
  };
}

export function useActiveGame(): ActiveGame | null {
  return useSyncExternalStore(subscribeActiveGame, getActiveGame, () => null);
}

export function useGameplayActive(): boolean {
  return useSyncExternalStore(
    subscribeActiveGame,
    () => playing > 0,
    () => false,
  );
}
