import type { HeroDesign, HeroLook, HeroSlot, ShipId } from '../shared/contracts';

/**
 * Modular hero ships (docs/31): each chassis (ship) is built from four part slots. A remodelled chassis
 * (HERO_REMODELLED; user, 29 October) has five designs per slot, clean remodels over the user's Tripo models with their
 * finish baked on, one file per design (public/assets/shared/hero/<ship>-<design>.glb, tools/blender/hero_remodel.py).
 * The others keep three designs in one kit per chassis (public/assets/shared/hero-<ship>-kit.glb, tools/blender/
 * hero_kit.py) until they are remodelled. Cosmetic only: the hit region, handling and gun origins never depend on the
 * parts. The single runtime source for slots, designs, prices and the default paint.
 */
export const HERO_SLOTS: readonly HeroSlot[] = ['hull', 'wings', 'engines', 'cockpit'];
export const HERO_DESIGNS: readonly HeroDesign[] = ['a', 'b', 'c', 'd', 'e'];
/** Chassis rebuilt from the user's Tripo models: five designs, one textured file per design. */
export const HERO_REMODELLED: ReadonlySet<ShipId> = new Set<ShipId>(['scrapper', 'ironclad', 'interceptor']);
/** The designs a chassis offers in each slot. */
export const heroDesigns = (ship: ShipId): readonly HeroDesign[] => HERO_REMODELLED.has(ship) ? HERO_DESIGNS : HERO_DESIGNS.slice(0, 3);
export const HERO_SLOT_NAMES: Readonly<Record<HeroSlot, string>> = { hull: 'Hull', wings: 'Wings', engines: 'Propulsion', cockpit: 'Cockpit' };
/**
 * Campaign credits per part design (user, 28 October: "for now buy with credits, it'll be changed later on"). Design A
 * comes with the chassis.
 */
export const HERO_DESIGN_PRICES: Readonly<Record<HeroDesign, number>> = { a: 0, b: 80, c: 160, d: 240, e: 320 };
/**
 * The models' own colours: what a look without paint shows. A remodelled chassis gives the median of its baked paint and
 * rust (tools/blender/hero_remodel.py prints them per design); a recolour finds them by colour.
 */
export const HERO_DEFAULT_PAINT: Readonly<Record<ShipId, { primary: number; secondary: number; glow: number }>> = {
  scrapper: { primary: 0x948b80, secondary: 0x704b38, glow: 0x78f9f1 },
  ironclad: { primary: 0x66665f, secondary: 0x9c6e38, glow: 0xff4a24 },
  interceptor: { primary: 0xbab5ac, secondary: 0x6f5337, glow: 0x5aa8ff },
  spectre: { primary: 0x17141e, secondary: 0xa9adb8, glow: 0xb46cff },
};
export const DEFAULT_LOOK: HeroLook = { parts: { hull: 'a', wings: 'a', engines: 'a', cockpit: 'a' } };

export const heroKitFile = (ship: ShipId) => `shared/hero-${ship}-kit.glb`;
/** A remodelled chassis's file for one design: its four part nodes and their textures. */
export const heroDesignFile = (ship: ShipId, design: HeroDesign) => `shared/hero/${ship}-${design}.glb`;
export const heroPartNode = (ship: ShipId, slot: HeroSlot, design: HeroDesign) => `hero_${ship}_${slot}_${design}`;
/** A part design's id in the campaign save. */
export const heroDesignId = (ship: ShipId, slot: HeroSlot, design: HeroDesign) => `${ship}:${slot}:${design}`;
/** A stable key for a ship's look (loaded models are cached by it). */
export const heroLookKey = (ship: ShipId, look: HeroLook) => {
  const paint = { ...HERO_DEFAULT_PAINT[ship], ...look.paint };
  return `${ship}:${HERO_SLOTS.map(slot => look.parts[slot]).join('')}:${paint.primary}:${paint.secondary}:${paint.glow}`;
};
/** A well-formed look, or null: every slot a known design (of `ship`, when given), paint (if any) whole sRGB colours. */
export function validLook(value: unknown, ship?: ShipId): HeroLook | null {
  const look = value as HeroLook | null, designs = ship ? heroDesigns(ship) : HERO_DESIGNS;
  if (!look || typeof look !== 'object' || !look.parts || !HERO_SLOTS.every(slot => designs.includes(look.parts[slot]))) return null;
  const colour = (c: unknown) => c === undefined || (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  if (look.paint !== undefined && (typeof look.paint !== 'object' || !colour(look.paint.primary) || !colour(look.paint.secondary) || !colour(look.paint.glow))) return null;
  const parts = Object.fromEntries(HERO_SLOTS.map(slot => [slot, look.parts[slot]])) as HeroLook['parts'];
  return look.paint ? { parts, paint: { ...look.paint } } : { parts };
}
