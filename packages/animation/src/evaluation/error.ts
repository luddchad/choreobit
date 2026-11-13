import type { OperationKind } from '@choreobit/core';

/**
 * The closed set of reasons an evaluation of a scene can fail.
 *
 * Each code names a class of problem the evaluator can detect while walking the
 * schedule, so a caller can branch on the code without parsing the message.
 */
export type EvaluationErrorCode =
  /** A scheduled operation uses a kind the evaluator does not interpret. */
  | 'unsupportedOperation'
  /** A scheduled operation targets an object id absent from the scene. */
  | 'missingTarget'
  /** A scheduled operation's parameters are missing a field or of a wrong shape. */
  | 'malformedOperation';

/**
 * The reasons an evaluation can fail, as a readonly tuple.
 *
 * The same members as {@link EvaluationErrorCode}, exposed as an array so a
 * caller can enumerate the codes (e.g. to build a UI) without re-typing them.
 */
export const EVALUATION_ERROR_CODES = [
  'unsupportedOperation',
  'missingTarget',
  'malformedOperation',
] as const satisfies readonly EvaluationErrorCode[];

/**
 * The reason an evaluation failed.
 *
 * The `code` is the machine-readable discriminator; `message` is a human-readable
 * description that always incorporates the offending operation's id (when the
 * schedule carries one) and its kind, so an error is self-describing without a
 * second lookup.
 */
export interface EvaluationErrorDetails {
  /** The class of failure. */
  readonly code: EvaluationErrorCode;
  /** A human-readable, self-describing message. */
  readonly message: string;
  /** The id of the offending operation, when the schedule carries one. */
  readonly operationId?: string;
  /** The kind of the offending operation, when it had one. */
  readonly operationType?: OperationKind;
  /** The object id the operation targeted, when it did. */
  readonly target?: string;
}

/**
 * The error reported by a failed {@link import('./types').SceneEvaluation}.
 *
 * It is an {@link EvaluationErrorDetails} that also carries the standard
 * `Error` surface (`message`, `stack`), so a caller may either inspect its
 * fields or log it like any other error. It is never thrown: evaluation returns
 * it as the `error` field of the `{ ok: false }` branch.
 */
export class EvaluationError extends Error {
  /** The class of failure. */
  readonly code: EvaluationErrorCode;
  /** The id of the offending operation, when the schedule carries one. */
  readonly operationId?: string;
  /** The kind of the offending operation, when it had one. */
  readonly operationType?: OperationKind;
  /** The object id the operation targeted, when it did. */
  readonly target?: string;

  /**
   * Build an evaluation error from its details. The `message` doubles as the
   * `Error` message; the structured fields let a caller branch without parsing.
   */
  constructor(details: EvaluationErrorDetails) {
    super(details.message);
    this.name = 'EvaluationError';
    this.code = details.code;
    this.operationId = details.operationId;
    this.operationType = details.operationType;
    this.target = details.target;
  }
}
