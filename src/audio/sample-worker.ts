/** Synthesizes every sample off the main thread at boot and hands each over as it is made (src/audio/sample-bank.ts). */
import { SAMPLE_IDS, synthesize } from './samples';

for (const id of SAMPLE_IDS) {
  const samples = synthesize(id);
  postMessage({ id, samples }, { transfer: [samples.buffer] });
}
postMessage({ done: true });
