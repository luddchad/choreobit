import { describe, expect, it } from 'vitest';
import type {
  Easing,
  Operation,
  OperationKind,
  Scene,
  Sequence,
  VisualObject,
} from '@choreobit/core';
import {
  EASING_CURVES,
  EvaluationError,
  SUPPORTED_OPERATION_KINDS,
  applyEasing,
  clamp01,
  evaluateScene,
  evaluateSceneAt,
  lerp,
  progressFor,
  scheduleTimeline,
  type EvaluatedVisualObject,
  type SceneEvaluation,
  type TimelineSchedule,
} from '../index';

/**
 * Fixtures and small builders for visual-state evaluation.
 *
 * Evaluation is a pure replay: each object seeds from its initial
 * `VisualObjectState`, then every scheduled operation that has begun by the
 * evaluation time is applied in chronological order. The fixtures here are plain
 * `Scene`/`VisualObject`/`Operation` literals; a `move`/`set` interpolates over
 * its interval while `highlight`/`setVisible` step at their start. Decimal
 * fractions are not exactly representable in floating point, so interpolated
 * positions use `toBeCloseTo`.
 */

/** A single visual object with a bare type and an optional state. */
function obj(
  id: string,
  type: string,
  state?: VisualObject['state'],
  children?: readonly VisualObject[],
): VisualObject {
  return { id, type, state, children };
}

/** Build a `Sequence` node with the given operations and an optional `startAt`. */
function sequence(operations: readonly Operation[], startAt = 0): Sequence {
  return { kind: 'sequence', startAt, operations };
}

/** An `Operation` literal, defaulting to a `set` for brevity. */
function op(
  id: string,
  type: OperationKind,
  target: string,
  duration: number,
  params?: Operation['params'],
  easing?: Easing,
): Operation {
  return { id, type, target, duration, params, easing };
}

/** A `Scene` whose single sequence holds the given operations. */
function scene(
  id: string,
  objects: readonly VisualObject[],
  operations: readonly Operation[],
): Scene {
  return { id, objects, timeline: { nodes: [sequence(operations, 0)] }, duration: 1 };
}

/** Schedule the scene's timeline, the integration path a caller actually uses. */
function schedule(s: Scene): TimelineSchedule {
  return scheduleTimeline(s.timeline);
}

/** The first evaluated object's evaluated state, when the evaluation succeeded. */
function stateOf(result: SceneEvaluation, id: string): EvaluatedVisualObject['state'] | undefined {
  if (!result.ok) return undefined;
  const found = result.state.objects.find((o) => o.id === id);
  return found?.state;
}

describe('evaluation primitives', () => {
  it('lerp returns the endpoints at 0 and 1', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('clamp01 clamps into [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  it('progressFor is the eased elapsed fraction across a positive duration', () => {
    const scheduled = schedule(
      scene('s', [obj('a', 'array')], [op('op', 'set', 'a', 1, { name: 'x', value: 1 })]),
    );
    const op0 = scheduled.operations[0]!;
    expect(op0.start).toBe(0);
    expect(progressFor(0, op0)).toBe(0);
    expect(progressFor(0.2, op0)).toBe(0.2);
    expect(progressFor(0.75, op0)).toBe(0.75);
    expect(progressFor(1.0, op0)).toBe(1);
  });

  it('progressFor is 1 at or after start for a zero-duration operation', () => {
    const scheduled = schedule(
      scene('s', [obj('a', 'array')], [op('op', 'set', 'a', 0, { name: 'x', value: 1 })]),
    );
    const op0 = scheduled.operations[0]!;
    expect(op0.start).toBe(0);
    expect(progressFor(-0.1, op0)).toBe(0);
    expect(progressFor(0, op0)).toBe(1);
    expect(progressFor(0.6, op0)).toBe(1);
  });

  it('progressFor applies the operation easing to the clamped fraction', () => {
    const scheduled = schedule(
      scene(
        's',
        [obj('a', 'array')],
        [op('op', 'set', 'a', 1, { name: 'x', value: 1 }, { name: 'easeInQuad' })],
      ),
    );
    // easeInQuad(0.5) = 0.5 * 0.5 = 0.25
    expect(progressFor(0.5, scheduled.operations[0]!)).toBeCloseTo(0.25, 12);
  });
});

