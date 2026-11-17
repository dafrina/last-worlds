// A throwaway dev server: the project's config with a private dependency cache (the git-ignored lookdev/.vite-isolated),
// so it never re-optimizes the shared node_modules/.vite that the user's preview server reads (it would answer
// "504 Outdated Optimize Dep" until restarted). Run from the project root:
//   npx vite --config tools/dev/vite.isolated.config.ts --host 127.0.0.1 --port 4197 --strictPort
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.ts';
export default mergeConfig(base, defineConfig({ cacheDir: 'lookdev/.vite-isolated', root: '.' }));
