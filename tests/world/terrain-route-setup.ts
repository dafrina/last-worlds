import type { RunConfig } from '../../src/shared/contracts';
import { endlessSchedule, endlessSectorPlan } from '../../src/content/endless';
import { runRoute } from '../../src/render/terrain-route';

/* Shared setup of the terrain-route suites (split for parallel runs, docs/38 T1): terrain-route, -campaign and -stream. */
export const SEED = 93;
export const ENDLESS = { mode: 'endless', seed: SEED } as RunConfig;
export const route = runRoute(ENDLESS), schedule = endlessSchedule(ENDLESS);
/**
 * The first four planet switches: Luna → Khepri after WARDEN-1 (the prologue), Khepri → Vesper after Bastion-9,
 * Vesper → Nacre after the Ark, then Nacre → Khepri after THE VEIL.
 */
export const jumps = [1, 4, 7, 10].map(sector => endlessSectorPlan(sector)).map(plan => ({ plan, jump: plan.jump!, arena: plan.stop!.platform }));