describe('easing', () => {
  it('exports the closed set of named curves', () => {
    expect(Object.keys(EASING_CURVES).sort()).toEqual(
      [
        'easeInOutCubic',
        'easeInOutQuad',
        'easeInOutSine',
        'easeInCubic',
        'easeInQuad',
        'easeInSine',
        'easeOutCubic',
        'easeOutQuad',
        'easeOutSine',
        'linear',
      ].sort(),
    );
  });

  it('defaults to the identity curve when no easing is given', () => {
    expect(applyEasing(0.5, undefined)).toBe(0.5);
  });

  it('clamps the fraction before applying the curve', () => {
    expect(applyEasing(-1, { name: 'linear' })).toBe(0);
    expect(applyEasing(2, { name: 'linear' })).toBe(1);
  });

  it('applies the named curve over the closed fraction', () => {
    expect(applyEasing(0, { name: 'easeInOutCubic' })).toBeCloseTo(0, 12);
    expect(applyEasing(1, { name: 'easeInOutCubic' })).toBeCloseTo(1, 12);
    expect(applyEasing(0.5, { name: 'linear' })).toBeCloseTo(0.5, 12);
  });
});

describe('a scene with no timeline', () => {
  it('yields every object at its initial state', () => {
    const s = scene(
      's',
      [obj('a', 'array'), obj('b', 'array', { opacity: 0.5, visible: false })],
      [],
    );
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.time).toBe(0);
    expect(result.state.objects.length).toBe(2);
    expect(result.state.objects[0]!.state.visible).toBe(true);
    expect(result.state.objects[0]!.state.highlighted).toBe(false);
    expect(result.state.objects[0]!.state.properties).toEqual({});
    expect(result.state.objects[1]!.state.opacity).toBe(0.5);
    expect(result.state.objects[1]!.state.visible).toBe(false);
  });

  it('is a fresh snapshot that shares no references with the source scene', () => {
    const s = scene('s', [obj('a', 'array', { properties: { label: 'hi' } })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const state = result.state.objects[0]!.state;
    state.properties.label = 'changed';
    expect(s.objects[0]!.state?.properties).toEqual({ label: 'hi' });
  });

  it('copies extensions through from the source state', () => {
    const s = scene('s', [obj('a', 'array', { extensions: { vendor: 1 } })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.objects[0]!.state.extensions).toEqual({ vendor: 1 });
  });

  it('carries children in the source tree order, evaluated independently', () => {
    const s = scene(
      's',
      [
        obj('parent', 'tree', { properties: { depth: 0 } }, [
          obj('child', 'leaf', { visible: false }),
        ]),
      ],
      [],
    );
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const parent = result.state.objects[0]!;
    expect(parent.id).toBe('parent');
    expect(parent.state.properties).toEqual({ depth: 0 });
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]!.id).toBe('child');
    expect(parent.children[0]!.state.visible).toBe(false);
  });
});

