import { SPECIALS } from '../content/equipment';
import { VIEW, type RunState } from '../shared/contracts';

/**
 * The Orbital Strike's front (docs/42): its x `elapsed` seconds in, from just beyond one edge of the view it was called on
 * to just beyond the other. The simulation kills by it (src/sim/game.ts updateOrbital); the renderer lays its barrage
 * along it (src/render/fx-particles.ts).
 */
export function orbitalFront(orbital: NonNullable<RunState['orbital']>, elapsed: number): number {
  const reach = VIEW.width / 2 + 1, share = Math.min(1, Math.max(0, elapsed / SPECIALS['orbital-strike'].sweep));
  return orbital.cameraX - orbital.direction * reach + orbital.direction * 2 * reach * share;
}
