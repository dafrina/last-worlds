import type { PlanetId } from '../shared/contracts';

/** Acid-green hostile fire and its pale core over Amnion's warm ground. */
export const AMNION_SHOT = [0xb6ff25, 0xf7ffd9] as const;
/**
 * Hostile fire elsewhere: a warm coral with a pale core. Corona's is blood red (docs/37; user, 5 November: "warm red not
 * magenta"): salmon vanished into its gold. Nahara's too (docs/39), whose sandstone is as close to coral.
 */
export const HOSTILE_WARM = [0xff8869, 0xffe7c4] as const;
export const HOSTILE_BLOOD = [0xff1e1e, 0xfff2ee] as const;
/** A world's hostile shot colour and core: one source for the shots (scene.ts) and their muzzle flashes (fx-particles.ts). */
export const hostileHues = (planet: PlanetId) => planet === 'amnion' ? AMNION_SHOT : planet === 'corona' || planet === 'nahara' ? HOSTILE_BLOOD : HOSTILE_WARM;
/**
 * A hostile muzzle flash: the world's shot colour on Amnion and Corona (Corona's had stayed coral beside its red shots,
 * docs/38 V5), the long-standing lighter coral elsewhere.
 */
export const hostileFlashHex = (planet: PlanetId) => planet === 'amnion' || planet === 'corona' || planet === 'nahara' ? hostileHues(planet)[0] : 0xff9a78;
