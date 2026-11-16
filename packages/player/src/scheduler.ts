import type { FrameHandle, FrameScheduler } from './types';

/**
 * Build a {@link FrameScheduler} on top of the host's `requestAnimationFrame` /
 * `cancelAnimationFrame`.
 *
 * This is the only place the player touches the browser frame clock, and it does
 * so *through a capability check*, not a hard reference: it reads
 * `requestAnimationFrame`/`cancelAnimationFrame` off `globalThis` at call time and
 * throws a {@link Error} if they are absent. The module therefore type-checks
 * under the library `tsconfig` (which sets `lib: ["ES2022"]`, `types: []` — no DOM
 * globals) yet still compiles and runs in a browser, where the two functions are
 * present.
 *
 * The returned scheduler is the value a browser host hands to a player: it
 * schedules a frame callback and hands back the browser's numeric
 * {@link FrameHandle}, which the player later passes to {@link cancel}.
 */
export function createRequestAnimationFrameScheduler(): FrameScheduler {
  const raf = (globalThis as { requestAnimationFrame?: (cb: (t: number) => void) => number })
    .requestAnimationFrame;
  const caf = (globalThis as { cancelAnimationFrame?: (h: number) => void }).cancelAnimationFrame;

  if (typeof raf !== 'function' || typeof caf !== 'function') {
    throw new Error(
      'createRequestAnimationFrameScheduler: requestAnimationFrame is unavailable in this environment',
    );
  }

  return {
    request(callback: (timeMs: number) => void): FrameHandle {
      return raf(callback);
    },
    cancel(handle: FrameHandle): void {
      caf(handle);
    },
  };
}
