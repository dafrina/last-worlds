import { describe, expect, it } from 'vitest';
import { BALANCE, DIFFICULTIES, ENEMIES, THREAT_COST, difficultyScales } from '../../src/content/balance';
import {
  BAND, CAMPAIGN_DECKS, SCARCE, SITE_CALM, SITE_COUNT, DECK_POOLS, DECK_TEMPLATES, ENDLESS_DECKS, PAIR_FLOOR, PAIR_WINDOW, authoredKinds, band, deckTemplate, nominalPlaylist,
  placementCost, placementRole, resolveDeck, resolvePlaylist, resolveTemplate, slotAt, varied, waveCharacter, type DeckTemplate,
} from '../../src/content/encounter-deck';
import { cueRoster, type EncounterCue } from '../../src/content/encounters';
import { endlessPlanet } from '../../src/content/endless';
import { FORMATIONS } from '../../src/content/formations';
import { SITES, sitePool } from '../../src/content/sites';
import { VIEW, type PlanetId } from '../../src/shared/contracts';
import { airspaceClear, plannedMembers } from '../../src/sim/airspace';
import { createRun } from '../../src/sim/game';
import { memberPosition } from '../../src/sim/motion';
import { fly, perfectPilot } from './pilots';

/** The encounter deck (docs/33 § 4): authored arcs, pools of authored waves, a seeded roll per attempt. */
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const PLANETS: readonly PlanetId[] = ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'];
const key = (formations: readonly { formation: string }[]) => formations.map(p => p.formation).sort().join('+');

describe('encounter deck: resolution', () => {
  it('is deterministic: the same seed gives the identical list, different seeds give different lists', () => {
    for (const deck of DECK_TEMPLATES) {
      expect(resolveTemplate(deck, 42)).toEqual(resolveTemplate(deck, 42));
      const lists = new Set(SEEDS.slice(0, 20).map(seed => JSON.stringify(resolveTemplate(deck, seed))));
      expect(lists.size, `${deck.id} varies with the seed`).toBeGreaterThan(5);
    }
    // The director's memoized lists are the same lists.
    expect(resolvePlaylist({ mode: 'campaign', mission: 'cold-vector' }, 1, 7)).toEqual(resolveTemplate(CAMPAIGN_DECKS['cold-vector'], 7));
    expect(resolvePlaylist({ mode: 'campaign', mission: 'cold-vector' }, 1, 7)).toBe(resolvePlaylist({ mode: 'campaign', mission: 'cold-vector' }, 1, 7));
  });

  it('resolves endless per sector: a later visit to the same stage is drawn again', () => {
    // Sectors 11 and 12 both fly Khepri's peak stage.
    expect(deckTemplate({ mode: 'endless' }, 11)).toBe(deckTemplate({ mode: 'endless' }, 12));
    expect(resolvePlaylist({ mode: 'endless' }, 11, 5)).not.toEqual(resolvePlaylist({ mode: 'endless' }, 12, 5));
    expect(resolvePlaylist({ mode: 'endless' }, 11, 5)).toEqual(resolveTemplate(ENDLESS_DECKS.khepriPeak, 5, 11));
    for (let sector = 1; sector <= 19; sector++) expect(deckTemplate({ mode: 'endless' }, sector).world, `sector ${sector}`).toBe(endlessPlanet(sector));
  });

  it('keeps the authored arc: slot times, phases, fixed cues, mission lengths and boss cutoffs', () => {
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS.slice(0, 50)) {
      const cues = resolveTemplate(deck, seed);
      expect(cues.map(cue => cue.at)).toEqual(deck.slots.map(slotAt));
      deck.slots.forEach((slot, i) => {
        if (slot.kind === 'fixed') expect(cues[i]).toBe(slot.cue);
        else if (slot.kind === 'pool') { expect(cues[i].phase).toBe(slot.phase); expect(cues[i].pickup).toEqual(slot.pickup); }
        else expect(cues[i].phase).toBe('recovery');
      });
    }
  });
});

