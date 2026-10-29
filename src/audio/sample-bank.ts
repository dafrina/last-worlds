import { SAMPLE_IDS, synthesize, type SampleId } from './samples';

/**
 * The synthesized samples, made once per page away from taps and frames (performance, 29 October: synthesizing all of
 * them inside the first launch's tap held it about two seconds before the warp showed). `prefetchSamples` makes them in a
 * worker at boot; a mixer takes each one when it first plays it, and a sample not made yet is made on the spot.
 */
const bank = new Map<SampleId, Float32Array>();
const taken = new Set<SampleId>();
let started = false;

function keep(id: SampleId, samples: Float32Array) {
  if (!taken.has(id)) bank.set(id, samples);
}

/** Main-thread fallback when no worker runs: one sample per task, so no single task holds a frame long. */
function synthesizeIdle() {
  const id = SAMPLE_IDS.find(id => !bank.has(id) && !taken.has(id));
  if (!id) return;
  keep(id, synthesize(id));
  setTimeout(synthesizeIdle, 16);
}

export function prefetchSamples() {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  try {
    const worker = new Worker(new URL('./sample-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ id: SampleId; samples: Float32Array } | { done: true }>) => {
      if ('done' in data) worker.terminate();
      else keep(data.id, data.samples);
    };
    worker.onerror = () => { worker.terminate(); synthesizeIdle(); };
  } catch {
    synthesizeIdle();
  }
}

/** A sample's data for one AudioBuffer (copied there, so the bank lets go of it). */
export function takeSample(id: SampleId): Float32Array {
  const samples = bank.get(id) ?? synthesize(id);
  bank.delete(id); taken.add(id);
  return samples;
}
