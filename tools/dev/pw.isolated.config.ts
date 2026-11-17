// The browser suite against its own throwaway dev server (tools/dev/vite.isolated.config.ts: a private Vite cache).
// PORT picks the port (default 4197); never one another server already uses. Run from the project root:
//   PORT=4197 npx playwright test --config tools/dev/pw.isolated.config.ts
import base from '../../playwright.config';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT ?? 4197), url = `http://127.0.0.1:${port}`;
export default defineConfig({ ...base, testDir: '../../tests/browser', outputDir: '../../test-results', use: { ...base.use, baseURL: url },
  webServer: { command: `npx vite --config tools/dev/vite.isolated.config.ts --host 127.0.0.1 --port ${port} --strictPort`, cwd: '../..', url,
    reuseExistingServer: false, timeout: 120_000 } });
