import { WORLD_HALF } from './terrain-layout';
import { KIT, type KitInstance, type KitKind, type ScatterField } from './scenery-kit';

/*
 * The scatter sink (docs/38 W1): where every world's scatter pass puts its pieces. Each world keeps its own placement
 * rules (which piece stands where, at what size and turn); the sink applies what all worlds share to every piece handed
 * to it:
 * - the piece belongs to the span being scattered (a section, or one world's part of a route section) by its s;
 * - its footprint stays inside the world;
 * - it never rises over the scenery cap: a stretchable piece is trimmed to it, a real-size one dropped, and a piece
 *   trimmed to a sliver is dropped too;
 * - its variant comes from its pick and its shade from the baked ground shade under it, unless the world gives them;
 * - essential pieces come first and cosmetic ones last (the low graphics tier stops at a node's first cosmetic piece).
 */

/** A piece as a world's rules place it: everything but the variant and the shade, which the sink fills in. */
export type ScatterPiece = Omit<KitInstance, 'shade' | 'variant'>;
type KitSpec = (typeof KIT)[KitKind];

export interface ScatterSinkOptions {
  /** The span being scattered: a piece outside [startS, startS + size) belongs to a neighbouring span. */
  startS: number; size: number;
  terrain: ScatterField;
  /** The scenery cap: the highest any piece may reach (its y plus its node's height). */
  cap: number;
  /** Kinds allowed up to a higher cap (spires, tusks, landmarks: up to just under the flight plane). */
  tall?: { readonly kinds: ReadonlySet<string>; readonly cap: number };
  /** A lower cap by position (Nahara: the ruins round THE CITADEL stay under its dome). */
  capAt?: (x: number, s: number) => number;
  /** Kinds kept at their modelled size: over the cap they are dropped, never trimmed (Khepri's fallen columns, boulders). */
  rigid?: ReadonlySet<string>;
  /** The share of a piece's footprint radius that must stay inside the world (1 by default; Nahara's ruins 0.6). */
  reach?: number;
  /** The world's own last word on a piece, before the cap (Khepri: only low pieces on an arena's ramp). */
  accept?: (piece: ScatterPiece, spec: KitSpec) => boolean;
}

export interface ScatterSink {
  /**
   * Places a piece, or drops it (false): outside the span or the world, refused by `accept`, or trimmed to nothing. `pick`
   * (0..1) chooses its variant; `shade` and `variant` replace the sink's own.
   */
  add(piece: ScatterPiece, pick: number, shade?: number, variant?: number): boolean;
  /**
   * Pieces placed by rules of their own (the cliff walls): kept as they are, with the essential pieces (a cosmetic one with
   * the cosmetic pieces: HELION STRONGHOLD's mountain walls off its ascent, src/world/terrain-vesper.ts).
   */
  keep(pieces: readonly KitInstance[]): void;
  /** Everything placed: the essential pieces, then the cosmetic ones, each in the order they came. */
  finish(): KitInstance[];
}

export function createScatterSink(options: ScatterSinkOptions): ScatterSink {
  const { startS, size, terrain, tall, capAt, rigid, reach = 1, accept } = options;
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [];
  return {
    add(piece, pick, shade, variant) {
      const spec = KIT[piece.kind];
      if (piece.s < startS || piece.s >= startS + size || Math.abs(piece.x) + spec.radius * piece.scale * reach > WORLD_HALF) return false;
      if (accept && !accept(piece, spec)) return false;
      let cap = tall && tall.kinds.has(piece.kind) ? tall.cap : options.cap;
      if (capAt) cap = Math.min(cap, capAt(piece.x, piece.s));
      if (piece.y + piece.height * spec.height > cap) {
        if (rigid?.has(piece.kind)) return false;
        piece = { ...piece, height: (cap - piece.y) / spec.height };
      }
      if (piece.height <= 0.05) return false;
      const placed: KitInstance = { ...piece, variant: variant ?? Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: shade ?? terrain.shade(piece.x, piece.s) };
      (placed.cosmetic ? cosmetic : essential).push(placed);
      return true;
    },
    keep(pieces) { for (const piece of pieces) (piece.cosmetic ? cosmetic : essential).push(piece); },
    finish: () => [...essential, ...cosmetic],
  };
}
