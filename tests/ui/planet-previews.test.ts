import { describe, expect, it } from 'vitest';
import { bakePlanetTexture } from '../../src/ui/planet-preview';
import manifest from '../../public/assets/previews/manifest.json';

// (Node's crypto, without Node's types in this project.)
const crypto: { createHash(kind: string): { update(data: ArrayBufferView): { digest(encoding: string): string } } } = await import(['node', 'crypto'].join(':'));

describe('mission selector globes (src/ui/planet-preview.ts)', () => {
  // The globes ship pre-baked (public/assets/previews, user, 19 November: "cant we cache the textures so it loads once for
  // all"). Each image's source must still be what the terrain bakes: after a planet's terrain or palette changes, rerun
  // `node tools/dev/bake-planet-previews.mjs`.
  for (const [planet, hash] of Object.entries(manifest)) it(`ships ${planet}'s globe as its terrain bakes it`, () => {
    const texture = bakePlanetTexture(planet as Parameters<typeof bakePlanetTexture>[0]);
    expect(crypto.createHash('sha256').update(texture).digest('hex').slice(0, 16), 'rerun node tools/dev/bake-planet-previews.mjs').toBe(hash);
  }, 30_000);
});
