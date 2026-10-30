/**
 * The colour of each kind of drop: its pickup icon (src/render/pickup-icons.ts) and its word in a strike site's message
 * (src/ui/game-ui.ts), so `PARTS` reads in the part icon's orange and `SHIELD` in the shield icon's blue.
 */
export const PICKUP_TINTS = {
  shield: '#8ff0dc', power: '#ffe2a6', credit: '#ffd06a', part: '#ff9e6a', weapon: '#d4bcff',
} as const;
