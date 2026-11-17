/**
 * The closed set of reasons a player can stop or fail.
 *
 * Each code names a class of problem the player can detect while running, so a
 * caller can branch on the code without parsing the message. These are distinct
 * from `@choreobit/animation`'s `EvaluationErrorCode` and
 * `@choreobit/renderer`'s `RendererErrorCode`: a player wraps the failures of
 * both, plus its own, under one error type it owns.
 */
export type PlayerErrorCode =
  /** Evaluation of a frame failed (an underlying {@link EvaluationError}). */
  | 'evaluation'
  /** The render of a frame threw (an underlying {@link RendererError}). */
  | 'render'
  /** An argument to a player method was invalid (e.g. a non-positive rate). */
  | 'invalid'
  /** A player method was called after the player was destroyed. */
  | 'destroyed';

/**
 * The reasons a player can fail, as a readonly tuple.
 *
 * The same members as {@link PlayerErrorCode}, exposed as an array so a caller
 * can enumerate the codes (e.g. to build a UI) without re-typing them.
 */
export const PLAYER_ERROR_CODES = [
  'evaluation',
  'render',
  'invalid',
  'destroyed',
] as const satisfies readonly PlayerErrorCode[];

/**
 * The reason a player stopped or failed.
 *
 * The `code` is the machine-readable discriminator; `message` is a
 * human-readable description; `cause` carries the underlying error (an
 * {@link EvaluationError} or {@link RendererError}) when there was one, so a
 * caller can recover the original failure.
 */
export interface PlayerErrorDetails {
  /** The class of failure. */
  readonly code: PlayerErrorCode;
  /** A human-readable, self-describing message. */
  readonly message: string;
  /** The underlying error, when the failure wrapped one. */
  readonly cause?: unknown;
}

/**
 * The error a player throws for a usage failure, or records in its state on a
 * playback failure.
 *
 * A player surfaces failures two ways. A *usage* failure (an invalid argument, a
 * call after destruction) throws a {@link PlayerError} synchronously. A
 * *playback* failure (a frame that fails to evaluate or render) does **not**
 * throw: it stops the loop, sets the status to `'paused'`, records the
 * {@link PlayerError} on the state, and notifies subscribers, so a host UI can
 * show "paused because …" without an unhandled exception. The same error type
 * carries both, distinguished by `code`.
 *
 * It carries the standard `Error` surface (`message`, `stack`) and a `cause`
 * (via the standard `Error` `cause` option), so a caller may inspect its fields,
 * log it like any other error, or recover the original failure.
 */
export class PlayerError extends Error {
  /** The class of failure. */
  readonly code: PlayerErrorCode;
  /** The underlying error, when the failure wrapped one. */
  override readonly cause?: unknown;

  /**
   * Build a player error from its details. The `message` doubles as the `Error`
   * message; `cause` is passed through to the `Error` superclass so it is
   * available both as `error.cause` and via `error.stack`.
   */
  constructor(details: PlayerErrorDetails) {
    super(details.message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'PlayerError';
    this.code = details.code;
    this.cause = details.cause;
  }
}

/**
 * A convenience guard: is this error a {@link PlayerError}?
 *
 * Use it to distinguish a player failure from any other thrown value.
 */
export function isPlayerError(value: unknown): value is PlayerError {
  return value instanceof PlayerError;
}

/**
 * The error the code synchronizer throws for malformed metadata.
 *
 * A {@link CodeSyncError} is a usage failure, not a playback failure: it is
 * thrown synchronously from the pure resolver when the supplied semantic steps or
 * source locations are malformed (a non-finite or negative step time, an
 * inverted `end`-before-`start` interval, a non-positive `line`, …). It is a
 * distinct type from {@link PlayerError} so a host can tell a bad mapping apart
 * from a playback problem without branching on the code.
 */
export class CodeSyncError extends Error {
  /** The class of failure. */
  readonly code = 'invalid' as const;

  /**
   * Build a code-sync error from its message and optional cause. The `message`
   * doubles as the `Error` message; `cause` is passed through to the `Error`
   * superclass so it is available both as `error.cause` and via `error.stack`.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CodeSyncError';
  }
}

/**
 * A convenience guard: is this error a {@link CodeSyncError}?
 *
 * Use it to distinguish a code-sync failure from any other thrown value.
 */
export function isCodeSyncError(value: unknown): value is CodeSyncError {
  return value instanceof CodeSyncError;
}