describe('a move operation', () => {
  it('interpolates position from the origin over its interval', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 100, y: 50 })]);
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.position).toEqual({ x: 50, y: 25 });
  });

  it('is fully applied at and after the end time', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 100, y: 50 })]);
    const sch = schedule(s);
    expect(stateOf(evaluateSceneAt(s, sch, 1), 'a')?.position).toEqual({ x: 100, y: 50 });
    expect(stateOf(evaluateSceneAt(s, sch, 2), 'a')?.position).toEqual({ x: 100, y: 50 });
  });

  it('interpolates from an initial position when present', () => {
    const s = scene(
      's',
      [obj('a', 'array', { position: { x: 10, y: 20 } })],
      [op('m', 'move', 'a', 1, { x: 110, y: 120 })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.position).toEqual({ x: 60, y: 70 });
  });

  it('reports a malformed operation when x or y is missing', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 100 })]);
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('malformedOperation');
    expect(result.error.operationId).toBe('m');
    expect(result.error.operationType).toBe('move');
    expect(result.error.target).toBe('a');
  });

  it('applies easing to the position interpolation', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('m', 'move', 'a', 1, { x: 100, y: 0 }, { name: 'easeInQuad' })],
    );
    // easeInQuad(0.5) = 0.25, so x = 0 + (100 - 0) * 0.25 = 25
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.position).toEqual({ x: 25, y: 0 });
  });
});

describe('a set operation', () => {
  it('interpolates a numeric property over its interval', () => {
    const s = scene(
      's',
      [obj('a', 'array', { properties: { scale: 1 } })],
      [op('st', 'set', 'a', 1, { name: 'scale', value: 3 })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.properties).toEqual({ scale: 2 });
  });

  it('writes a discrete property that snaps at the start', () => {
    const s = scene(
      's',
      [obj('a', 'array', { properties: { label: 'old' } })],
      [op('st', 'set', 'a', 1, { name: 'label', value: 'new' })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.properties).toEqual({
      label: 'new',
    });
  });

  it('targets top-level opacity when the name is opacity', () => {
    const s = scene(
      's',
      [obj('a', 'array', { opacity: 1 })],
      [op('st', 'set', 'a', 1, { name: 'opacity', value: 0 })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.opacity).toBeCloseTo(0.5, 12);
  });

  it('reports a malformed operation when value is missing', () => {
    const s = scene('s', [obj('a', 'array')], [op('st', 'set', 'a', 0.5, { name: 'x' })]);
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('malformedOperation');
  });

  it('reports a malformed operation when name is not a string', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('st', 'set', 'a', 0.5, { value: 1 } as unknown as Operation['params'])],
    );
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('malformedOperation');
  });
});

describe('a highlight operation', () => {
  it('marks the object highlighted at its start and persists', () => {
    // A schedule with no operations leaves the highlight at its default false.
    const s = scene('s', [obj('a', 'array')], [op('h', 'highlight', 'a', 0.5)]);
    expect(
      stateOf(evaluateSceneAt(s, schedule({ ...s, timeline: { nodes: [] } }), 0.25), 'a')
        ?.highlighted,
    ).toBe(false);
    // With the highlight scheduled, it is active at and after its start.
    const sch = schedule(s);
    expect(stateOf(evaluateSceneAt(s, sch, 0), 'a')?.highlighted).toBe(true);
    expect(stateOf(evaluateSceneAt(s, sch, 1), 'a')?.highlighted).toBe(true);
  });

  it('carries an optional color through as highlightColor', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('h', 'highlight', 'a', 0.5, { color: '#ff0000' })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.5), 'a')?.highlightColor).toBe('#ff0000');
  });
});

describe('a setVisible operation', () => {
  it('toggles visibility at its start', () => {
    const s = scene('s', [obj('a', 'array')], [op('v', 'setVisible', 'a', 0, { visible: false })]);
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0), 'a')?.visible).toBe(false);
  });

  it('defaults to visible when params.visible is absent', () => {
    const s = scene('s', [obj('a', 'array', { visible: false })], [op('v', 'setVisible', 'a', 0)]);
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0), 'a')?.visible).toBe(true);
  });

  it('reports a malformed operation when visible is not a boolean', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('v', 'setVisible', 'a', 0, { visible: 'yes' } as unknown as Operation['params'])],
    );
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('malformedOperation');
  });
});

