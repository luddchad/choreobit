/**
 * `@choreobit/animation` — animation operations for ChoreoBit.
 *
 * This package interprets the timeline contracts owned by `@choreobit/core`.
 * Where `core` is data only — it describes *what* an animation contains — this
 * package performs the first piece of *interpretation*: scheduling. It places
 * the operations of a {@link Timeline} onto the scene-relative timeline,
 * flattening the nodes into one chronological list. It does not interpolate
 * values or render frames; those are later concerns.
 *
 * The scheduling transform is pure: it returns a fresh
 * {@link TimelineSchedule} and never mutates its input.
 */

export type { ScheduledNodeKind, ScheduledOperation, TimelineSchedule } from './scheduling/types';

export { scheduleTimeline } from './scheduling/schedule';