describe('encounter deck: guard rails', () => {
  it('never flies the same wave (or site) twice in a row, unless the arc itself does', () => {
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS) {
      const entries = resolveDeck(deck, seed);
      for (let i = 1; i < entries.length; i++) {
        const [a, b] = [entries[i - 1], entries[i]];
        if (!a.cue.formations.length || !b.cue.formations.length) continue;
        if (a.key !== b.key) continue;
        // Only an authored repeat (both fixed or nominal) may stand.
        const authored = (j: number) => { const slot = deck.slots[j]; return slot.kind === 'fixed' || (slot.kind === 'pool' && entries[j].cue.formations === slot.nominal); };
        expect(authored(i - 1) && authored(i), `${deck.id}/${seed} ${a.cue.id} → ${b.cue.id}`).toBe(true);
      }
    }
  });

  it('draws each pool slot within its threat band, and never stacks two heavy waves beyond the authored pair', () => {
    let draws = 0, fallbacks = 0, outside = 0;
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS) {
      const entries = resolveDeck(deck, seed);
      entries.forEach((entry, i) => {
        const slot = deck.slots[i];
        // A site standing in for the slot's battery is checked with the sites below.
        if (slot.kind !== 'pool' || entry.site) return;
        draws++;
        if (entry.fallback) { fallbacks++; expect(entry.cue.formations).toBe(slot.nominal); return; }
        // After a lingering Needle column, or where its character offers only a repeat of the previous wave, the slot may
        // leave its band or character for the nearest wave of its role.
        if (entry.outside) { outside++; expect(placementRole(entry.cue.formations)).toBe(placementRole(slot.nominal)); return; }
        // Otherwise the draw keeps the nominal's attack character (fighters, beams, heavies, Pulsars, the Wraith; aimed
        // turrets or missile batteries on the ground).
        expect(waveCharacter(entry.cue.formations), `${deck.id}/${seed} ${slot.id}`).toBe(waveCharacter(slot.nominal));
        const range = band(placementCost(slot.nominal));
        expect(entry.cost, `${deck.id}/${seed} ${slot.id}`).toBeGreaterThanOrEqual(range.min);
        expect(entry.cost, `${deck.id}/${seed} ${slot.id}`).toBeLessThanOrEqual(range.max);
        expect(placementRole(entry.cue.formations)).toBe(placementRole(slot.nominal));
        const previous = entries[i - 1];
        if (previous && !previous.site && entry.cue.at - previous.cue.at <= PAIR_WINDOW && key(entry.cue.formations) !== key(slot.nominal)) {
          expect(entry.cost + previous.cost, `${deck.id}/${seed} ${previous.cue.id} + ${slot.id}`).toBeLessThanOrEqual(Math.max(previous.nominal + entry.nominal, PAIR_FLOOR));
        }
      });
    }
    // A fallback (the slot's authored nominal) stays rare.
    expect(fallbacks / draws).toBeLessThan(0.03);
    expect(outside / draws).toBeLessThan(0.02);
    expect(BAND.low).toBeLessThan(1);
  });

  it('draws only waves of the slot world\'s pool for the slot\'s phase, with an allowed variation', () => {
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS.slice(0, 50)) {
      resolveDeck(deck, seed).forEach((entry, i) => {
        const slot = deck.slots[i];
        if (slot.kind !== 'pool' || entry.site || entry.fallback || entry.cue.formations === slot.nominal) return;
        const match = DECK_POOLS[deck.world][slot.phase].some(wave => [false, true].some(mirror => wave.offsets.some(offset =>
          JSON.stringify(varied(wave, mirror, offset)) === JSON.stringify(entry.cue.formations))));
        expect(match, `${deck.id}/${seed} ${slot.id}`).toBe(true);
      });
    }
  });

  it('keeps every teaching arc\'s introductions: each formation first appears where the arc introduces it, as authored', () => {
    for (const deck of DECK_TEMPLATES.filter(template => template.teach)) {
      const firsts = (cues: readonly { id: string; formations: readonly { formation: string }[] }[]) => {
        const seen = new Map<string, string>();
        for (const cue of cues) for (const p of cue.formations) if (!seen.has(p.formation)) seen.set(p.formation, cue.id);
        return seen;
      };
      for (const seed of SEEDS.slice(0, 50)) {
        const entries = resolveDeck(deck, seed);
        // The arc as authored for this attempt: a site standing in for a battery moves its introduction to its next slot.
        const nominal = deck.slots.flatMap((slot, i) => slot.kind === 'fixed' ? [slot.cue] : slot.kind === 'pool' && !entries[i].site ? [{ id: slot.id, formations: slot.nominal }] : []);
        const authored = firsts(nominal);
        const cues = entries.map(entry => entry.cue).filter(cue => !cue.site);
        const drawn = firsts(cues);
        for (const [formation, id] of drawn) expect(id, `${deck.id}/${seed} ${formation}`).toBe(authored.get(formation));
        // The introducing cue flies its authored formations.
        for (const id of new Set(authored.values())) expect(cues.find(cue => cue.id === id)?.formations, `${deck.id}/${seed} ${id}`)
          .toEqual(nominal.find(cue => cue.id === id)!.formations);
      }
    }
  });

  it('flies Pulsars and Wraiths only in the slots the arc put them in, never more of them', () => {
    const flies = (cue: EncounterCue, kind: string) => cueRoster(cue, 'veteran').includes(kind as never);
    for (const deck of DECK_TEMPLATES) for (const kind of SCARCE) {
      const nominal = nominalPlaylist(deck);
      const authored = new Set(nominal.filter(cue => flies(cue, kind)).map(cue => cue.id));
      for (const seed of SEEDS) {
        const cues = resolveTemplate(deck, seed).filter(cue => !cue.site && flies(cue, kind));
        expect(cues.length, `${deck.id}/${seed} ${kind}`).toBeLessThanOrEqual(authored.size);
        for (const cue of cues) expect(authored.has(cue.id), `${deck.id}/${seed} ${cue.id} ${kind}`).toBe(true);
      }
    }
  });

  it('flies a Pulsar\'s or the Wraith\'s stretch as authored, and nothing heavier than the nominal shortly after a strike site', () => {
    let stretch = 0, after = 0;
    for (const deck of DECK_TEMPLATES) {
      const scarceAt = deck.slots.filter(slot => cueRoster({ at: 0, id: '', phase: 'pressure', formations: slot.kind === 'fixed' ? slot.cue.formations : slot.kind === 'pool' ? slot.nominal : [] }, 'veteran')
        .some(kind => (SCARCE as readonly string[]).includes(kind))).map(slotAt);
      for (const seed of SEEDS.slice(0, 50)) {
        const entries = resolveDeck(deck, seed);
        entries.forEach((entry, i) => {
          const slot = deck.slots[i];
          if (slot.kind !== 'pool') return;
          if (scarceAt.some(at => Math.abs(at - slot.at) <= PAIR_WINDOW)) {
            stretch++;
            expect(entry.cue.formations, `${deck.id}/${seed} ${slot.id}`).toBe(slot.nominal);
          } else if (!entry.fallback && !entry.outside && entries.slice(0, i).some(other => other.site && entry.cue.at - other.cue.at <= SITE_CALM)) {
            after++;
            expect(entry.cost, `${deck.id}/${seed} ${slot.id}`).toBeLessThanOrEqual(placementCost(slot.nominal));
          }
        });
      }
    }
    expect(stretch).toBeGreaterThan(100);
    expect(after).toBeGreaterThan(100);
  });

  it('keeps Training\'s teaching order fixed on every seed', () => {
    const training = CAMPAIGN_DECKS.training;
    const messages = training.slots.flatMap(slot => slot.kind === 'fixed' && slot.cue.message ? [slot.cue.message] : []);
    expect(messages.slice(0, 5)).toEqual(['LINE UP TO FIRE', 'ARROWHEAD · KEEP MOVING', 'WATCH THE WARNING · THEN EVADE', 'GROUND CORES ARE TARGETS TOO', 'LINE ABREAST · READ THE SWEEP']);
    const reference = resolveTemplate(training, 1);
    for (const seed of SEEDS) {
      const cues = resolveTemplate(training, seed);
      // Every teaching step (message) at its time with its squadron, and the side slots teach the side route.
      expect(cues.filter(cue => cue.message && !cue.site)).toEqual(reference.filter(cue => cue.message && !cue.site));
      // Its first site always stands at 39 s; the attempt's count adds 63 s, 85 s and 44 s in that order.
      const at = cues.filter(cue => cue.site).map(cue => cue.at);
      expect(at[0]).toBe(39);
      for (const t of at) expect([39, 44, 63, 85]).toContain(t);
    }
  });
});

