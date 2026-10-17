import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = resolve(here, "../../data/out");

/**
 * Serves `data/out/*` at the same `/api/*` paths the edge worker uses, so the
 * app can be developed end-to-end with no Cloudflare account:
 *
 *   /api/manifest            -> data/out/manifest.json
 *   /api/templates           -> data/out/templates.json
 *   /api/dataset/<file>.json -> data/out/<file>.json
 */
function datasetMiddleware() {
  return {
    name: "ironurn-dataset",
    configureServer(server: {
      middlewares: {
        use: (fn: (req: any, res: any, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const path = String(req.url || "").split("?")[0];
        let file: string | null = null;

        if (path === "/api/manifest") file = "manifest.json";
        else if (path === "/api/templates") file = "templates.json";
        else if (path.startsWith("/api/dataset/")) file = path.slice("/api/dataset/".length);

        if (!file) return next();
        if (!/^[a-z0-9_.-]+\.json$/i.test(file)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "bad_file" }));
          return;
        }

        try {
          const body = await readFile(join(DATASET_DIR, file));
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: "dataset_missing",
              file,
              hint: "Run `npm run data:all` from the repository root to build data/out.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), datasetMiddleware()],
  server: { port: 5173, host: true },
  preview: { port: 4173 },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
