import { missionText } from './missions';
import { MAX_RANK, RANK_PRICES, SHIPS, SHIELD_TECH, SPECIALS, WEAPON_BLURB, WEAPON_TIERS } from '../content/equipment';
import { WEAPONS } from '../content/balance';
import { SLOT_ITEMS, itemPrice, lookOf, ownsDesign, shipParts, type CampaignProfile, type ItemId, type Slot } from '../campaign/profile';
import type { HeroDesign, HeroLook, HeroSlot, ShipId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';
import { HERO_DEFAULT_PAINT, HERO_DESIGN_PRICES, HERO_SLOTS, HERO_SLOT_NAMES, heroDesigns, heroLookKey } from '../content/hero-parts';

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
  /** The game renderer's still of a look (UiActions.heroPreview), or null without one. */
  picture(ship: ShipId, look: HeroLook, width: number, height: number): Promise<HTMLCanvasElement | null>;
  /** Starts downloading a look's design files (UiActions.preloadHero). */
  preload(ship: ShipId, look: HeroLook): void;
}
/** The picture's size in CSS pixels (it scales to the panel's width) and its drawing scale. */
const PICTURE_WIDTH = 360, PICTURE_HEIGHT = 230, PICTURE_SCALE = 2;
const pictures = new Map<string, Promise<HTMLCanvasElement | null>>();
/** The last picture drawn, shown at once in a re-rendered panel until the next one is ready (no blank flash). */
let shown: { ship: ShipId; still: HTMLCanvasElement } | null = null;
/** An unbought design tried on in the picture (user, 29 October: "make them previewable"), until bought or put back. */
let trying: { ship: ShipId; slot: HeroSlot; design: HeroDesign } | null = null;
let drawn = 0;
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

/**
 * The shipyard (docs/31; user, 28 October: "seeing the ship in a hangar like preview"): a large still of the ship, its four
 * part slots with their designs (A comes with the ship, the rest are bought and then free to switch; a remodelled chassis
 * has A–E, the others A–C), and its colour and glow. An unbought design can be tried on before buying. Every design file
 * of the chassis starts loading when the shipyard opens, so switching is quick.
 * Cosmetic only: no part changes handling, the hit region or any stat.
 */
export function renderShipyard(host: HTMLElement, profile: CampaignProfile, actions: ShipyardActions): void {
  const ship = profile.loadout.ship, look = lookOf(profile, ship), paint = { ...HERO_DEFAULT_PAINT[ship], ...look.paint };
  if (trying && (trying.ship !== ship || ownsDesign(profile, ship, trying.slot, trying.design))) trying = null;
  const shownLook: HeroLook = trying ? { ...look, parts: { ...look.parts, [trying.slot]: trying.design } } : look;
  for (const design of heroDesigns(ship)) actions.preload(ship, { parts: Object.fromEntries(HERO_SLOTS.map(slot => [slot, design])) as HeroLook['parts'] });
  const again = () => renderShipyard(host, profile, actions);
  const title = document.createElement('h3'); title.className = 'shipyard-title'; title.textContent = `${SHIPS[ship].label.toUpperCase()} · YOUR BUILD`;
  const canvas = document.createElement('canvas'); canvas.className = 'shipyard-preview';
  canvas.width = PICTURE_WIDTH * PICTURE_SCALE; canvas.height = PICTURE_HEIGHT * PICTURE_SCALE;
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${SHIPS[ship].label} preview`);
  const rows = HERO_SLOTS.map(slot => {
    const row = document.createElement('div'); row.className = 'shipyard-slot';
    const label = document.createElement('span'); label.textContent = HERO_SLOT_NAMES[slot].toUpperCase(); row.append(label);
    for (const design of heroDesigns(ship)) {
      const owned = ownsDesign(profile, ship, slot, design), fitted = look.parts[slot] === design, price = HERO_DESIGN_PRICES[design];
      const tried = trying?.slot === slot && trying.design === design;
      const choice = document.createElement('button');
      choice.type = 'button'; choice.className = `shipyard-design${fitted ? ' is-on' : owned ? '' : ' is-locked'}${tried ? ' is-trying' : ''}`;
      choice.textContent = owned ? design.toUpperCase() : `${design.toUpperCase()} · ${price}`;
      choice.setAttribute('aria-pressed', String(fitted || tried));
      choice.setAttribute('aria-label', `${HERO_SLOT_NAMES[slot]} design ${design.toUpperCase()}${owned ? '' : `, preview; costs ${price} credits`}`);
      choice.addEventListener('click', () => {
        if (owned) { trying = null; if (!fitted) actions.setLook(ship, { ...look, parts: { ...look.parts, [slot]: design } }); else again(); }
        else { trying = tried ? null : { ship, slot, design }; again(); }
      });
      row.append(choice);
    }
    return row;
  });
  const offer = document.createElement('div'); offer.className = 'shipyard-offer';
  if (trying) {
    const { slot, design } = trying, price = HERO_DESIGN_PRICES[design];
    const note = document.createElement('span'); note.textContent = `PREVIEW · ${HERO_SLOT_NAMES[slot].toUpperCase()} ${design.toUpperCase()}`;
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'hangar-action'; buy.textContent = `BUY · ${price} CR`;
    buy.disabled = profile.credits < price;
    buy.addEventListener('click', () => {
      trying = null;
      actions.buyDesign(ship, slot, design);
      actions.setLook(ship, { ...look, parts: { ...look.parts, [slot]: design } });
    });
    const back = document.createElement('button'); back.type = 'button'; back.className = 'hangar-action'; back.textContent = 'PUT BACK';
    back.addEventListener('click', () => { trying = null; again(); });
    offer.append(note, buy, back);
  }
  offer.hidden = !trying;
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
  host.replaceChildren(title, canvas, offer, ...rows, colours);

  // The picture: drawn once per look by the game's renderer and cached; the previous one stays up until it is ready.
  const context = canvas.getContext('2d');
  const paintStill = (still: HTMLCanvasElement) => { context?.clearRect(0, 0, canvas.width, canvas.height); context?.drawImage(still, 0, 0, canvas.width, canvas.height); };
  if (shown?.ship === ship) paintStill(shown.still);
  const key = heroLookKey(ship, shownLook);
  if (!pictures.has(key)) {
    if (pictures.size > 24) pictures.delete(pictures.keys().next().value!);
    pictures.set(key, actions.picture(ship, shownLook, canvas.width, canvas.height));
  }
  const run = ++drawn;
  void pictures.get(key)!.then(still => {
    if (!still || run !== drawn) return;
    shown = { ship, still };
    if (canvas.isConnected) paintStill(still);
  });
}