describe('encounter deck: content', () => {
  it('flies only the kinds each world already flies (roster faithfulness), in pools and in resolved lists', () => {
    for (const planet of PLANETS) {
      const roster = authoredKinds(planet);
      for (const phase of ['pressure', 'climax'] as const) for (const wave of DECK_POOLS[planet][phase]) {
        for (const placement of wave.formations) for (const slot of FORMATIONS[placement.formation].slots) {
          expect(roster.has(slot.kind), `${planet} ${phase} ${wave.id}: ${slot.kind}`).toBe(true);
        }
      }
    }
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS.slice(0, 30)) for (const cue of resolveTemplate(deck, seed)) {
      for (const kind of cueRoster(cue, 'veteran')) expect(authoredKinds(deck.world).has(kind), `${deck.id}/${seed} ${cue.id} ${kind}`).toBe(true);
    }
  });

  it('builds every pool wave from one air squadron or ground batteries alone, admitted into an empty sky at every rank', () => {
    for (const planet of PLANETS) for (const phase of ['pressure', 'climax'] as const) for (const wave of DECK_POOLS[planet][phase]) {
      const air = wave.formations.filter(p => FORMATIONS[p.formation].entry !== 'ground');
      const batteries = wave.formations.filter(p => FORMATIONS[p.formation].entry === 'ground' && !FORMATIONS[p.formation].harmless);
      expect(air.length, `${wave.id}: one air squadron at most`).toBeLessThanOrEqual(1);
      expect(air.length + batteries.length, `${wave.id}`).toBeGreaterThan(0);
      expect(batteries.length, `${wave.id}: one battery at most`).toBeLessThanOrEqual(1);
      for (const mirror of [false, true]) for (const offset of wave.offsets) for (const scale of [DIFFICULTIES.relaxed, DIFFICULTIES.veteran, difficultyScales('endless', 'standard', 30)]) {
        const state = createRun({ mode: 'campaign', mission: 'training', seed: 1 });
        const formations = varied(wave, mirror, offset);
        const roster = cueRoster({ at: 0, id: wave.id, phase: phase, formations }, scale.rank);
        expect(roster.length).toBeLessThanOrEqual(BALANCE.maxEnemies);
        expect(roster.reduce((sum, kind) => sum + THREAT_COST[kind], 0), `${wave.id} at ${scale.rank}`).toBeLessThanOrEqual(scale.threatBudget);
        expect(airspaceClear(state, plannedMembers(state, formations, scale.rank)), `${planet} ${wave.id} mirror=${mirror} offset=${offset}`).toBe(true);
      }
    }
  });

  it('keeps every variation (mirror and lateral offset) of every pool wave inside the view at its windups', () => {
    for (const planet of PLANETS) for (const phase of ['pressure', 'climax'] as const) for (const wave of DECK_POOLS[planet][phase]) {
      for (const mirror of [false, true]) for (const offset of wave.offsets) for (const placement of varied(wave, mirror, offset)) {
        const template = FORMATIONS[placement.formation];
        if (template.harmless) continue;
        expect(Math.abs(placement.x ?? 0), `${wave.id} offset`).toBeLessThanOrEqual(2);
        for (const rank of ['standard', 'veteran'] as const) template.slots.forEach((slot, index) => {
          if (slot.from === 'veteran' && rank === 'standard') return;
          const at = memberPosition({ template: template.id, slot: index, anchorX: placement.x ?? 0, mirror: placement.mirror ? -1 : 1, group: 0 }, (slot.lag ?? 0) + template.fireFrom + slot.fire);
          expect(Math.abs(at.x), `${wave.id} mirror=${mirror} offset=${offset} slot ${index}`).toBeLessThanOrEqual(VIEW.width / 2 - ENEMIES[slot.kind].radius - 0.2);
        });
      }
    }
  });

  it('flies 1-4 strike sites per campaign attempt (2 the most likely), one per endless stage (two in the Luna prologue, none in Nacre\'s pressure stage)', () => {
    const places = (deck: DeckTemplate) => deck.slots.filter(slot => (slot.kind === 'side' && slot.rank !== undefined) || (slot.kind === 'pool' && slot.site !== undefined)).length;
    // Every campaign arc offers four ranked site places (user, 30 October: "keep sites 1-4, with 2 being most probable").
    for (const deck of Object.values(CAMPAIGN_DECKS)) expect(places(deck), deck.id).toBe(4);
    for (const deck of Object.values(CAMPAIGN_DECKS)) {
      const counts = [0, 0, 0, 0, 0];
      for (const seed of SEEDS) counts[resolveTemplate(deck, seed).filter(cue => cue.site).length]++;
      SITE_COUNT.forEach(({ count, weight }) => expect(Math.abs(counts[count] / SEEDS.length - weight), `${deck.id} ${count} sites`).toBeLessThan(0.1));
    }
    // Endless: one site per stage (two in the prologue, Training's side routes; none in Nacre's pressure stage, Deep Bloom's
    // middle and climax, which has no recovery to hold one). Khepri's stages stand theirs in for a turret battery.
    const sides = (deck: DeckTemplate) => deck.slots.filter(slot => slot.kind === 'side' || (slot.kind === 'pool' && slot.endlessSite)).length;
    for (const [name, deck] of Object.entries(ENDLESS_DECKS)) {
      expect(sides(deck), name).toBe(name === 'prologue' ? 2 : name === 'nacrePressure' ? 0 : 1);
      for (const seed of SEEDS.slice(0, 50)) expect(resolveTemplate(deck, seed).filter(cue => cue.site).length, `${name}/${seed}`).toBe(sides(deck));
    }
    for (const name of ['khepriOpening', 'khepriPressure', 'khepriPeak'] as const) expect(ENDLESS_DECKS[name].slots.some(slot => slot.kind === 'side'), name).toBe(false);
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS.slice(0, 50)) {
      const cues = resolveTemplate(deck, seed);
      deck.slots.forEach((slot, i) => {
        const cue = cues[i];
        if (!cue.site) { if (slot.kind === 'side') expect(deck.campaign, `${deck.id}/${seed} ${slot.id}`).toBe(true); return; }
        expect(sitePool(deck.world).map(site => site.id)).toContain(cue.site.id);
        // The guard and core sit on the drawn side; a slot's pickup moves there with it.
        for (const placement of cue.formations) expect(Math.sign(placement.x ?? 0)).toBe(cue.site.side);
        if (slot.kind !== 'fixed' && slot.pickup) expect(Math.sign(cue.pickup!.x)).toBe(cue.site.side);
      });
    }
  });

  it('stands two sites within SITE_CALM of each other on opposite sides', () => {
    let pairs = 0;
    for (const deck of DECK_TEMPLATES) for (const seed of SEEDS) {
      const sites = resolveTemplate(deck, seed).filter(cue => cue.site);
      for (let i = 1; i < sites.length; i++) if (sites[i].at - sites[i - 1].at <= SITE_CALM) {
        pairs++;
        expect(sites[i].site!.side, `${deck.id}/${seed}`).toBe(-sites[i - 1].site!.side);
      }
    }
    expect(pairs).toBeGreaterThan(100);
  });

  it('draws sites by their weight and sides evenly', () => {
    const counts = new Map<string, number>();
    let west = 0, total = 0;
    for (const seed of SEEDS) for (const cue of resolveTemplate(CAMPAIGN_DECKS.bastion, seed)) {
      if (!cue.site) continue;
      counts.set(cue.site.id, (counts.get(cue.site.id) ?? 0) + 1);
      total++; if (cue.site.side < 0) west++;
    }
    expect(west / total).toBeGreaterThan(0.4); expect(west / total).toBeLessThan(0.6);
    // The salvage yard is rare (weight 0.3 of 1), the airfield common.
    expect(counts.get('salvage-yard')! / counts.get('airfield')!).toBeLessThan(SITES['salvage-yard'].weight * 2);
    expect(counts.get('salvage-yard')).toBeGreaterThan(0);
  });
});

describe('encounter deck: flown', () => {
  it('spawns the drawn strike sites in a real run', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 3 });
    const sites = new Set<string>();
    fly(state, perfectPilot(), 200, { onTick: s => { for (const enemy of s.enemies) if (enemy.site) sites.add(enemy.site); } });
    expect([...sites].sort()).toEqual(resolvePlaylist(state.config, 1, 3).flatMap(cue => cue.site ? [cue.site.id] : []).sort());
  });
});
