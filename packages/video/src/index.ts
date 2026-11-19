/**
 * `@choreobit/video` — deterministic video-frame rendering for ChoreoBit.
 *
 * This package turns an {@link AnimationDefinition} into a sequence of rendered
 * frames on a {@link Canvas2DContext}, at a chosen frame rate. It is the
 * production end of the pipeline: `core` describes *what* an animation contains,
 * `animation` evaluates *where* each object is at a time, `renderer` draws an
 * evaluated state onto a 2D surface, and this package stitches the three into a
 * reproducible frame sequence — the thing a downstream encoder or a still-frame
 * export would consume.
 *
 * It is deterministic by construction. Every frame is a pure function of its
 * index and the frame rate: frame `n` is `n / fps` seconds in, resolved to a
 * scene and local time, evaluated, and drawn. The same index always yields the
 * same frame, so a render is reproducible and independent of how the frames were
 * produced — sequentially or one by one. Each scene's timeline is scheduled once
 * at construction and reused, so no frame re-schedules.
 *
 * It is browser-free: it never creates a `document`, owns an animation frame, or
 * touches a clock. A real browser `CanvasRenderingContext2D` satisfies
 * {@link Canvas2DContext} by shape, and a test can supply a recording mock of the
 * same shape. No encoding, audio, or narration lives here; those are later
 * concerns layered on the deterministic frame sequence this package produces.
 *
 * Rendering is not total: a frame whose evaluation or draw fails throws a
 * {@link VideoError} naming the failure, so a defect surfaces instead of hiding
 * inside a produced frame.
 */

export { frameTimestamp, getFrameCount, resolveSceneAtTime, type ResolvedScene } from './frames';

export {
  createFrameRenderer,
  FrameRenderer,
  type FrameInfo,
  type FrameRendererOptions,
} from './frame-renderer';

export {
  VIDEO_ERROR_CODES,
  VideoError,
  isVideoError,
  type VideoErrorDetails,
  type VideoErrorCode,
} from './errors';
