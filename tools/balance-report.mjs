#!/usr/bin/env node
/*
 * Summarises tests/sim/balance-report.test.ts's JSON lines as markdown tables (docs/40):
 *   node tools/balance-report.mjs out.jsonl [more.jsonl ...]
 * Medians and ranges rather than means: a single long boss fight or a lost run would distort an average.
 */
import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap(file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)));
const median = values => {
  const v = values.filter(x => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const span = values => {
  const v = values.filter(x => x !== null && x !== undefined);
  return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : '—';
};
const fmt = (x, digits = 1) => x === null || x === undefined ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(digits);
const table = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map(r => `| ${r.join(' | ')} |`)].join('\n');
const groupBy = (list, key) => {
  const map = new Map();
  for (const row of list) { const k = key(row); if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
  return map;
};

const campaign = rows.filter(r => r.kind === 'campaign');
if (campaign.length) {
  console.log('## Campaign\n');
  const groups = groupBy(campaign, r => `${r.pilot ?? 'perfect'}|${r.mission}|${r.weapon}|${r.level}|${r.difficulty}`);
  const body = [...groups.values()].map(g => {
    const r = g[0], done = g.filter(x => x.completed).length;
    return [r.pilot ?? 'perfect', r.mission, r.weapon, `L${r.level}${r.expected ? ' (expected)' : ''}`, r.difficulty, `${done}/${g.length}`,
      `${fmt(median(g.map(x => x.livesLost)))} (${span(g.map(x => x.livesLost))})`, fmt(median(g.map(x => x.shieldHits))),
      `${fmt(median(g.map(x => x.bossFight)))} (${span(g.map(x => x.bossFight))})`, fmt(median(g.map(x => x.time))),
      fmt(median(g.map(x => x.shots)), 0), fmt(median(g.map(x => x.hazards)), 0), fmt(median(g.map(x => x.kills)), 0)];
  });
  console.log(table(['Pilot', 'Mission', 'Weapon', 'Tier', 'Difficulty', 'Completed', 'Lives lost (median, range)', 'Shield hits', 'Boss fight s (median, range)',
    'Mission s', 'Shots met', 'Lanes met', 'Kills'], body));
  // Boss stage lengths per mission and tier (medians).
  const stageRows = [...groups.values()].map(g => {
    const r = g[0], phases = [...new Set(g.flatMap(x => Object.keys(x.stages)))];
    return [r.mission, r.weapon, `L${r.level}`, phases.filter(p => p !== 'destroyed').map(p => `${p} ${fmt(median(g.map(x => x.stages[p] ?? null)))}`).join(', ')];
  });
  console.log('\n### Boss stages (median seconds)\n');
  console.log(table(['Mission', 'Weapon', 'Tier', 'Stages'], stageRows));
}

const endless = rows.filter(r => r.kind === 'endless');
if (endless.length) {
  console.log('\n## Endless, natural progression\n');
  console.log(table(['Seed', 'Highest sector', 'Final tier', 'Max tier', 'Power gains', 'Lives lost', 'Bosses defeated', 'Run'],
    endless.map(r => [r.seed, r.highestSector, r.finalTier, r.maxTier, r.powerGains, r.livesLost, r.bossesDefeated.length, r.phase])));
  console.log('\n### Checkpoints\n');
  const sectors = [...new Set(endless.flatMap(r => r.checkpoints.map(c => c.sector)))].sort((a, b) => a - b);
  console.log(table(['Sector', 'Reached', 'Tier min', 'Tier median', 'Tier max', 'Lives lost (median)', 'Power gains (median)'], sectors.map(sector => {
    const hits = endless.map(r => r.checkpoints.find(c => c.sector === sector)).filter(c => c?.reached);
    return [sector, `${Math.round(100 * hits.length / endless.length)}% (${hits.length}/${endless.length})`, hits.length ? Math.min(...hits.map(c => c.tier)) : '—',
      fmt(median(hits.map(c => c.tier))), hits.length ? Math.max(...hits.map(c => c.tier)) : '—', fmt(median(hits.map(c => c.livesLost))), fmt(median(hits.map(c => c.powerGains)))];
  })));
  console.log('\n### First time at each tier (median run seconds)\n');
  console.log(table(['Tier', 'Runs reaching it', 'Median first time'], [1, 2, 3, 4, 5].map(tier => {
    const times = endless.map(r => r.tierFirstAt[tier - 1]).filter(t => t !== null);
    return [`L${tier}`, `${times.length}/${endless.length}`, fmt(median(times))];
  })));
}

const isolated = rows.filter(r => r.kind === 'isolated');
if (isolated.length) {
  console.log('\n## Endless, isolated sectors (artificial equipment)\n');
  const groups = groupBy(isolated, r => `${r.sector}|${r.weapon}|${r.level}`);
  console.log(table(['Sector', 'Weapon', 'Tier', 'Runs', 'Survived s (median, range)', 'Lives lost (median)', 'Kills (median)', 'Bosses down'], [...groups.values()].map(g => {
    const r = g[0];
    return [r.sector, r.weapon, `L${r.level}`, g.length, `${fmt(median(g.map(x => x.survivedSeconds)))} (${span(g.map(x => x.survivedSeconds))})`,
      fmt(median(g.map(x => x.livesLost))), fmt(median(g.map(x => x.kills)), 0), g.reduce((n, x) => n + x.bossesDefeated, 0)];
  })));
}