describe('error reporting', () => {
  it('reports a missing target', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'ghost', 1, { x: 1, y: 1 })]);
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('missingTarget');
    expect(result.error.target).toBe('ghost');
  });

  it('reports an unsupported operation kind', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('t', 'transform', 'a', 1, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })],
    );
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('unsupportedOperation');
    expect(result.error.operationType).toBe('transform');
  });

  it('names the first offending operation and stops the walk', () => {
    // The unsupported op begins first; the walk stops at it, before the move.
    const s = scene(
      's',
      [obj('a', 'array')],
      [
        op('t', 'transform', 'a', 0.1, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        op('m', 'move', 'a', 0.5, { x: 10, y: 10 }),
      ],
    );
    // A sequence chains back-to-back: transform @0..0.1, move @0.1..0.6.
    const sch = schedule(s);
    expect(sch.operations.map((o) => o.start)).toEqual([0, 0.1]);
    const result = evaluateSceneAt(s, sch, 1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.operationId).toBe('t');
  });
});

describe('purity and determinism', () => {
  it('does not mutate the source scene', () => {
    const s = scene(
      's',
      [obj('a', 'array', { position: { x: 0, y: 0 } })],
      [op('m', 'move', 'a', 1, { x: 100, y: 100 })],
    );
    const snapshot = JSON.parse(JSON.stringify(s)) as Scene;
    const sch = schedule(s);
    evaluateSceneAt(s, sch, 0.5);
    evaluateSceneAt(s, sch, 1);
    expect(s).toEqual(snapshot);
  });

  it('produces an equal evaluation on repeated calls', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 10, y: 20 })]);
    const sch = schedule(s);
    const a = evaluateSceneAt(s, sch, 0.5);
    const b = evaluateSceneAt(s, sch, 0.5);
    expect(a).toEqual(b);
  });

  it('returns distinct snapshots that do not alias one another', () => {
    const s = scene('s', [obj('a', 'array', { properties: { n: 1 } })], []);
    const sch = schedule(s);
    const a = evaluateSceneAt(s, sch, 0);
    const b = evaluateSceneAt(s, sch, 0);
    expect(a).toEqual(b);
    if (a.ok && b.ok) {
      a.state.objects[0]!.state.properties.n = 99;
      expect(b.state.objects[0]!.state.properties.n).toBe(1);
    }
  });
});

describe('composing operations', () => {
  it('a later move interpolates from an earlier move result', () => {
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('m1', 'move', 'a', 1, { x: 100, y: 0 }), op('m2', 'move', 'a', 1, { x: 100, y: 100 })],
    );
    // m1 @0..1 to (100,0); m2 @1..2 to (100,100). At 1.5 m2 is halfway to y=100.
    expect(stateOf(evaluateSceneAt(s, schedule(s), 1.5), 'a')?.position).toEqual({ x: 100, y: 50 });
  });

  it('an opacity set interpolates from a prior opacity', () => {
    const s = scene(
      's',
      [obj('a', 'array', { opacity: 1 })],
      [
        op('s1', 'set', 'a', 1, { name: 'opacity', value: 0 }),
        op('s2', 'set', 'a', 1, { name: 'opacity', value: 0.5 }),
      ],
    );
    // s1 @0..1 to 0; s2 @1..2 to 0.5. At 1.5 s2 is halfway from 0 to 0.5 => 0.25
    expect(stateOf(evaluateSceneAt(s, schedule(s), 1.5), 'a')?.opacity).toBeCloseTo(0.25, 12);
  });

  it('a discrete change and a continuous change compose on one object', () => {
    const s = scene(
      's',
      [obj('a', 'array', { properties: { scale: 1 } })],
      [op('h', 'highlight', 'a', 0.2), op('m', 'move', 'a', 1, { x: 50, y: 0 })],
    );
    // At 0.6: highlight (start 0.2) is active, move is 0.4 into its interval => x=20.
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.6), 'a')?.highlighted).toBe(true);
    expect(stateOf(evaluateSceneAt(s, schedule(s), 0.6), 'a')?.position).toEqual({ x: 20, y: 0 });
  });
});

