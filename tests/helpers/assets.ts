import { afterAll, vi } from 'vitest';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

// This browser project deliberately carries no Node ambient types.
const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));

/**
 * Lets GLTFLoader parse in Node for the calling test file, until its suite ends. These checks exercise geometry and rigs;
 * actual PNG decoding and materials are exercised in Chromium by graphics.spec.ts, not by this tiny ImageBitmap substitute.
 */
export function stubGltfDecoding(): void {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 512, close() {} }));
  afterAll(() => vi.unstubAllGlobals());
}

/** A GLB's scene, read from the deployed `public/assets`. */
export async function asset(path: string) {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject))).scene;
}
