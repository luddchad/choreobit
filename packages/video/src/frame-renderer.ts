import type { AnimationDefinition } from '@choreobit/core';
import {
  evaluateSceneAt,
  scheduleTimeline,
  type SceneVisualState,
  type TimelineSchedule,
} from '@choreobit/animation';
import { renderScene, type Canvas2DContext, type RenderOptions } from '@choreobit/renderer';
import { VideoError } from './errors';
import { frameTimestamp, getFrameCount, resolveSceneAtTime } from './frames';

/**
 * The options a {@link createFrameRenderer} accepts.
 *
 * Every field is optional and falls back to a value derived from the
 * {@link AnimationDefinition}: the canvas size defaults to the definition's
 * `width`/`height`, the background defaults to the definition's solid background
 * color (when it has one), and `clear` defaults to `true`. A caller supplies an
 * option only to override one of these.
 */
export interface FrameRendererOptions {
  /** Whether each frame clears the surface before drawing. Defaults to `true`. */
  clear?: boolean;
  /** The background color; defaults to the definition's solid background, else none. */
  background?: string;
  /** The canvas width; defaults to the definition's `width`. */
  width?: number;
  /** The canvas height; defaults to the definition's `height`. */
  height?: number;
  /** The highlight color; defaults to the renderer's default. */
  highlightColor?: string;
}

/**
 * The information returned by a single frame render.
 *
 * It names the frame that was produced and the state that was drawn, so a caller
 * can log progress, write sidecar metadata, or drive a downstream encoder without
 * re-deriving any of it. The {@link state} is the fresh {@link SceneVisualState}
 * that was handed to the renderer; it shares no references with the source scene.
 */
export interface FrameInfo {
  /** The index of the frame that was rendered. */
  readonly index: number;
  /** The frame's timestamp, in seconds. */
  readonly time: number;
  /** The index, within the definition, of the scene the frame belongs to. */
  readonly sceneIndex: number;
  /** The time, in seconds, relative to that scene's start. */
  readonly localTime: number;
  /** The evaluated visual state that was drawn for this frame. */
  readonly state: SceneVisualState;
}

/**
 * A deterministic, random-access renderer that turns an
 * {@link AnimationDefinition} into a sequence of frames on a
 * {@link Canvas2DContext}.
 *
 * A frame renderer owns one definition, one frame rate, and one context. It
 * precomputes each scene's {@link TimelineSchedule} once at construction, so a
 * frame is produced by resolving its timestamp to a scene and local time,
 * evaluating that scene, and drawing the result — never re-scheduling. The same
 * frame index always yields the same frame, so rendering is reproducible: frame
 * `n` is `n / fps` seconds in, independent of how many frames were already drawn.
 *
 * Rendering is **not** total: a frame whose evaluation fails throws a
 * {@link VideoError} with code `'evaluation'`, and a frame whose render throws
 * throws one with code `'render'`. A bad frame is a hard failure, not a skipped
 * one, so a defect can never hide inside a produced frame.
 *
 * The renderer mutates nothing but the context it draws on. It reads the source
 * definition and its schedules, and hands the renderer a fresh state per frame.
 */
export class FrameRenderer {
  private readonly definition: AnimationDefinition;
  private readonly fps: number;
  private readonly context: Canvas2DContext;
  private readonly renderOptions: RenderOptions;
  private readonly frameCount: number;
  private readonly schedules: Map<number, TimelineSchedule>;

  /**
   * @internal Constructed by {@link createFrameRenderer}, which validates its
   * arguments and precomputes the scene schedules. Callers create a renderer
   * through that factory, not directly.
   */
  constructor(
    definition: AnimationDefinition,
    fps: number,
    context: Canvas2DContext,
    renderOptions: RenderOptions,
    frameCount: number,
    schedules: Map<number, TimelineSchedule>,
  ) {
    this.definition = definition;
    this.fps = fps;
    this.context = context;
    this.renderOptions = renderOptions;
    this.frameCount = frameCount;
    this.schedules = schedules;
  }

  /** The number of frames the animation spans at this frame rate. */
  get framesCount(): number {
    return this.frameCount;
  }

  /** The frame rate, in frames per second, this renderer was constructed with. */
  get frameRate(): number {
    return this.fps;
  }

  /** The total duration of the animation, in seconds. */
  get duration(): number {
    return this.definition.duration;
  }

