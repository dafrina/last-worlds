import { VIEW, type RunState } from '../shared/contracts';
import type { Sound } from './samples';

export interface Cue { sound: Sound; pan: number; gain: number; variant: number }
/** Bounded observational adapter. No simulation mutation, random draws, or dependency on rendering/afterglow. */
export class SoundObserver {
  private time = 0;
  private volley = 0;
  private effect = 0;
  private shots = new Set<number>();
  private hazards = new Map<number, boolean>();
  private lives = 0;
  private shields = 0;
  private specials = 0;
  private charge = 0;
  private power = 0;
  private weapon = '';
  private boss = '';
  private jump: number | undefined;
  private phase = '';
  reset(state: RunState) {
    this.time = state.time; this.volley = state.nextVolleyAt;
    this.effect = state.nextId - 1;
    this.shots = new Set(state.projectiles.filter(p => !p.delay).map(p => p.id));
    this.hazards = new Map(state.hazards.map(h => [h.id, h.warning <= 0]));
    this.lives = state.player.lives; this.shields = state.player.shields;
    this.specials = state.specialsUsed; this.charge = state.player.specialCharge;
    this.power = state.player.power; this.weapon = state.player.weapon;
    this.boss = state.boss ? `${state.boss.id}:${state.boss.startedAt}:${state.boss.phase}` : '';
    this.jump = state.jump?.startedAt; this.phase = state.phase;
  }
  read(state: RunState): Cue[] {
    if (state.phase === 'paused') return [];
    if (state.time < this.time || state.time - this.time > .5) { this.reset(state); return []; }
    const events: Cue[] = [];
    const cue = (sound: Sound, x = state.player.x, gain = 1, variant = state.tick) =>
      events.push({ sound, pan: Math.max(-.65, Math.min(.65, (x - state.cameraX) / VIEW.width)), gain, variant });
    const visible = (x: number, s: number) => Math.abs(x - state.cameraX) < VIEW.width / 2 + 1 && s >= VIEW.minS && s <= VIEW.maxS;
    if (state.nextVolleyAt > this.volley) cue(state.player.weapon);
    const active = state.projectiles.filter(p => !p.delay || p.delay <= 0);
    const incoming = active.find(p => !p.friendly && !this.shots.has(p.id) && visible(p.x, p.s));
    if (incoming) cue('enemy', incoming.x, .65, incoming.id);
    for (const hazard of state.hazards) {
      if (!visible(hazard.x, 8)) continue;
      const previous = this.hazards.get(hazard.id);
      if (previous === undefined && hazard.warning > 0) cue('warning', hazard.x, .7);
      else if (previous !== true && hazard.warning <= 0 && hazard.active > 0) cue('beam', hazard.x, .6);
    }
    const lostLife = state.player.lives < this.lives;
    const shieldLost = state.player.shields < this.shields;
    if (lostLife) cue('life');
    else if (shieldLost) cue(state.player.shields === 0 ? 'shield-break' : 'shield');
    const upgraded = state.player.power > this.power || state.player.weapon !== this.weapon || state.player.shields > this.shields;
    if (upgraded) cue('upgrade');
    if (state.specialsUsed > this.specials) cue(state.config.special ?? 'shockwave');
    if (this.charge < 1 && state.player.specialCharge >= 1) cue('ready', state.player.x, .65);
    // At most three spatial explosions and two hits per observed frame. Critical player cues never share this quota.
    let explosions = 0, hits = 0, pickups = 0;
    for (const effect of state.effects) {
      if (effect.id <= this.effect || !visible(effect.x, effect.s)) continue;
      if (effect.kind === 'explosion' && !(lostLife && Math.abs(effect.s) < .1) && explosions++ < 3) {
        cue('explosion', effect.x, .65 + .25 * Math.max(0, 1 - effect.s / VIEW.maxS), effect.id);
      }
      if (effect.kind === 'blast' && explosions++ < 3) cue('heavy', effect.x, .85, effect.id);
      if (effect.kind === 'hit' && hits++ < 2) cue('impact', effect.x, .65, effect.id);
      if (effect.kind === 'pickup' && !upgraded && pickups++ === 0) cue('pickup', effect.x, .7, effect.id);
    }
    const boss = state.boss;
    const key = boss ? `${boss.id}:${boss.startedAt}:${boss.phase}` : '';
    if (boss && key !== this.boss) {
      if (boss.phase === 'destroyed') cue('boss-death', boss.x);
      else if (!this.boss || this.boss.split(':').slice(0, 2).join(':') !== key.split(':').slice(0, 2).join(':')) cue('boss-arrival', boss.x);
      else cue('boss-phase', boss.x, .8);
    }
    if (state.jump && state.jump.startedAt !== this.jump) cue('warp');
    if (state.phase !== this.phase && state.phase === 'complete') cue('win');
    if (state.phase !== this.phase && state.phase === 'over') cue('loss');
    this.reset(state);
    return events;
  }
}
