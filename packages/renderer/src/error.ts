/**
 * The closed set of reasons a render can fail.
 *
 * Each code names a class of problem the renderer can detect while walking an
 * evaluated scene, so a caller can branch on the code without parsing the message.
 * These are deliberately distinct from `@choreobit/animation`'s
 * `EvaluationErrorCode`: a malformed evaluation is a different failure than a
 * malformed *render*, and the two packages must not share an error type.
 */
export type RendererErrorCode =
  /** The object's type is not one the renderer knows how to draw. */
  | 'unsupportedType'
  /** A required property of a known type is missing. */
  | 'missingProperty'
  /** A required property of a known type has the wrong shape or value. */
  | 'malformedProperty'
  /** The supplied context is not a valid Canvas 2D context. */
  | 'invalidContext';

/**
 * The reasons a render can fail, as a readonly tuple.
 *
 * The same members as {@link RendererErrorCode}, exposed as an array so a caller
 * can enumerate the codes (e.g. to build a UI) without re-typing them.
 */
export const RENDERER_ERROR_CODES = [
  'unsupportedType',
  'missingProperty',
  'malformedProperty',
  'invalidContext',
] as const satisfies readonly RendererErrorCode[];

/**
 * The reason a render failed.
 *
 * The `code` is the machine-readable discriminator; `message` is a
 * human-readable description that always names the offending object's id and type
 * (when known), so an error is self-describing without a second lookup.
 */
export interface RendererErrorDetails {
  /** The class of failure. */
  readonly code: RendererErrorCode;
  /** A human-readable, self-describing message. */
  readonly message: string;
  /** The id of the offending object, when the scene carries one. */
  readonly objectId?: string;
  /** The declared type of the offending object, when it had one. */
  readonly objectType?: string;
  /** The name of the offending property, when the failure was property-specific. */
  readonly property?: string;
}

/**
 * The error thrown by a render that cannot be completed.
 *
 * Rendering is **not** total: unlike evaluation, which returns a structured
 * `{ ok: false, error }`, a renderer throws a {@link RendererError} synchronously
 * when it meets an object it cannot draw. The reason is that a partial frame is
 * worse than no frame — drawing some objects and silently dropping others would
 * hide a defect. A caller that wants a structured result should `try`/`catch` the
 * render and read the thrown error's fields.
 *
 * It carries the standard `Error` surface (`message`, `stack`) so a caller may
 * either inspect its fields or log it like any other error.
 */
export class RendererError extends Error {
  /** The class of failure. */
  readonly code: RendererErrorCode;
  /** The id of the offending object, when the scene carries one. */
  readonly objectId?: string;
  /** The declared type of the offending object, when it had one. */
  readonly objectType?: string;
  /** The name of the offending property, when the failure was property-specific. */
  readonly property?: string;

  /**
   * Build a renderer error from its details. The `message` doubles as the `Error`
   * message; the structured fields let a caller branch without parsing.
   */
  constructor(details: RendererErrorDetails) {
    super(details.message);
    this.name = 'RendererError';
    this.code = details.code;
    this.objectId = details.objectId;
    this.objectType = details.objectType;
    this.property = details.property;
  }
}

/**
 * A convenience guard: is this error a {@link RendererError}?
 *
 * Use it to distinguish a renderer failure from any other thrown value.
 */
export function isRendererError(value: unknown): value is RendererError {
  return value instanceof RendererError;
}
