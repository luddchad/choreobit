/**
 * The closed set of reasons a frame render can fail.
 *
 * Each code names a class of problem the frame renderer can detect while
 * producing a frame, so a caller can branch on the code without parsing the
 * message. These are deliberately distinct from
 * `@choreobit/animation`'s `EvaluationErrorCode` and
 * `@choreobit/renderer`'s `RendererErrorCode`: a video frame renderer wraps the
 * failures of both, plus its own, under one error type it owns — mirroring how
 * `@choreobit/player`'s `PlayerError` unifies the same two.
 */
export type VideoErrorCode =
  /** Construction received a malformed or incompatible {@link AnimationDefinition}. */
  | 'invalidDefinition'
  /** Construction received a non-positive or non-finite frame rate. */
  | 'invalidFps'
  /** A frame index or time was requested outside the renderable range. */
  | 'invalidFrameIndex'
  /** The evaluation of a frame failed (an underlying {@link EvaluationError}). */
  | 'evaluation'
  /** The render of a frame threw (an underlying {@link RendererError}). */
  | 'render';

/**
 * The reasons a frame render can fail, as a readonly tuple.
 *
 * The same members as {@link VideoErrorCode}, exposed as an array so a caller can
 * enumerate the codes (e.g. to build a UI) without re-typing them.
 */
export const VIDEO_ERROR_CODES = [
  'invalidDefinition',
  'invalidFps',
  'invalidFrameIndex',
  'evaluation',
  'render',
] as const satisfies readonly VideoErrorCode[];

/**
 * The reason a frame render failed.
 *
 * The `code` is the machine-readable discriminator; `message` is a
 * human-readable description; `cause` carries the underlying error (an
 * {@link EvaluationError} or {@link RendererError}) when there was one, so a
 * caller can recover the original failure.
 */
export interface VideoErrorDetails {
  /** The class of failure. */
  readonly code: VideoErrorCode;
  /** A human-readable, self-describing message. */
  readonly message: string;
  /** The underlying error, when the failure wrapped one. */
  readonly cause?: unknown;
}

/**
 * The error the frame renderer throws for a usage or pipeline failure.
 *
 * A {@link VideoError} is a synchronous failure of one of the renderer's own
 * concerns — a bad argument at construction, an out-of-range frame index, a frame
 * that fails to evaluate, or a frame whose render throws. It is a distinct type
 * from the underlying `EvaluationError`/`RendererError` it may wrap, so a caller
 * can tell a *video* failure apart from a bare evaluation or render failure.
 *
 * It carries the standard `Error` surface (`message`, `stack`) and a `cause`
 * (via the standard `Error` `cause` option), so a caller may inspect its fields,
 * log it like any other error, or recover the original failure.
 */
export class VideoError extends Error {
  /** The class of failure. */
  readonly code: VideoErrorCode;
  /** The underlying error, when the failure wrapped one. */
  override readonly cause?: unknown;

  /**
   * Build a video error from its details. The `message` doubles as the `Error`
   * message; `cause` is passed through to the `Error` superclass so it is
   * available both as `error.cause` and via `error.stack`.
   */
  constructor(details: VideoErrorDetails) {
    super(details.message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'VideoError';
    this.code = details.code;
    this.cause = details.cause;
  }
}

/**
 * A convenience guard: is this error a {@link VideoError}?
 *
 * Use it to distinguish a video failure from any other thrown value.
 */
export function isVideoError(value: unknown): value is VideoError {
  return value instanceof VideoError;
}
