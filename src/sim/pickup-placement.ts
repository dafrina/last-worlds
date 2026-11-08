import { flightTopEdge } from '../shared/lens';
import { BALANCE } from '../content/balance';
import { SHIPS } from '../content/equipment';
import { VIEW, type Pickup, type RunState } from '../shared/contracts';

// Leave enough space to fly through either catch zone independently, even with the Scrapper.
const separation = 2 * BALANCE.pickup.magnetRadius * SHIPS.scrapper.pickupReach + .15;
const equipment = (kind: Pickup['kind']) => kind === 'power' || kind === 'shield' || kind === 'weapon';

/** Keep the authored position when possible. Resolve crowded Endless drops horizontally first,
 * then further up the same flight path. Existing drops never jump to a new position. */
export function placePickup(state: RunState, pickup: Pickup, unsafeLane?: (x: number) => boolean): void {
  if (state.config.mode === 'endless') {
    const others = state.pickups.filter(p => p.ttl > 0 && (equipment(pickup.kind) || equipment(p.kind)));
    const free = (x: number, s: number) => others.every(other => Math.hypot(x - other.x, s - other.s) >= separation);
    if (!free(pickup.x, pickup.s)) {
      const origin = pickup.x;
      const left = Math.min(origin, state.cameraX - VIEW.width / 2 + .6);
      const right = Math.max(origin, state.cameraX + VIEW.width / 2 - .6);
      const lanes = [origin];
      for (let offset = separation; offset < right - left + separation; offset += separation) {
        for (const x of [Math.max(left, origin - offset), Math.min(right, origin + offset)]) {
          if (!lanes.includes(x) && !unsafeLane?.(x)) lanes.push(x);
        }
      }
      for (let row = 0; ; row++) {
        const s = pickup.s + row * separation;
        const x = lanes.find(lane => free(lane, s));
        if (x !== undefined) { pickup.x = x; pickup.s = s; break; }
      }
    }
  }
  state.pickups.push(pickup);
}

// Start a complete token (including its bob and glint) outside the release camera's top edge.
export const INCOMING_PICKUP_S = flightTopEdge() + 1;
