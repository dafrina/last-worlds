// Shared browser launch for the look-dev and perf tools (docs/38 X2): headless Chromium with SwiftShader WebGL, the only
// GPU path in WSL and CI. Usage: `import { launchGameBrowser } from './browser.mjs'; const browser = await launchGameBrowser();`
import { chromium } from '@playwright/test';

export const SWIFTSHADER_ARGS = Object.freeze(['--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

/** Launches Chromium for the game's WebGL2 renderer; extra `args` are appended. */
export function launchGameBrowser({ args = [] } = {}) {
  return chromium.launch({ args: [...SWIFTSHADER_ARGS, ...args] });
}
