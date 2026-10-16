import { MAX_RANK, RANK_PRICES, REACTORS, SHIELD_TECH, SPECIALS, WEAPON_BLURB, rankFireRate } from '../content/equipment';
import { WEAPONS } from '../content/balance';
import { SLOT_ITEMS, itemPrice, type CampaignProfile, type ItemId, type Slot } from '../campaign/profile';
import type { ReactorId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/** Player-facing name and one-line description of any equipment item. */
export function itemText(slot: Slot, id: ItemId): { name: string; blurb: string } {
  if (slot === 'weapon') return { name: WEAPONS[id as WeaponId].label, blurb: WEAPON_BLURB[id as WeaponId] };
  if (slot === 'special') return { name: SPECIALS[id as SpecialId].label, blurb: `${SPECIALS[id as SpecialId].blurb} Recharge ${SPECIALS[id as SpecialId].recharge} s.` };
  if (slot === 'shield') return { name: SHIELD_TECH[id as ShieldTechId].label, blurb: SHIELD_TECH[id as ShieldTechId].blurb };
  const reactor = REACTORS[id as ReactorId];
  return { name: reactor.label, blurb: `${reactor.blurb} Speed ${reactor.speed}, accel ${reactor.acceleration}, brake ${reactor.braking}.` };
}

export interface HangarActions { buy(slot: Slot, id: ItemId): void; equip(slot: Slot, id: ItemId): void; upgrade(weapon: WeaponId): void }

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
    else row.append(button(`BUY · ${price} CR`, 'buy', profile.credits < price, () => actions.buy(slot, id)));
    item.append(title, text, row);
    if (slot === 'weapon' && owned) {
      const weapon = id as WeaponId, rank = profile.ranks[weapon];
      const ranks = document.createElement('div'); ranks.className = 'hangar-rank';
      ranks.setAttribute('aria-label', `Rank ${rank} of ${MAX_RANK}, fire rate ×${rankFireRate(rank).toFixed(2)}`);
      const label = document.createElement('span'); label.textContent = `FIRE RATE ×${rankFireRate(rank).toFixed(2)}`;
      const pips = document.createElement('span'); pips.className = 'rank-pips';
      for (let r = 0; r < MAX_RANK; r++) { const pip = document.createElement('i'); if (r < rank) pip.className = 'on'; pips.append(pip); }
      ranks.append(label, pips);
      if (rank < MAX_RANK) ranks.append(button(`UPGRADE · ${RANK_PRICES[rank]} CR`, 'upgrade', profile.credits < RANK_PRICES[rank], () => actions.upgrade(weapon)));
      item.append(ranks);
    }
    return item;
  }));
}
