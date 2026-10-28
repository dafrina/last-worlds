import type { HeroDesign, HeroLook, HeroSlot, ShipId } from '../shared/contracts';

/**
 * Modular hero ships (docs/31): each chassis (ship) is built from four part slots with three designs each, from one kit
 * per chassis (public/assets/shared/hero-<ship>-kit.glb, tools/blender/hero_kit.py). Cosmetic only: the hit region,
 * handling and gun origins never depend on the parts. The single runtime source for slots, designs, prices and the
 * default paint.
 */
export const HERO_SLOTS: readonly HeroSlot[] = ['hull', 'wings', 'engines', 'cockpit'];
export const HERO_DESIGNS: readonly HeroDesign[] = ['a', 'b', 'c'];
export const HERO_SLOT_NAMES: Readonly<Record<HeroSlot, string>> = { hull: 'Hull', wings: 'Wings', engines: 'Propulsion', cockpit: 'Cockpit' };
/**
 * Campaign credits per part design (user, 28 October: "for now buy with credits, it'll be changed later on"). Design A
 * comes with the chassis.
 */
export const HERO_DESIGN_PRICES: Readonly<Record<HeroDesign, number>> = { a: 0, b: 80, c: 160 };
/** The kit's own colours: what a look without paint shows. */
export const HERO_DEFAULT_PAINT: Readonly<Record<ShipId, { primary: number; secondary: number; glow: number }>> = {
  scrapper: { primary: 0xc8c9bd, secondary: 0x78442f, glow: 0x78f9f1 },
  ironclad: { primary: 0x3d4528, secondary: 0xb58a1c, glow: 0xff4a24 },
  interceptor: { primary: 0xd9dde2, secondary: 0x1f4f9a, glow: 0x5aa8ff },
  spectre: { primary: 0x17141e, secondary: 0xa9adb8, glow: 0xb46cff },
};
export const DEFAULT_LOOK: HeroLook = { parts: { hull: 'a', wings: 'a', engines: 'a', cockpit: 'a' } };

export const heroKitFile = (ship: ShipId) => `shared/hero-${ship}-kit.glb`;
export const heroPartNode = (ship: ShipId, slot: HeroSlot, design: HeroDesign) => `hero_${ship}_${slot}_${design}`;
/** A part design's id in the campaign save. */
export const heroDesignId = (ship: ShipId, slot: HeroSlot, design: HeroDesign) => `${ship}:${slot}:${design}`;
/** A stable key for a ship's look (loaded models are cached by it). */
export const heroLookKey = (ship: ShipId, look: HeroLook) => {
  const paint = { ...HERO_DEFAULT_PAINT[ship], ...look.paint };
  return `${ship}:${HERO_SLOTS.map(slot => look.parts[slot]).join('')}:${paint.primary}:${paint.secondary}:${paint.glow}`;
};
/** A well-formed look, or null: every slot a known design, paint (if any) whole sRGB colours. */
export function validLook(value: unknown): HeroLook | null {
  const look = value as HeroLook | null;
  if (!look || typeof look !== 'object' || !look.parts || !HERO_SLOTS.every(slot => HERO_DESIGNS.includes(look.parts[slot]))) return null;
  const colour = (c: unknown) => c === undefined || (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  if (look.paint !== undefined && (typeof look.paint !== 'object' || !colour(look.paint.primary) || !colour(look.paint.secondary) || !colour(look.paint.glow))) return null;
  const parts = Object.fromEntries(HERO_SLOTS.map(slot => [slot, look.parts[slot]])) as HeroLook['parts'];
  return look.paint ? { parts, paint: { ...look.paint } } : { parts };
}
