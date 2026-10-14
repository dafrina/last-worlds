import { defineConfig } from 'vitest/config';
// World-generation tests stream long flights (thousands of frames of terrain); CI runners are ~2× slower
// than local machines, so the 5 s default timeout is too tight for them.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 } });
