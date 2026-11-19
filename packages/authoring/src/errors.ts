/**
 * The error the authoring builders throw when given a malformed input.
 *
 * A builder rejects an empty or non-string id, a non-finite or negative
 * duration, a non-finite coordinate, or a start time that is not a finite,
 * non-negative number so that a mistake surfaces at authoring time, not deep in
 * the player. The message names the failing argument.
 *
 * `AuthoringError` is part of the public API: callers can `instanceof` a thrown
 * value to distinguish an authoring mistake from any other failure.
 */
export class AuthoringError extends Error {
  override readonly name = 'AuthoringError';

  constructor(message: string) {
    super(message);
  }
}