describe('time boundaries and the supported set', () => {
  it('operations that begin after the time are not applied', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 100, y: 100 })]);
    const sch = schedule({
      ...s,
      timeline: { nodes: [sequence([op('m', 'move', 'a', 1, { x: 100, y: 100 })], 1)] },
    });
    expect(sch.operations[0]!.start).toBe(1);
    expect(stateOf(evaluateSceneAt(s, sch, 0.5), 'a')?.position).toBeUndefined();
  });

  it('a supported kind is enumerated in the supported set', () => {
    expect(SUPPORTED_OPERATION_KINDS).toEqual(['move', 'set', 'highlight', 'setVisible']);
  });

  it('evaluateScene schedules the scene and evaluates it in one step', () => {
    const s = scene('s', [obj('a', 'array')], [op('m', 'move', 'a', 1, { x: 10, y: 20 })]);
    const result = evaluateScene(s, 0.5);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.objects[0]!.state.position).toEqual({ x: 5, y: 10 });
  });

  it('an EvaluationError is an Error with a code', () => {
    const e = new EvaluationError({
      code: 'missingTarget',
      message: 'x',
      operationId: 'o',
      target: 't',
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('EvaluationError');
    expect(e.code).toBe('missingTarget');
    expect(e.operationId).toBe('o');
    expect(e.target).toBe('t');
  });
});

