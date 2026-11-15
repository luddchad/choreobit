/**
 * `@choreobit/renderer` — the Canvas 2D rendering backend for ChoreoBit.
 *
 * This package is the concrete rendering step of the pipeline. `core` describes
 * *what* an object is, `animation` evaluates *where* it is at a given time, and
 * this package draws that evaluated state onto a 2D surface. It consumes a
 * {@link SceneVisualState} — the total, renderer-facing output of
 * `@choreobit/animation` — and issues a sequence of drawing commands on a
 * minimal, browser-free {@link Canvas2DContext} contract.
 *
 * It is deliberately backend-agnostic in its core: it never creates a `document`,
 * queries the DOM, owns an animation frame, or schedules work. A real browser
 * `CanvasRenderingContext2D` satisfies {@link Canvas2DContext} by shape, and a
 * test can supply a recording mock of the same shape. No browser lifecycle lives
 * here; that belongs to `player`/`video`.
 *
 * Rendering is not total: an unknown object type or a malformed required property
 * throws a {@link RendererError} synchronously, because a partial frame would hide
 * a defect.
 */

export type { Canvas2DContext, RenderOptions, Renderer } from './types';

export {
  DEFAULT_STYLE,
  HIGHLIGHT_STYLE,
  SUPPORTED_OBJECT_TYPES,
  type SupportedObjectType,
  drawShape,
} from './shapes';

export { renderScene } from './render';

export {
  RENDERER_ERROR_CODES,
  RendererError,
  isRendererError,
  type RendererErrorDetails,
  type RendererErrorCode,
} from './error';
