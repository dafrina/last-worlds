/**
 * Resumable world generation. Generators yield between small units of work (a heightfield row, a few
 * path-search expansions, a scatter row); the synchronous API runs the very same generator to completion,
 * so incremental and synchronous results are identical by construction. No clock lives here: callers
 * decide how many steps fit in a frame.
 */
export type Work<T> = Generator<void, T, void>;

/** Runs resumable work to completion synchronously. */
export function finish<T>(work: Work<T>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}
