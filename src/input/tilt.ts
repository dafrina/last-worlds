/**
 * Optional tilt steering (user, 6 November 2026: "add a setting to be able to steer with gyro on the phone but default
 * stays left right screen click"). Off by default; the touch halves keep working while it is on, and a held half wins.
 *
 * The phone's side-to-side lean is read as the share of gravity along the screen's x axis (cos β · sin γ from the
 * DeviceOrientation angles), which holds at any forward pitch the phone is held at. Level is zero; a dead band ignores
 * hand tremor and the lean reaches full steering at about 17°.
 */
export type SteeringMode = 'touch' | 'tilt';

const KEY = 'last-worlds.steering';
/** Gravity share along the screen x axis: below DEAD nothing, FULL and beyond full steering (sin 3° and sin 17.5°). */
export const TILT_DEAD = 0.05;
export const TILT_FULL = 0.3;

/** The steering share (−1 left … 1 right) for a lean, the gravity share along the screen x axis. */
export function tiltSteer(lean: number): number {
  const size = (Math.abs(lean) - TILT_DEAD) / (TILT_FULL - TILT_DEAD);
  return size <= 0 ? 0 : Math.sign(lean) * Math.min(1, size);
}

/** The lean from DeviceOrientation β and γ (degrees), for the screen turned by `screenAngle` (0 portrait, 180 upside down). */
export function leanFromOrientation(beta: number, gamma: number, screenAngle = 0): number {
  const rad = Math.PI / 180, lean = Math.cos(beta * rad) * Math.sin(gamma * rad);
  return screenAngle === 180 ? -lean : lean;
}

type PermissionRequest = () => Promise<'granted' | 'denied' | 'prompt'>;
const permissionRequest = (): PermissionRequest | undefined =>
  (globalThis as { DeviceOrientationEvent?: { requestPermission?: PermissionRequest } }).DeviceOrientationEvent?.requestPermission;

/** A phone or tablet that can report orientation (the setting is hidden elsewhere). */
export function tiltSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export function readSteeringMode(storage: Storage | undefined): SteeringMode {
  try { return storage?.getItem(KEY) === 'tilt' ? 'tilt' : 'touch'; } catch { return 'touch'; }
}

export function writeSteeringMode(storage: Storage | undefined, mode: SteeringMode): void {
  try { storage?.setItem(KEY, mode); } catch { /* Storage unavailable: the choice lasts this session. */ }
}

export interface TiltSource {
  /** The steering share now (0 while off, without a reading, or with a reading older than half a second). */
  value(): number;
  /** Turns tilt on or off. Turning on asks iOS for motion access, so call it from a tap; resolves false if refused. */
  setMode(mode: SteeringMode): Promise<boolean>;
  readonly mode: SteeringMode;
  dispose(): void;
}

export function createTiltSource(initial: SteeringMode): TiltSource {
  let mode: SteeringMode = 'touch', steer = 0, at = -Infinity, listening = false, granted = !permissionRequest();
  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    const angle = screen.orientation?.angle ?? 0;
    steer = tiltSteer(leanFromOrientation(event.beta, event.gamma, angle)); at = performance.now();
  };
  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) window.addEventListener('deviceorientation', onOrientation);
    else { window.removeEventListener('deviceorientation', onOrientation); steer = 0; at = -Infinity; }
  };
  const ask = async (): Promise<boolean> => {
    if (granted) return true;
    // iOS answers granted or denied; Chromium (which has the call too) may answer prompt and then simply sends readings.
    try { granted = (await permissionRequest()!()) !== 'denied'; } catch { granted = false; }
    return granted;
  };
  // iOS forgets the grant between visits and only asks from a tap: the first tap anywhere asks again.
  const onTap = () => { if (mode === 'tilt' && !granted) void ask().then(ok => listen(ok && mode === 'tilt')); };
  for (const type of ['touchend', 'click'] as const) document.addEventListener(type, onTap, true);

  const source: TiltSource = {
    value: () => (mode === 'tilt' && performance.now() - at < 500 ? steer : 0),
    async setMode(next) {
      mode = next;
      if (next === 'touch') { listen(false); return true; }
      const ok = await ask();
      if (mode !== 'tilt') return ok;
      listen(ok);
      return ok;
    },
    get mode() { return mode; },
    dispose() { listen(false); for (const type of ['touchend', 'click'] as const) document.removeEventListener(type, onTap, true); },
  };
  // A remembered tilt choice: listen now where no permission is needed; on iOS the first tap asks.
  if (initial === 'tilt') { mode = 'tilt'; if (granted) listen(true); }
  return source;
}
