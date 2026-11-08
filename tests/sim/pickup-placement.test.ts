import { expect, it } from 'vitest';
import { BALANCE } from '../../src/content/balance';
import { SHIPS } from '../../src/content/equipment';
import type { Pickup } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { placePickup } from '../../src/sim/pickup-placement';

it.each(['endless', 'campaign'] as const)('%s drops near the edge respect the mode spacing policy', mode => {
  const state = createRun({ mode, seed: 1 });
  const kinds: Pickup['kind'][] = ['credit', 'power', 'weapon', 'shield', 'credit', 'shield', 'power'];
  state.cameraX = 6;
  for (const kind of kinds) {
    placePickup(state, { id: state.nextId++, x: 11, s: 10, ttl: 12, value: 1, kind });
  }
  const minimum = 2 * BALANCE.pickup.magnetRadius * SHIPS.scrapper.pickupReach;
  for (const [i, drop] of state.pickups.entries()) {
    if (mode === 'campaign') { expect([drop.x, drop.s]).toEqual([11, 10]); continue; }
    expect(drop.x).toBeGreaterThanOrEqual(0);
    expect(drop.x).toBeLessThanOrEqual(12);
    for (const other of state.pickups.slice(0, i)) {
      if (drop.kind !== 'credit' || other.kind !== 'credit') expect(Math.hypot(drop.x - other.x, drop.s - other.s)).toBeGreaterThan(minimum);
    }
  }
});
