import type { Scene, VisualObject } from '@choreobit/core';
import { scheduleTimeline } from '../scheduling/schedule';
import type { ScheduledOperation, TimelineSchedule } from '../scheduling/types';
import { EvaluationError } from './error';
import { freezeChannels, readInitialChannels, routeSchedule } from './operations';
import type { ChannelTable, InitialChannels } from './operations';
import type { EvaluatedVisualObject, SceneEvaluation, SceneVisualState } from './types';

/**
 * Visual-state evaluation at an instant.
 *
 * `evaluateSceneAt` is the evaluator: given a {@link Scene} and its scheduled
 * operations, it produces the total visual state of every object at one time. It
 * is the second piece of interpretation `@choreobit/animation` provides after
 * scheduling — where scheduling places operations on the timeline, evaluation
 * reads them back into a frame.
 *
 * The evaluation is a deterministic replay: each object starts from its initial
 * state and every operation that has begun by the evaluation time is sampled, so
 * the result depends only on the scene, the schedule, and the time. It is pure:
 * the source scene and schedule are never mutated, and the returned snapshot
 * shares no references with them.
 *
 * Operations are interpreted **per channel**. Each object's state is split into
 * independent channels (`position`, `opacity`, a channel per named property,
 * `visible`, `highlight`), and each operation captures its `from` value at its
 * own `start` time. This makes overlapping operations history-independent: each
 * animates on its own interval and the later one takes precedence from its own
 * `start` onward.
 *
 * The result is total. A scene the evaluator cannot interpret (an unsupported
 * operation, a missing target, or malformed parameters) does not throw; it yields
 * an {@link import('./error').EvaluationError} in the `{ ok: false }` branch,
 * naming the first offending operation, so a caller can report where evaluation
 * stopped.
 */

/**
 * The per-object view the evaluator builds for a scene: each object's seeded
 * channels and its per-channel segment table.
 */
interface ObjectPlan {
  initial: InitialChannels;
  table: ChannelTable;
}

/**
 * Build the per-object plans for a scene.
 *
 * Each object seeds its channels from its initial
 * {@link import('@choreobit/core').VisualObjectState} and gets a fresh channel
 * table; children are planned independently. The whole schedule is then routed
 * across the object tables in one chronological pass, so each operation's `from`
 * is captured from its channel's predecessor and a missing target is named in
 * schedule order.
 */
function planScene(
  plans: Map<string, ObjectPlan>,
  scene: Scene,
  schedule: readonly ScheduledOperation[],
): void {
  const inits = new Map<string, InitialChannels>();
  const tables = new Map<string, ChannelTable>();
  const register = (object: VisualObject): void => {
    const initial = readInitialChannels(object.state);
    inits.set(object.id, initial);
    tables.set(object.id, {
      position: [],
      opacity: [],
      visible: [],
      highlight: [],
      props: new Map(),
    });
    plans.set(object.id, { initial, table: tables.get(object.id)! });
    const children = object.children;
    if (children !== undefined) {
      for (const child of children) {
        register(child);
      }
    }
  };
  for (const object of scene.objects) {
    register(object);
  }
  routeSchedule(inits, tables, schedule);
}

/**
 * Freeze the per-object plans into a renderer-facing snapshot, mirroring the
 * source object tree so a renderer can walk it the same way.
 */
function snapshot(time: number, scene: Scene, plans: Map<string, ObjectPlan>): SceneVisualState {
  return { time, objects: snapshotObjects(scene.objects, plans, time) };
}

function snapshotObjects(
  objects: readonly VisualObject[],
  plans: Map<string, ObjectPlan>,
  time: number,
): EvaluatedVisualObject[] {
  const out: EvaluatedVisualObject[] = [];
  for (const object of objects) {
    out.push(snapshotObject(object, plans, time));
  }
  return out;
}

function snapshotObject(
  object: VisualObject,
  plans: Map<string, ObjectPlan>,
  time: number,
): EvaluatedVisualObject {
  const plan = plans.get(object.id)!;
  return {
    id: object.id,
    type: object.type,
    state: freezeChannels(plan.table, plan.initial, time),
    children: snapshotObjects(object.children ?? [], plans, time),
  };
}

/**
 * Evaluate a scene at one time.
 *
 * `schedule` is the {@link TimelineSchedule} of the scene's timeline; it need
 * not be the one `scheduleTimeline(scene.timeline)` returns, so a caller may
 * reuse a schedule across many times. The result is a {@link SceneEvaluation}: a
 * `SceneVisualState` on success, or an {@link EvaluationError} naming the first
 * offending operation on failure. The source scene and schedule are read, never
 * mutated.
 */
export function evaluateSceneAt(
  scene: Scene,
  schedule: TimelineSchedule,
  time: number,
): SceneEvaluation {
  try {
    const plans = new Map<string, ObjectPlan>();
    planScene(plans, scene, schedule.operations);
    return { ok: true, state: snapshot(time, scene, plans) };
  } catch (error) {
    if (error instanceof EvaluationError) {
      return { ok: false, error };
    }
    // A malformed parameter (e.g. `params` is not an object) can surface as a
    // TypeError from the interpreter. Wrap it so the result is still a
    // SceneEvaluation rather than a thrown error, naming the operation.
    const wrapped = new EvaluationError({
      code: 'malformedOperation',
      message: `evaluation failed: ${(error as Error)?.message ?? String(error)}`,
    });
    return { ok: false, error: wrapped };
  }
}

/**
 * Schedule and evaluate a scene in one step.
 *
 * Convenience over {@link scheduleTimeline} and {@link evaluateSceneAt} for a
 * caller that has a {@link Scene} but not a prebuilt schedule. It is the
 * two-step composition `scheduleTimeline(scene.timeline)` then
 * `evaluateSceneAt(scene, schedule, time)`; it exists so the common path is a
 * single call.
 */
export function evaluateScene(scene: Scene, time: number): SceneEvaluation {
  return evaluateSceneAt(scene, scheduleTimeline(scene.timeline), time);
}