  /**
   * Render the frame at `index` and return its {@link FrameInfo}.
   *
   * `index` must be an integer in `[0, framesCount)`. The frame's timestamp is
   * `index / fps`; it resolves to a scene and local time, that scene is
   * evaluated, and the result is drawn onto the renderer's context. The frame
   * is independent of every frame already produced — only its index and the
   * frame rate matter.
   *
   * Throws a {@link VideoError} with code `'invalidFrameIndex'` for a non-integer
   * or out-of-range index, `'evaluation'` when the scene fails to evaluate, or
   * `'render'` when the draw throws.
   */
  renderFrame(index: number): FrameInfo {
    if (!Number.isInteger(index) || index < 0 || index >= this.frameCount) {
      throw new VideoError({
        code: 'invalidFrameIndex',
        message: `frame index ${index} is out of range [0, ${this.frameCount})`,
      });
    }

    const time = frameTimestamp(index, this.fps);
    const resolved = resolveSceneAtTime(this.definition.scenes, time);
    const schedule = this.schedules.get(resolved.sceneIndex);
    if (schedule === undefined) {
      throw new VideoError({
        code: 'invalidDefinition',
        message: `no scheduled timeline for scene ${resolved.sceneIndex}`,
      });
    }

    const evaluation = evaluateSceneAt(resolved.scene, schedule, resolved.localTime);
    if (!evaluation.ok) {
      throw new VideoError({
        code: 'evaluation',
        message: `evaluation failed for frame ${index} (t=${time}): ${evaluation.error.message}`,
        cause: evaluation.error,
      });
    }

    try {
      renderScene(this.context, evaluation.state, this.renderOptions);
    } catch (error) {
      throw new VideoError({
        code: 'render',
        message: `render failed for frame ${index} (t=${time}): ${(error as Error)?.message ?? String(error)}`,
        cause: error,
      });
    }

    return {
      index,
      time,
      sceneIndex: resolved.sceneIndex,
      localTime: resolved.localTime,
      state: evaluation.state,
    };
  }

  /**
   * Render the frame nearest `time`, in seconds, and return its {@link FrameInfo}.
   *
   * `time` is clamped to `[0, duration]` and rounded to the nearest frame index
   * at the renderer's frame rate, then delegated to {@link renderFrame}. Because
   * the time is clamped, the index always falls in range for a non-empty
   * animation, so this never throws `'invalidFrameIndex'` (a zero-duration
   * animation has no frames and does throw it).
   */
  renderFrameAtTime(time: number): FrameInfo {
    const clampedTime = clamp(time, 0, this.definition.duration);
    const index = clamp(Math.round(clampedTime * this.fps), 0, this.frameCount - 1);
    return this.renderFrame(index);
  }

  /**
   * Render every frame in sequence, yielding each frame's {@link FrameInfo}.
   *
   * A lazy generator: it draws frame `n` only when the caller asks for it, so a
   * caller can stop early without paying for the remaining frames. It is the
   * sequential counterpart to {@link renderFrame}'s random access; both produce
   * identical frames for identical indices.
   */
  *frames(): Generator<FrameInfo> {
    for (let index = 0; index < this.frameCount; index++) {
      yield this.renderFrame(index);
    }
  }
}

/**
 * Create a {@link FrameRenderer} for an {@link AnimationDefinition} at a given
 * frame rate, drawing onto a {@link Canvas2DContext}.
 *
 * The definition, frame rate, and options are validated once here: a non-finite
 * or non-positive frame rate throws `'invalidFps'`; a definition with an empty
 * `scenes` array, or a non-finite/non-positive `duration`, `width`, or `height`,
 * throws `'invalidDefinition'`. Each scene's timeline is scheduled once and
 * cached, so the returned renderer never re-schedules.
 *
 * @param definition - The animation to render.
 * @param fps - The frame rate, in frames per second. Must be finite and positive.
 * @param context - The 2D context each frame is drawn onto.
 * @param options - Optional overrides for the render; see {@link FrameRendererOptions}.
 */
export function createFrameRenderer(
  definition: AnimationDefinition,
  fps: number,
  context: Canvas2DContext,
  options: FrameRendererOptions = {},
): FrameRenderer {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new VideoError({
      code: 'invalidFps',
      message: `frame rate ${fps} must be a finite, positive number`,
    });
  }

  const scenes = definition?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new VideoError({
      code: 'invalidDefinition',
      message: 'definition must have a non-empty scenes array',
    });
  }

  const { duration, width, height } = definition;
  if (!Number.isFinite(duration) || duration < 0) {
    throw new VideoError({
      code: 'invalidDefinition',
      message: `duration ${duration} must be a finite, non-negative number`,
    });
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new VideoError({
      code: 'invalidDefinition',
      message: `width ${width} must be a finite, positive number`,
    });
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new VideoError({
      code: 'invalidDefinition',
      message: `height ${height} must be a finite, positive number`,
    });
  }

  const schedules = new Map<number, TimelineSchedule>();
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    schedules.set(i, scheduleTimeline(scene.timeline));
  }

  const background =
    options.background ??
    (definition.background?.kind === 'solid' ? definition.background.color : undefined);

  const renderOptions: RenderOptions = {
    width,
    height,
    clear: options.clear ?? true,
    highlightColor: options.highlightColor,
  };
  if (background !== undefined) {
    renderOptions.background = background;
  }

  const frameCount = getFrameCount(duration, fps);

  return new FrameRenderer(definition, fps, context, renderOptions, frameCount, schedules);
}

/** Clamp `value` into the inclusive range `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
