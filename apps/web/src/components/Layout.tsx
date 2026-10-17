import type { ReactNode } from "react";
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
    </>
  );
}
