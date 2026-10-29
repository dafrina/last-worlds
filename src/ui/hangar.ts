import { missionText } from './missions';
import { MAX_RANK, RANK_PRICES, SHIPS, SHIELD_TECH, SPECIALS, WEAPON_BLURB, WEAPON_TIERS } from '../content/equipment';
import { WEAPONS } from '../content/balance';
import { SLOT_ITEMS, itemPrice, lookOf, ownsDesign, shipParts, type CampaignProfile, type ItemId, type Slot } from '../campaign/profile';
import type { HeroDesign, HeroLook, HeroSlot, ShipId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';
import { HERO_DEFAULT_PAINT, HERO_DESIGN_PARTS, HERO_DESIGN_PRICES, HERO_SLOTS, HERO_SLOT_NAMES, heroDesigns, heroLookKey } from '../content/hero-parts';

/** Player-facing name and one-line description of any equipment item. */
export function itemText(slot: Slot, id: ItemId): { name: string; blurb: string } {
  if (slot === 'weapon') return { name: WEAPONS[id as WeaponId].label, blurb: WEAPON_BLURB[id as WeaponId] };
  if (slot === 'special') return { name: SPECIALS[id as SpecialId].label, blurb: `${SPECIALS[id as SpecialId].blurb} Recharge ${SPECIALS[id as SpecialId].recharge} s.` };
  if (slot === 'shield') return { name: SHIELD_TECH[id as ShieldTechId].label, blurb: SHIELD_TECH[id as ShieldTechId].blurb };
  const ship = SHIPS[id as ShipId];
  return { name: ship.label, blurb: ship.blurb };
}

export interface HangarActions { buy(slot: Slot, id: ItemId): void; equip(slot: Slot, id: ItemId): void; upgrade(weapon: WeaponId): void; assemble(ship: ShipId): void }

/**
 * The hangar list for one slot: every item with its state. Equipped items glow; owned ones offer EQUIP; the rest
 * show their price (disabled while unaffordable). Owned main weapons also show rank pips and the next upgrade.
 */
export function renderHangar(list: HTMLElement, profile: CampaignProfile, slot: Slot, actions: HangarActions): void {
  const button = (label: string, kind: string, disabled: boolean, onClick: () => void) => {
    const element = document.createElement('button');
    element.type = 'button'; element.className = `hangar-action ${kind}`; element.textContent = label; element.disabled = disabled;
    element.addEventListener('click', onClick);
    return element;
  };
  list.replaceChildren(...(SLOT_ITEMS[slot] as readonly ItemId[]).map(id => {
    const item = document.createElement('li'), { name, blurb } = itemText(slot, id);
    const owned = (profile.owned[slot] as readonly ItemId[]).includes(id), equipped = profile.loadout[slot] === id, price = itemPrice(slot, id);
    item.className = `hangar-item${equipped ? ' is-equipped' : owned ? ' is-owned' : ''}`;
    const title = document.createElement('h3'); title.textContent = name;
    const text = document.createElement('p'); text.textContent = blurb;
    const row = document.createElement('div'); row.className = 'hangar-row';
    if (equipped) { const tag = document.createElement('span'); tag.className = 'hangar-tag'; tag.textContent = 'EQUIPPED'; row.append(tag); }
    else if (owned) row.append(button('EQUIP', 'equip', false, () => actions.equip(slot, id)));
    else if (slot === 'ship') {
      const parts = shipParts(profile, id as ShipId), ready = parts.every(part => part.collected);
      row.append(button(ready ? 'ASSEMBLE' : `${parts.filter(part => part.collected).length} / 3 PARTS`, 'assemble', !ready, () => actions.assemble(id as ShipId)));
    } else row.append(button(`BUY · ${price} CR`, 'buy', profile.credits < price || (slot === 'shield' && id === 'aegis' && !profile.owned.shield.includes('bulwark')), () => actions.buy(slot, id)));
    item.append(title, text, row);
    if (slot === 'shield' && id === 'aegis' && !profile.owned.shield.includes('bulwark')) {
      const note = document.createElement('p'); note.textContent = 'Requires Bulwark Array'; item.append(note);
    }
    if (slot === 'ship' && !owned) {
      const parts = document.createElement('ul'); parts.className = 'ship-parts';
      for (const part of shipParts(profile, id as ShipId)) {
        const entry = document.createElement('li'); entry.textContent = `${part.collected ? '✓' : '○'} ${part.name} · ${missionText(part.mission).name}`; parts.append(entry);
      }
      item.append(parts);
    }
    if (slot === 'weapon' && owned) {
      const weapon = id as WeaponId, rank = profile.ranks[weapon];
      const ranks = document.createElement('div'); ranks.className = 'hangar-rank';
      ranks.setAttribute('aria-label', `Tier ${rank + 1} of 3: ${WEAPON_TIERS[weapon][rank]}`);
      const label = document.createElement('span'); label.textContent = `TIER ${rank + 1} · ${WEAPON_TIERS[weapon][rank]}`;
      const pips = document.createElement('span'); pips.className = 'rank-pips';
      for (let r = 0; r < MAX_RANK; r++) { const pip = document.createElement('i'); if (r < rank) pip.className = 'on'; pips.append(pip); }
      ranks.append(label, pips);
      if (rank < MAX_RANK) ranks.append(button(`UPGRADE · ${RANK_PRICES[rank]} CR`, 'upgrade', profile.credits < RANK_PRICES[rank], () => actions.upgrade(weapon)));
      item.append(ranks);
      if (rank < MAX_RANK) { const next = document.createElement('p'); next.className = 'upgrade-next'; next.textContent = `Next: ${WEAPON_TIERS[weapon][rank + 1]}`; item.append(next); }
    }
    return item;
  }));
}

export interface ShipyardActions {
  buyDesign(ship: ShipId, slot: HeroSlot, design: HeroDesign): void;
  setLook(ship: ShipId, look: HeroLook): void;
  /** The game renderer's turntable strip of a look (UiActions.heroTurntable), or null without one. */
  turntable(ship: ShipId, look: HeroLook): Promise<HTMLCanvasElement | null>;
}
const TURNTABLE_SIZE = 192, TURNTABLE_FRAMES = 36;
const strips = new Map<string, Promise<HTMLCanvasElement | null>>();
let spinning = 0;
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

/**
 * The shipyard (docs/31; user, 28 October: "seeing the ship in a hangar like preview"): the equipped ship turning, its four
 * part slots with their designs (A comes with the ship, the rest are bought with parts and credits, docs/33, and then free to switch; a
 * remodelled chassis has A–E, the others A–C), and its colour and glow.
 * Cosmetic only: no part changes handling, the hit region or any stat.
 */
export function renderShipyard(host: HTMLElement, profile: CampaignProfile, actions: ShipyardActions): void {
  const ship = profile.loadout.ship, look = lookOf(profile, ship), paint = { ...HERO_DEFAULT_PAINT[ship], ...look.paint };
  const title = document.createElement('h3'); title.className = 'shipyard-title'; title.textContent = `${SHIPS[ship].label.toUpperCase()} · YOUR BUILD`;
  const canvas = document.createElement('canvas'); canvas.className = 'shipyard-preview';
  canvas.width = canvas.height = TURNTABLE_SIZE; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${SHIPS[ship].label} preview`);
  const rows = HERO_SLOTS.map(slot => {
    const row = document.createElement('div'); row.className = 'shipyard-slot';
    const label = document.createElement('span'); label.textContent = HERO_SLOT_NAMES[slot].toUpperCase(); row.append(label);
    for (const design of heroDesigns(ship)) {
      const owned = ownsDesign(profile, ship, slot, design), fitted = look.parts[slot] === design;
      // A design costs parts plus credits (docs/33); buying needs both.
      const price = HERO_DESIGN_PRICES[design], parts = HERO_DESIGN_PARTS[design];
      const choice = document.createElement('button');
      choice.type = 'button'; choice.className = `shipyard-design${fitted ? ' is-on' : owned ? '' : ' is-locked'}`;
      choice.textContent = owned ? design.toUpperCase() : `${design.toUpperCase()} ${parts}P ${price}`;
      choice.setAttribute('aria-pressed', String(fitted));
      choice.setAttribute('aria-label', `${HERO_SLOT_NAMES[slot]} design ${design.toUpperCase()}${owned ? '' : `, buy for ${parts} ${parts === 1 ? 'part' : 'parts'} and ${price} credits`}`);
      choice.disabled = !owned && (profile.credits < price || profile.parts < parts);
      choice.addEventListener('click', () => {
        if (!owned) actions.buyDesign(ship, slot, design);
        actions.setLook(ship, { ...look, parts: { ...look.parts, [slot]: design } });
      });
      row.append(choice);
    }
    return row;
  });
  const colours = document.createElement('div'); colours.className = 'shipyard-paint';
  for (const [role, name] of [['primary', 'COLOUR'], ['glow', 'GLOW']] as const) {
    const field = document.createElement('label'), input = document.createElement('input');
    input.type = 'color'; input.value = hex(paint[role]);
    input.addEventListener('change', () => actions.setLook(ship, { ...look, paint: { ...look.paint, [role]: parseInt(input.value.slice(1), 16) } }));
    field.append(input, name); colours.append(field);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'hangar-action'; reset.textContent = 'DEFAULT PAINT';
  reset.disabled = !look.paint; reset.addEventListener('click', () => actions.setLook(ship, { parts: look.parts }));
  colours.append(reset);
  host.replaceChildren(title, canvas, ...rows, colours);

  // The turntable: drawn once per look by the game's renderer, then animated here frame by frame.
  const key = heroLookKey(ship, look);
  if (!strips.has(key)) { if (strips.size > 8) strips.delete(strips.keys().next().value!); strips.set(key, actions.turntable(ship, look)); }
  const run = ++spinning;
  void strips.get(key)!.then(strip => {
    const context = canvas.getContext('2d');
    if (!strip || !context || run !== spinning) return;
    const draw = (now: number) => {
      if (run !== spinning || !canvas.isConnected) return;
      const frame = Math.floor(now / 110) % TURNTABLE_FRAMES;
      context.clearRect(0, 0, TURNTABLE_SIZE, TURNTABLE_SIZE);
      context.drawImage(strip, frame * TURNTABLE_SIZE, 0, TURNTABLE_SIZE, TURNTABLE_SIZE, 0, 0, TURNTABLE_SIZE, TURNTABLE_SIZE);
      if (!canvas.closest('[hidden]') && !document.hidden) requestAnimationFrame(draw); else setTimeout(() => requestAnimationFrame(draw), 400);
    };
    requestAnimationFrame(draw);
  });
}
