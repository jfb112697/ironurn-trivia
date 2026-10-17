/**
 * Tiny hash router (~40 lines) instead of a routing dependency: the whole site
 * is a handful of screens, and hash routing means Cloudflare Pages needs no
 * redirect rules at all.
 */
import { useEffect, useState } from "react";

export interface Route {
  path: string;
  segments: string[];
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.split("?")[0];
  return { path, segments: path.split("/").filter(Boolean) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function navigate(to: string): void {
  const target = to.startsWith("#") ? to : `#${to}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function href(to: string): string {
  return `#${to.startsWith("/") ? to : `/${to}`}`;
}
