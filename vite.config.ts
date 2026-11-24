/// <reference types="vitest" />
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
// The base path matches the GitHub Pages project URL:
// https://tbmaynard.github.io/eml-520-cohort-scorecard-aggregator/
const base = '/eml-520-cohort-scorecard-aggregator/';

/**
 * Season files live in the top-level data/ folder so they are easy to upload
 * through the GitHub website. This serves them in dev and copies them into the
 * build. Only .json files are copied: a stray CSV can never be published.
 */
function seasonData(): Plugin {
  const dataDir = join(root, 'data');
  return {
    name: 'season-data',
    configureServer(server) {
      server.middlewares.use(`${base}data/`, (req, res) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(dataDir, name);
        if (file.startsWith(dataDir) && extname(file) === '.json' && existsSync(file) && statSync(file).isFile()) {
          res.setHeader('Content-Type', 'application/json');
          createReadStream(file).pipe(res);
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
    },
    closeBundle() {
      if (!existsSync(dataDir)) return;
      cpSync(dataDir, join(root, 'dist', 'data'), {
        recursive: true,
        filter: (src) => statSync(src).isDirectory() || extname(src) === '.json',
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [seasonData()],
  build: {
    rollupOptions: {
      input: { index: join(root, 'index.html'), build: join(root, 'build.html') },
    },
  },
  // Fixed ports, away from 5173/8000 (other local projects) and 5280/4280 (financial model).
  server: { port: 5281, strictPort: true },
  preview: { port: 4281, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
