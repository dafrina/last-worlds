import type { Difficulty, Mode, RunState } from '../shared/contracts';

/** Observational UI history, never a campaign wallet or an input to simulation. */
export const FLIGHT_LOG_KEY = 'last-worlds.flight-log.v1';
export const FLIGHT_LOG_RULESET = 'prototype-2026-10-15';
type Outcome = 'interrupted' | 'complete' | 'lost' | 'retired';
export interface FlightRecord {
  id: string; mode: Mode; difficulty: Difficulty; mission: string; ruleset: string;
  outcome: Outcome; seconds: number; kills: number; livesLost: number; specials: number;
  score: number; sector: number;
}
export interface FlightTotals {
  flights: number; clears: number; lost: number; retired: number;
  seconds: number; kills: number; livesLost: number; specials: number;
  bestScore: number; bestSector: number; longest: number;
}
interface LogData { version: 1; ruleset: string; campaign: FlightTotals; endless: FlightTotals; recent: FlightRecord[] }
export interface LogStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const emptyTotals = (): FlightTotals => ({ flights: 0, clears: 0, lost: 0, retired: 0, seconds: 0, kills: 0, livesLost: 0, specials: 0, bestScore: 0, bestSector: 0, longest: 0 });
const emptyLog = (): LogData => ({ version: 1, ruleset: FLIGHT_LOG_RULESET, campaign: emptyTotals(), endless: emptyTotals(), recent: [] });
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function recordId(): string {
  // getRandomValues also works on a phone's plain-HTTP LAN preview; randomUUID does not.
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('-');
}

function decode(raw: string): LogData {
  const data = JSON.parse(raw) as LogData;
  const totalsValid = (totals: FlightTotals) => totals && Object.keys(emptyTotals()).every(key => finite(totals[key as keyof FlightTotals]));
  if (data?.version !== 1 || data.ruleset !== FLIGHT_LOG_RULESET || !totalsValid(data.campaign) || !totalsValid(data.endless)
    || !Array.isArray(data.recent) || data.recent.length > 50 || !data.recent.every(record =>
      record && typeof record.id === 'string' && ['campaign', 'endless'].includes(record.mode)
      && ['relaxed', 'standard', 'veteran'].includes(record.difficulty) && typeof record.mission === 'string'
      && record.ruleset === FLIGHT_LOG_RULESET && ['interrupted', 'complete', 'lost', 'retired'].includes(record.outcome)
      && [record.seconds, record.kills, record.livesLost, record.specials, record.score, record.sector].every(finite))) {
    throw new Error('Unsupported flight log');
  }
  return data;
}

export function createFlightLog(storage?: LogStorage, makeId: () => string = recordId) {
  let data = emptyLog();
  let storageStatus: 'saved' | 'session' | 'unreadable' = storage ? 'saved' : 'session';
  if (storage) {
    try { const raw = storage.getItem(FLIGHT_LOG_KEY); if (raw !== null) data = decode(raw); }
    catch { storageStatus = 'unreadable'; }
  }
  const receipts = new WeakMap<RunState, { id: string; previous?: FlightRecord; finished: boolean }>();

  function observe(state: RunState, finish = false, checkpoint = false) {
    let receipt = receipts.get(state);
    if (!receipt) {
      // Exclude late-attached visual fixtures, replays and debugging snapshots.
      if (state.time > 1 || state.tick > 60) return;
      receipt = { id: makeId(), finished: false };
      receipts.set(state, receipt);
    }
    if (receipt.finished) return;
    const terminal = state.phase === 'complete' || state.phase === 'over';
    const previous = receipt.previous;
    // Checkpoint active simulation time, not each rendered frame. Pauses/menu/exit flush immediately.
    if (!finish && !terminal && !checkpoint && state.phase === 'playing' && previous && state.time - previous.seconds < 10) return;
    if (!finish && !terminal && previous && state.time === previous.seconds && state.kills === previous.kills && state.specialsUsed === previous.specials) return;
    if (storageStatus === 'saved' && storage) {
      try { const raw = storage.getItem(FLIGHT_LOG_KEY); if (raw !== null) data = decode(raw); }
      catch { storageStatus = 'unreadable'; }
    }
    const record: FlightRecord = {
      id: receipt.id, mode: state.config.mode, difficulty: state.config.difficulty ?? 'standard',
      mission: state.config.mission === 'bastion' ? 'Rolling Thunder' : 'Training', ruleset: FLIGHT_LOG_RULESET,
      outcome: state.phase === 'complete' ? 'complete' : state.phase === 'over' ? 'lost' : finish ? 'retired' : 'interrupted',
      seconds: state.time, kills: state.kills, livesLost: state.livesLost, specials: state.specialsUsed,
      score: Math.floor(state.score), sector: state.sector,
    };
    if (previous && JSON.stringify(record) === JSON.stringify(previous)) return;
    const totals = data[record.mode];
    if (!previous) totals.flights += 1;
    for (const key of ['seconds', 'kills', 'livesLost', 'specials'] as const) totals[key] += Math.max(0, record[key] - (previous?.[key] ?? 0));
    if (terminal || finish) {
      if (record.outcome === 'complete') totals.clears += 1;
      if (record.outcome === 'lost') totals.lost += 1;
      if (record.outcome === 'retired') totals.retired += 1;
      // Incomplete checkpoints are history, not eligible score records.
      totals.bestScore = Math.max(totals.bestScore, record.score);
      totals.bestSector = Math.max(totals.bestSector, record.sector);
      totals.longest = Math.max(totals.longest, record.seconds);
      receipt.finished = true;
    }
    data.recent = [record, ...data.recent.filter(item => item.id !== record.id)].slice(0, 50);
    receipt.previous = record;
    if (storageStatus === 'saved' && storage) {
      try { storage.setItem(FLIGHT_LOG_KEY, JSON.stringify(data)); }
      catch { storageStatus = 'session'; }
    }
  }
  return {
    observe,
    read() { return structuredClone(data); },
    status() { return storageStatus; },
  };
}
