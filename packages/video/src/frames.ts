import type { Scene } from '@choreobit/core';

/**
 * Frame timing and scene resolution for `@choreobit/video`.
 *
 * An {@link AnimationDefinition} carries all timing in **seconds** and no frame
 * rate; a video renderer selects a frame rate and converts time to frame indices
 * as it renders. These helpers perform that conversion: they map between frame
 * indices and timestamps, count the frames a duration spans at a given rate, and
 * resolve which scene (and local time within it) a global time falls in.
 *
 * Every function is pure: it reads its arguments and returns a fresh value,
 * mutating nothing.
 */

/**
 * The timestamp, in seconds, of a frame at a given index.
 *
 * Frame `n` is rendered at `n / fps` seconds. This is the inverse of the
 * frame-index conversion a renderer applies when it has a timestamp, and it is
 * the value a frame's `time` field holds.
 */
export function frameTimestamp(frameIndex: number, fps: number): number {
  return frameIndex / fps;
}

/**
 * The number of frames a duration spans at a given frame rate.
 *
 * The count is `ceil(duration * fps)`: a duration that ends mid-frame still
 * gets that final frame, so the last frame's timestamp never precedes the
 * duration. A floating-point guard then trims any spurious extra frame that
 * rounding inflated past the duration (e.g. `3.0000001s` at `30fps` would
 * otherwise yield `91` frames instead of `90`).
 *
 * A non-positive duration or a non-positive frame rate yields `0` frames.
 */
export function getFrameCount(duration: number, fps: number): number {
  if (duration <= 0 || fps <= 0) return 0;

  let count = Math.ceil(duration * fps);
  while (count > 0 && count / fps > duration + 1e-9) {
    count--;
  }
  return count;
}

/**
 * A scene resolved from a global time: the scene that owns the time, its index
 * in the definition, and the time relative to the scene's start.
 */
export interface ResolvedScene {
  /** The resolved scene. */
  readonly scene: Scene;
  /** The scene's index within the definition's `scenes` array. */
  readonly sceneIndex: number;
  /** The time, in seconds, relative to the scene's start, clamped to the scene. */
  readonly localTime: number;
}

/**
 * Resolve which scene a global time falls in, and the time relative to it.
 *
 * Scenes are executed sequentially in array order; scene `i` occupies the
 * half-open interval `[start_i, start_i + duration_i)` where `start_i` is the sum
 * of the durations of all earlier scenes. A global time `t` resolves to the scene
 * whose interval contains it, and `localTime` is `t - start_i`, clamped to
 * `[0, scene.duration]`.
 *
 * The interval boundaries are half-open on the right, so a time exactly on a
 * scene boundary (e.g. `t = duration_0`) belongs to the *next* scene at
 * `localTime = 0`, never to the one that just ended. A time at or past the total
 * duration resolves to the final scene, clamped to its end.
 *
 * The caller guarantees `scenes` is non-empty; an empty array resolves to a
 * degenerate result naming no scene.
 */
export function resolveSceneAtTime(scenes: readonly Scene[], time: number): ResolvedScene {
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const end = start + scene.duration;
    if (time < end || i === scenes.length - 1) {
      return {
        scene,
        sceneIndex: i,
        localTime: clamp(time - start, 0, scene.duration),
      };
    }
    start = end;
  }

  const last = scenes[scenes.length - 1]!;
  return { scene: last, sceneIndex: scenes.length - 1, localTime: 0 };
}

/** Clamp `value` into the inclusive range `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
