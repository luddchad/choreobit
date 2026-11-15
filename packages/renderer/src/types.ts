/**
 * The minimal Canvas 2D context surface the renderer draws through.
 *
 * The renderer is browser-free: it never creates a `document`, queries the DOM,
 * or owns an animation frame. It draws through this structural contract, which a
 * real browser `CanvasRenderingContext2D` satisfies by shape. Tests supply a mock
 * that records the same calls, so the drawing sequence is asserted deterministically
 * without a browser.
 *
 * Only the members the renderer actually uses are named here. A real context has
 * far more; the renderer relies on structural compatibility, so the browser's
 * context is assignable without any adapter.
 */
export interface Canvas2DContext {
  /** Multiply the current transform by a translation. */
  translate(x: number, y: number): void;
  /** Reset the transform to the identity. */
  setTransform(): void;
  /** Clear a rectangular region of the surface. */
  clearRect(x: number, y: number, width: number, height: number): void;
  /** Fill a rectangle. */
  fillRect(x: number, y: number, width: number, height: number): void;
  /** Stroke a rectangle. */
  strokeRect(x: number, y: number, width: number, height: number): void;
  /** Stroke text at the current origin. */
  strokeText(text: string, x: number, y: number): void;
  /** Begin a new path. */
  beginPath(): void;
  /** Trace a rectangle. */
  rect(x: number, y: number, width: number, height: number): void;
  /** Trace a filled circle via an arc. */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  /** Close the current path. */
  closePath(): void;
  /** Fill the current path with the current fill style. */
  fill(): void;
  /** Stroke the current path with the current stroke style and line width. */
  stroke(): void;
  /** Fill text at the current origin. */
  fillText(text: string, x: number, y: number): void;
  /** The current fill style (color or pattern). */
  fillStyle: string;
  /** The current stroke style (color or pattern). */
  strokeStyle: string;
  /** The current line width, in pixels. */
  lineWidth: number;
  /** The current text alignment. */
  textAlign: string;
  /** The current text baseline. */
  textBaseline: string;
  /** The current font. */
  font: string;
  /** The current global opacity multiplier in `[0, 1]`. */
  globalAlpha: number;
  /** Push the current drawing state. */
  save(): void;
  /** Pop the previously pushed drawing state. */
  restore(): void;
}

/**
 * Options that control a single render.
 *
 * A render is total and side-effect-free except for the drawing commands it issues
 * on the supplied context: it does not read or write any clock, schedule, or
 * animation state.
 */
export interface RenderOptions {
  /** The canvas width, in pixels. Used to clear the surface. */
  width: number;
  /** The canvas height, in pixels. Used to clear the surface. */
  height: number;
  /**
   * The background color to fill before drawing objects.
   *
   * When absent, the surface is cleared to transparent via `clearRect` and no
   * background fill is issued.
   */
  background?: string;
  /**
   * The color used to render a highlighted object's outline.
   *
   * When absent, the documented default (`'#ffcc00'`) is used. An individual
   * object may override this through its own `highlightColor` property.
   */
  highlightColor?: string;
  /**
   * Whether to clear the surface before drawing.
   *
   * Defaults to `true`: the surface is reset (to the background, or transparent)
   * so a frame does not accumulate. When `false`, the surface is left untouched,
   * letting a caller composite onto existing content.
   */
  clear?: boolean;
}

/**
 * The shape of a renderer: a single function that draws an evaluated scene onto a
 * context.
 *
 * A renderer is a plain function, not a class. It holds no state of its own; all
 * state lives on the context and in the options, so the same renderer instance is
 * safe to call repeatedly and concurrently.
 */
export type Renderer = (
  context: Canvas2DContext,
  scene: import('@choreobit/animation').SceneVisualState,
  options: RenderOptions,
) => void;
