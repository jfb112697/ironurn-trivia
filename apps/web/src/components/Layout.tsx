import { useEffect } from "react";
import type { ReactNode } from "react";
import { setActiveGame, useActiveGame, useGameplayActive } from "../lib/activeGame";
import type { ActiveGame } from "../lib/activeGame";
import { href, useRoute } from "../lib/router";

const LINKS: { to: string; label: string; match: (p: string) => boolean }[] = [
  { to: "/", label: "Play", match: (p) => p === "/" || p.startsWith("/play") },
  { to: "/free", label: "Free Play", match: (p) => p === "/free" },
  { to: "/archive", label: "Archive", match: (p) => p === "/archive" },
  { to: "/stats", label: "My Stats", match: (p) => p === "/stats" },
  { to: "/how", label: "How to Play", match: (p) => p === "/how" },
];

export function Urn({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M20 14h24l-3 8c4 5 6 11 6 18 0 6-4 10-15 10s-15-4-15-10c0-7 2-13 6-18z" fill="#63d2a4" />
      <path d="M20 14h24l-1.6 4.4H21.6z" fill="#0c1116" opacity=".35" />
      <circle cx="32" cy="40" r="3.4" fill="#0f1720" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const active = useActiveGame();
  const inGame = useGameplayActive();
  const showResume = Boolean(active) && !inGame;

  // Publish the sticky header's height so the board's column header can pin
  // right below it (the header wraps to two lines on narrow screens).
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".top");
    if (!header) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        "--header-h",
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Reserve room at the bottom of the document for the fixed bar.
  useEffect(() => {
    document.body.classList.toggle("has-resume", showResume);
    return () => document.body.classList.remove("has-resume");
  }, [showResume]);

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href={href("/")}>
            <Urn />
            <span>
              IronUrn
              <small>Baseball Trivia</small>
            </span>
          </a>
          <nav className="nav">
            {LINKS.map((l) => (
              <a key={l.to} href={href(l.to)} aria-current={l.match(path) ? "page" : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell">{children}</main>
      <footer className="shell foot">
        <span>
          Free and unlimited. No accounts, no paywalls — data from the Lahman/Chadwick Baseball Databank and
          Baseball Reference via pybaseball.
        </span>
        <span>Built on Cloudflare's free tier.</span>
      </footer>
      {showResume && active && <ResumeBar game={active} />}
    </>
  );
}

/** Floating "pick up where you left off" bar. */
function ResumeBar({ game }: { game: ActiveGame }) {
  const found = Object.keys(game.solved).length;
  const label =
    game.config.mode === "daily"
      ? "Daily in progress"
      : game.config.mode === "mini"
        ? "Mini in progress"
        : game.config.mode === "live"
          ? "Live game in progress"
          : "Free Play in progress";

  return (
    <div className="resume" role="region" aria-label="Game in progress">
      <div className="resume-txt">
        <span className="resume-k">
          {label} · {found}/{game.config.size} found
        </span>
        <span className="resume-t">{game.label || game.config.title}</span>
      </div>
      <a className="btn primary sm" href={href("/resume")}>
        Continue
      </a>
      <button
        className="resume-x"
        title="Discard this game"
        aria-label="Discard this game"
        onClick={() => setActiveGame(null)}
      >
        ×
      </button>
    </div>
  );
}