describe('deep immutability', () => {
  it('deep-copies a nested properties value so the frame owns its structure', () => {
    const nested = { style: { color: '#fff', padding: 4 } };
    const s = scene('s', [obj('a', 'array', { properties: { cfg: nested } })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const cfg = result.state.objects[0]!.state.properties.cfg as { style: { color: string } };
    cfg.style.color = '#000';
    expect(s.objects[0]!.state?.properties?.cfg).toEqual({ style: { color: '#fff', padding: 4 } });
  });

  it('deep-copies a nested array property so the frame owns it', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const s = scene('s', [obj('a', 'array', { properties: { rows } })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const rowsOut = result.state.objects[0]!.state.properties.rows as { id: number }[];
    rowsOut[0]!.id = 99;
    expect(s.objects[0]!.state?.properties?.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('deep-copies extensions so a frame does not alias the source', () => {
    const ext = { vendor: { level: 1 } };
    const s = scene('s', [obj('a', 'array', { extensions: ext })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const extOut = result.state.objects[0]!.state.extensions as { vendor: { level: number } };
    extOut.vendor.level = 5;
    expect(s.objects[0]!.state?.extensions).toEqual({ vendor: { level: 1 } });
  });

  it('a deep-cloned property written by an operation does not alias the source', () => {
    const source = { a: 1, b: { c: 2 } };
    const s = scene(
      's',
      [obj('a', 'array', { properties: { cfg: source } })],
      [op('st', 'set', 'a', 0, { name: 'cfg', value: { a: 9, b: { c: 8 } } })],
    );
    const result = evaluateSceneAt(s, schedule(s), 0.5);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const cfg = result.state.objects[0]!.state.properties.cfg as { a: number; b: { c: number } };
    cfg.b.c = 77;
    expect(s.objects[0]!.state?.properties?.cfg).toEqual({ a: 1, b: { c: 2 } });
  });

  it('two evaluations of the same scene do not alias one another', () => {
    const nested = { list: [{ n: 1 }] };
    const s = scene('s', [obj('a', 'array', { properties: { cfg: nested } })], []);
    const sch = schedule(s);
    const a = evaluateSceneAt(s, sch, 0);
    const b = evaluateSceneAt(s, sch, 0);
    expect(a).toEqual(b);
    if (a.ok && b.ok) {
      const aCfg = a.state.objects[0]!.state.properties.cfg as { list: { n: number }[] };
      aCfg.list[0]!.n = 42;
      const bCfg = b.state.objects[0]!.state.properties.cfg as { list: { n: number }[] };
      expect(bCfg.list[0]!.n).toBe(1);
    }
  });

  it('a mutation to the source after evaluation does not reach a prior snapshot', () => {
    const nested = { tag: 'orig' };
    const s = scene('s', [obj('a', 'array', { properties: { cfg: nested } })], []);
    const result = evaluateSceneAt(s, schedule(s), 0);
    expect(result.ok).toBe(true);
    nested.tag = 'mutated';
    if (result.ok) {
      const cfg = result.state.objects[0]!.state.properties.cfg as { tag: string };
      expect(cfg.tag).toBe('orig');
    }
  });
});

/**
 * Build a `Scene` whose timeline is the given `Sequence` nodes, so overlapping
 * operations at different `startAt` offsets can be expressed.
 */
function sceneWithNodes(
  id: string,
  objects: readonly VisualObject[],
  nodes: readonly Sequence[],
  duration = 2,
): Scene {
  return { id, objects, timeline: { nodes }, duration };
}

describe('overlapping operations', () => {
  it('a later overlapping move captures its from at its own start', () => {
    // m1 @0..1 -> (100,0); m2 @0.5..1.5 -> (0,100). m2's from is m1 at 0.5 = (50,0).
    const s = sceneWithNodes(
      's',
      [obj('a', 'array')],
      [
        sequence([op('m1', 'move', 'a', 1, { x: 100, y: 0 })], 0),
        sequence([op('m2', 'move', 'a', 1, { x: 0, y: 100 })], 0.5),
      ],
    );
    const sch = schedule(s);
    expect(sch.operations.map((o) => `${o.operation.id}@${o.start}`)).toEqual(['m1@0', 'm2@0.5']);
    // Before m2 starts, m1 alone governs.
    expect(stateOf(evaluateSceneAt(s, sch, 0.25), 'a')?.position).toEqual({ x: 25, y: 0 });
    // At m2's start, m2's from equals m1's value at 0.5.
    expect(stateOf(evaluateSceneAt(s, sch, 0.5), 'a')?.position).toEqual({ x: 50, y: 0 });
    // Mid m2: from (50,0) to (0,100) at 0.5 progress -> (25, 50).
    expect(stateOf(evaluateSceneAt(s, sch, 1.0), 'a')?.position).toEqual({ x: 25, y: 50 });
    // At m2's end, fully at (0,100).
    expect(stateOf(evaluateSceneAt(s, sch, 1.5), 'a')?.position).toEqual({ x: 0, y: 100 });
  });

  it('overlapping moves on one property are independent of evaluation order', () => {
    // Two overlapping moves, but evaluated at three different times.
    const s = sceneWithNodes(
      's',
      [obj('a', 'array')],
      [
        sequence([op('m1', 'move', 'a', 1, { x: 100, y: 0 })], 0),
        sequence([op('m2', 'move', 'a', 1, { x: 0, y: 100 })], 0.5),
      ],
    );
    const sch = schedule(s);
    // Repeated evaluations at the same time are identical.
    expect(stateOf(evaluateSceneAt(s, sch, 0.75), 'a')?.position).toEqual({ x: 37.5, y: 25 });
    expect(stateOf(evaluateSceneAt(s, sch, 0.75), 'a')?.position).toEqual({ x: 37.5, y: 25 });
    // Evaluating a later time first does not change an earlier time.
    evaluateSceneAt(s, sch, 1.5);
    expect(stateOf(evaluateSceneAt(s, sch, 0.25), 'a')?.position).toEqual({ x: 25, y: 0 });
  });

  it('overlapping sets on the same property: later takes precedence from its start', () => {
    // s1 @0..1 sets scale 1->0; s2 @0.5..1.5 sets scale (from s1@0.5=0.5) -> 1.
    const s = sceneWithNodes(
      's',
      [obj('a', 'array', { properties: { scale: 1 } })],
      [
        sequence([op('s1', 'set', 'a', 1, { name: 'scale', value: 0 })], 0),
        sequence([op('s2', 'set', 'a', 1, { name: 'scale', value: 1 })], 0.5),
      ],
    );
    const sch = schedule(s);
    expect(stateOf(evaluateSceneAt(s, sch, 0.25), 'a')?.properties).toEqual({ scale: 0.75 });
    // At s2's start, its from is s1's value at 0.5 = 0.5.
    expect(stateOf(evaluateSceneAt(s, sch, 0.5), 'a')?.properties).toEqual({ scale: 0.5 });
    // Mid s2: from 0.5 to 1 at 0.5 progress -> 0.75.
    expect(stateOf(evaluateSceneAt(s, sch, 1.0), 'a')?.properties).toEqual({ scale: 0.75 });
  });

  it('a non-numeric overlapping set snaps and erases the opacity channel', () => {
    // A numeric opacity fade, then a discrete (string) set to the same channel.
    const s = sceneWithNodes(
      's',
      [obj('a', 'array', { opacity: 1 })],
      [
        sequence([op('f', 'set', 'a', 1, { name: 'opacity', value: 0 })], 0),
        sequence([op('d', 'set', 'a', 0, { name: 'opacity', value: 'gone' })], 0.5),
      ],
    );
    const sch = schedule(s);
    expect(stateOf(evaluateSceneAt(s, sch, 0.25), 'a')?.opacity).toBeCloseTo(0.75, 12);
    // The discrete string set is not a finite number; opacity is erased.
    expect(stateOf(evaluateSceneAt(s, sch, 0.6), 'a')?.opacity).toBeUndefined();
  });

  it('a move and a set overlap independently on different channels', () => {
    const s = sceneWithNodes(
      's',
      [obj('a', 'array', { properties: { scale: 1 } })],
      [
        sequence([op('m', 'move', 'a', 1, { x: 100, y: 0 })], 0),
        sequence([op('st', 'set', 'a', 1, { name: 'scale', value: 3 })], 0.5),
      ],
    );
    const sch = schedule(s);
    // At 0.75: move is at (75,0); set on scale is at 0.25 progress from 1 to 3 -> 1.5.
    const st = stateOf(evaluateSceneAt(s, sch, 0.75), 'a');
    expect(st?.position).toEqual({ x: 75, y: 0 });
    expect(st?.properties).toEqual({ scale: 1.5 });
  });

  it('sequential chaining still composes end-to-end', () => {
    // Back-to-back: m1 @0..1, m2 @1..2 — m2's from is m1's end value.
    const s = scene(
      's',
      [obj('a', 'array')],
      [op('m1', 'move', 'a', 1, { x: 100, y: 0 }), op('m2', 'move', 'a', 1, { x: 100, y: 100 })],
    );
    expect(stateOf(evaluateSceneAt(s, schedule(s), 1.5), 'a')?.position).toEqual({ x: 100, y: 50 });
  });

  it('two operations starting at the same time: the later in schedule wins', () => {
    // Both start at 0; the later-scheduled move governs the position channel.
    const s = sceneWithNodes(
      's',
      [obj('a', 'array')],
      [
        sequence([op('m1', 'move', 'a', 1, { x: 10, y: 0 })], 0),
        sequence([op('m2', 'move', 'a', 1, { x: 100, y: 100 })], 0),
      ],
    );
    const sch = schedule(s);
    expect(sch.operations.map((o) => o.operation.id)).toEqual(['m1', 'm2']);
    // m2 (later) is the active segment; it interpolates from the origin to (100,100).
    expect(stateOf(evaluateSceneAt(s, sch, 0.5), 'a')?.position).toEqual({ x: 50, y: 50 });
  });
});
