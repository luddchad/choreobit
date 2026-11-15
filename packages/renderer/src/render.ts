import type { EvaluatedVisualObject, SceneVisualState } from '@choreobit/animation';
import { HIGHLIGHT_STYLE, drawShape } from './shapes';
import type { Canvas2DContext, RenderOptions } from './types';

/**
 * Clear the surface before drawing.
 *
 * A render is total: it starts from a known state. When `clear` is not `false`
 * (its default is to clear), the surface is first reset — to the given
 * `background` color when one is supplied, otherwise to transparent via
 * `clearRect` — so the frame does not accumulate onto whatever the surface held
 * before. When `clear` is `false`, the surface is left untouched, letting a
 * caller composite onto existing content.
 */
function clearSurface(ctx: Canvas2DContext, options: RenderOptions): void {
  if (options.clear === false) return;
  if (options.background !== undefined) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, options.width, options.height);
  } else {
    ctx.clearRect(0, 0, options.width, options.height);
  }
}

/**
 * Resolve the highlight color for an object.
 *
 * Precedence: the object's own `highlightColor` (when it is a string) wins, then
 * the render option's `highlightColor`, then the documented default
 * (`HIGHLIGHT_STYLE.color`). A non-string per-object value is ignored, so a
 * malformed highlight color never crashes the render — it falls back.
 */
function resolveHighlightColor(object: EvaluatedVisualObject, options: RenderOptions): string {
  const perObject = object.state.highlightColor;
  if (typeof perObject === 'string') return perObject;
  return options.highlightColor ?? HIGHLIGHT_STYLE.color;
}

/**
 * Render a single evaluated object and its subtree.
 *
 * The object is drawn on a saved drawing state: its position is applied by
 * translating the origin, its opacity multiplies the inherited alpha, and the
 * highlight color is resolved once. Children inherit the translation (so their
 * positions are relative to the parent) and the inherited alpha, then apply
 * their own. When the object is not visible, neither it nor its subtree is
 * drawn — the save/restore is skipped entirely, so nothing leaks.
 *
 * @param ctx - The 2D context to draw onto.
 * @param object - The evaluated object, with its total state.
 * @param parentAlpha - The accumulated opacity inherited from ancestors, in `[0,1]`.
 * @param options - The render options, shared across the walk.
 */
function renderObject(
  ctx: Canvas2DContext,
  object: EvaluatedVisualObject,
  parentAlpha: number,
  options: RenderOptions,
): void {
  if (object.state.visible === false) return;

  const highlightColor = resolveHighlightColor(object, options);
  const opacity = object.state.opacity;
  const alpha = opacity === undefined ? 1 : opacity;
  const position = object.state.position;

  ctx.save();

  if (position !== undefined) {
    ctx.translate(position.x, position.y);
  }
  ctx.globalAlpha = parentAlpha * alpha;

  drawShape(ctx, object, highlightColor);

  for (const child of object.children) {
    renderObject(ctx, child, parentAlpha * alpha, options);
  }

  ctx.restore();
}

/**
 * Render a complete evaluated scene onto a 2D context.
 *
 * The render is a pure drawing pass over the supplied {@link SceneVisualState}:
 * it issues drawing commands on the context and mutates nothing else — not the
 * scene, not the schedule, and no clock or animation state. It clears the
 * surface (see {@link clearSurface}), then walks the scene's top-level objects in
 * source order, drawing each and its subtree. Children are positioned relative to
 * their parent and inherit opacity multiplicatively.
 *
 * The renderer is total except for malformed input: an unknown object type or a
 * malformed required property throws a `RendererError` synchronously rather than
 * drawing a partial frame, so a defect surfaces instead of hiding.
 *
 * @param ctx - The 2D context to draw onto. A real browser
 *   `CanvasRenderingContext2D` satisfies the {@link Canvas2DContext} contract by
 *   shape.
 * @param scene - The evaluated visual state to draw, as produced by
 *   `@choreobit/animation`'s evaluator.
 * @param options - The render options (canvas size, background, highlight color).
 */
export function renderScene(
  ctx: Canvas2DContext,
  scene: SceneVisualState,
  options: RenderOptions,
): void {
  clearSurface(ctx, options);
  for (const object of scene.objects) {
    renderObject(ctx, object, 1, options);
  }
}
