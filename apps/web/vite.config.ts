import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = resolve(here, "../../data/out");

/**
 * Serves the prebuilt dataset (`data/out/*.json`) at the same `/data/*` paths
 * the deployed app uses, so the client can be developed end-to-end with no
 * Cloudflare account and no deploy:
 *
 *   /data/manifest.json  -> data/out/manifest.json
 *   /data/templates.json -> data/out/templates.json
 *   /data/batting.json   -> data/out/batting.json
 *
 * In production these files are baked into the build output by
 * `scripts/bake-data.mjs` and served as static assets.
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
        const match = /^\/data\/([a-z0-9_.-]+\.json)$/i.exec(path);
        const file = match ? match[1] : null;

        if (!file) return next();

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
