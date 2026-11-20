import { defineConfig, type Plugin } from 'vite';

/** This project carries no Node type definitions (see tests/world/cinematic-assets.test.ts): Node modules load dynamically. */
const node = (name: string) => import(['node', name].join(':'));
const here = (path: string) => decodeURIComponent(new URL(path, import.meta.url).pathname);

/**
 * Development only: the light playground (playground.html) saves its settings to lookdev/playground-looks.json, where
 * the agent can read them, and loads them back on reload. The built site has no such endpoint (it keeps browser storage).
 */
function playgroundSettings(): Plugin {
  const file = here('./lookdev/playground-looks.json');
  return {
    name: 'playground-settings',
    configureServer(server) {
      server.middlewares.use('/__playground/looks', async (request, response) => {
        const fs = await node('fs'), incoming = request as unknown as { method?: string; on(event: string, listener: (chunk?: unknown) => void): void };
        if (incoming.method === 'POST') {
          let body = '';
          incoming.on('data', chunk => { body += String(chunk); });
          incoming.on('end', () => {
            try { JSON.parse(body); fs.mkdirSync(here('./lookdev'), { recursive: true }); fs.writeFileSync(file, body); response.statusCode = 204; }
            catch { response.statusCode = 400; }
            response.end();
          });
          return;
        }
        if (!fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
        response.setHeader('content-type', 'application/json'); response.end(fs.readFileSync(file));
      });
    },
  };
}

/**
 * Development only: the melody editor (melody.html) saves its edited lead lines to lookdev/melody-edits.json, where the
 * agent reads them to write them into the score, and loads them back on reload. The built page downloads the file instead.
 */
function melodyEdits(): Plugin {
  const file = here('./lookdev/melody-edits.json');
  return {
    name: 'melody-edits',
    configureServer(server) {
      server.middlewares.use('/__melody/edits', async (request, response) => {
        const fs = await node('fs'), incoming = request as unknown as { method?: string; on(event: string, listener: (chunk?: unknown) => void): void };
        if (incoming.method === 'POST') {
          let body = '';
          incoming.on('data', chunk => { body += String(chunk); });
          incoming.on('end', () => {
            try { JSON.parse(body); fs.mkdirSync(here('./lookdev'), { recursive: true }); fs.writeFileSync(file, body); response.statusCode = 204; }
            catch { response.statusCode = 400; }
            response.end();
          });
          return;
        }
        if (!fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
        response.setHeader('content-type', 'application/json'); response.end(fs.readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  // Relative assets work both at a domain root and a later GitHub Pages repo path.
  base: './',
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  plugins: [playgroundSettings(), melodyEdits()],
  // The game, the light playground (playground.html) and the melody editor (melody.html) are separate pages of one build.
  build: { rollupOptions: { input: { main: here('./index.html'), playground: here('./playground.html'), melody: here('./melody.html') } } },
});
