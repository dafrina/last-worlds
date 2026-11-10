import { VIEW, type RunState } from '../shared/contracts';
import { BOSSES } from '../content/bosses';
import './boss-meter.css';

/** One continuous bar across the armour and core pools. Uses live scaled HP from the encounter. */
export function createBossMeter(parent: HTMLElement) {
  const meter = document.createElement('div');
  meter.className = 'boss-meter'; meter.hidden = true;
  meter.innerHTML = '<div class="boss-caption"><b></b><span></span></div><div class="boss-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
  parent.append(meter);
  const name = meter.querySelector('b')!, label = meter.querySelector('span')!;
  const track = meter.querySelector<HTMLElement>('.boss-track')!, fill = track.firstElementChild as HTMLElement;
  let lastValue = -1;
  return (state: RunState) => {
    const boss = state.boss;
    if (!boss || state.phase !== 'playing' || state.jump || boss.clearedAt !== undefined) {
      if (!meter.hidden) meter.hidden = true;
      return;
    }
    let hp = 0, max = 0, pods = 0, nearestPod = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.bossPart) { hp += Math.max(0, enemy.hp); max += enemy.maxHp; }
      else if (enemy.hp > 0 && enemy.formation?.template === 'veil-pods') {
        pods++;
        const dx = enemy.x - state.cameraX;
        if (Math.abs(dx) < Math.abs(nearestPod)) nearestPod = dx;
      }
    }
    if (!max) { meter.hidden = true; return; }
    if (meter.hidden) meter.hidden = false;
    const bossName = BOSSES[boss.id].name;
    if (name.textContent !== bossName) { name.textContent = bossName; track.setAttribute('aria-label', bossName + ' health'); }
    const side = nearestPod < -VIEW.width / 2 ? ' ←' : nearestPod > VIEW.width / 2 ? ' →' : '';
    const phase = boss.phase === 'destroyed' ? 'PODS · ' + pods + side : boss.phase === 'batteries' ? 'ARMOR' : boss.phase.toUpperCase();
    if (label.textContent !== phase) label.textContent = phase;
    const value = Math.ceil(1000 * hp / max);
    if (value !== lastValue) {
      fill.style.transform = 'scaleX(' + value / 1000 + ')';
      track.setAttribute('aria-valuenow', String(value / 10));
      lastValue = value;
    }
  };
}
