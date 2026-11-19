import { describe, expect, it } from 'vitest';
import type {
  AnimationDefinition,
  Operation,
  OperationKind,
  Scene,
  Sequence,
  VisualObject,
} from '@choreobit/core';
import type { Canvas2DContext } from '@choreobit/renderer';
import {
  createFrameRenderer,
  FrameRenderer,
  isVideoError,
  VideoError,
  type FrameInfo,
} from '../index';

/**
 * Fixtures and a recording context for `@choreobit/video`'s frame renderer.
 *
 * The renderer stitches `@choreobit/animation`'s evaluation and
 * `@choreobit/renderer`'s drawing together: it resolves a frame's timestamp to a
 * scene and local time, evaluates that scene, and draws the result. These tests
 * drive that pipeline through a recording {@link MockContext} that mirrors the
 * renderer's own mock, so a drawing sequence is asserted without a browser. The
 * two failure paths — an evaluation that reports an error and a draw that throws
 * — are exercised by scenes crafted to trigger each.
 */

/**
 * A minimal {@link Canvas2DContext} that records every call and every style
 * assignment.
 *
 * It mirrors the renderer's test mock: drawing methods push a tagged record onto
 * `calls`, and the style properties record their assignment through getters/setters
 * so a test can assert both the draw sequence and the style in force when a draw
 * happened.
 */
class MockContext implements Canvas2DContext {
  readonly calls: Call[] = [];

  translate(x: number, y: number): void {
    this.calls.push({ op: 'translate', x, y });
  }

  setTransform(): void {
    this.calls.push({ op: 'setTransform' });
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'clearRect', x, y, width, height });
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'fillRect', x, y, width, height });
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'strokeRect', x, y, width, height });
  }

  strokeText(text: string, x: number, y: number): void {
    this.calls.push({ op: 'strokeText', text, x, y });
  }

  beginPath(): void {
    this.calls.push({ op: 'beginPath' });
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'rect', x, y, width, height });
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
    this.calls.push({ op: 'arc', x, y, radius, startAngle, endAngle });
  }

  closePath(): void {
    this.calls.push({ op: 'closePath' });
  }

  fill(): void {
    this.calls.push({ op: 'fill' });
  }

  stroke(): void {
    this.calls.push({ op: 'stroke' });
  }

  fillText(text: string, x: number, y: number): void {
    this.calls.push({ op: 'fillText', text, x, y });
  }

  save(): void {
    this.calls.push({ op: 'save' });
  }

  restore(): void {
    this.calls.push({ op: 'restore' });
  }

  set fillStyle(v: string) {
    this._fillStyle = v;
    this.calls.push({ op: 'set', key: 'fillStyle', value: v });
  }

  get fillStyle(): string {
    return this._fillStyle;
  }

  set strokeStyle(v: string) {
    this._strokeStyle = v;
    this.calls.push({ op: 'set', key: 'strokeStyle', value: v });
  }

  get strokeStyle(): string {
    return this._strokeStyle;
  }

  set lineWidth(v: number) {
    this._lineWidth = v;
    this.calls.push({ op: 'set', key: 'lineWidth', value: v });
  }

  get lineWidth(): number {
    return this._lineWidth;
  }

  set textAlign(v: string) {
    this._textAlign = v;
    this.calls.push({ op: 'set', key: 'textAlign', value: v });
  }

  get textAlign(): string {
    return this._textAlign;
  }

  set textBaseline(v: string) {
    this._textBaseline = v;
    this.calls.push({ op: 'set', key: 'textBaseline', value: v });
  }

  get textBaseline(): string {
    return this._textBaseline;
  }

  set font(v: string) {
    this._font = v;
    this.calls.push({ op: 'set', key: 'font', value: v });
  }

  get font(): string {
    return this._font;
  }

  set globalAlpha(v: number) {
    this._globalAlpha = v;
    this.calls.push({ op: 'set', key: 'globalAlpha', value: v });
  }

  get globalAlpha(): number {
    return this._globalAlpha;
  }

  /** Reset the recorded call list between frames. */
  reset(): void {
    this.calls.length = 0;
  }

  private _fillStyle = '';
  private _strokeStyle = '';
  private _lineWidth = 1;
  private _textAlign = '';
  private _textBaseline = '';
  private _font = '';
  private _globalAlpha = 1;
}

/** The tagged record of a single context call or style assignment. */
type Call =
  | { op: 'translate'; x: number; y: number }
  | { op: 'setTransform' }
  | { op: 'clearRect'; x: number; y: number; width: number; height: number }
  | { op: 'fillRect'; x: number; y: number; width: number; height: number }
  | { op: 'strokeRect'; x: number; y: number; width: number; height: number }
  | { op: 'strokeText'; text: string; x: number; y: number }
  | { op: 'beginPath' }
  | { op: 'rect'; x: number; y: number; width: number; height: number }
  | { op: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number }
  | { op: 'closePath' }
  | { op: 'fill' }
  | { op: 'stroke' }
  | { op: 'fillText'; text: string; x: number; y: number }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'set'; key: string; value: string | number };

/** Build a visual object with a bare type and optional state. */
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

/** Build an `Operation` literal, defaulting to a `set` for brevity. */
function op(
  id: string,
  type: OperationKind,
  target: string,
  duration: number,
  params?: Operation['params'],
): Operation {
  return { id, type, target, duration, params };
}

/**
 * Build a one-scene definition with the given width, height, and duration.
 *
 * A `background` may be supplied to exercise the background-fill path.
 */
function definition(
  objects: readonly VisualObject[],
  operations: readonly Operation[],
  overrides: {
    width?: number;
    height?: number;
    duration?: number;
    background?: AnimationDefinition['background'];
  } = {},
): AnimationDefinition {
  const scene: Scene = {
    id: 's',
    duration: overrides.duration ?? 1,
    objects,
    timeline: { nodes: [sequence(operations, 0)] },
  };
  return {
    id: 'd',
    name: 'Test',
    formatVersion: '1.0.0',
    width: overrides.width ?? 320,
    height: overrides.height ?? 240,
    duration: overrides.duration ?? 1,
    scenes: [scene],
    background: overrides.background,
  };
}

describe('createFrameRenderer validation', () => {
  const ctx = new MockContext();

  it('throws "invalidFps" for a zero frame rate', () => {
    expect(() => createFrameRenderer(definition([], []), 0, ctx)).toThrow(VideoError);
    expect(() => createFrameRenderer(definition([], []), 0, ctx)).toThrow(/frame rate/);
  });

  it('throws "invalidFps" for a negative frame rate', () => {
    expect(() => createFrameRenderer(definition([], []), -30, ctx)).toThrow(VideoError);
  });

  it('throws "invalidFps" for a NaN frame rate', () => {
    expect(() => createFrameRenderer(definition([], []), Number.NaN, ctx)).toThrow(VideoError);
  });

  it('throws "invalidFps" for an infinite frame rate', () => {
    expect(() => createFrameRenderer(definition([], []), Number.POSITIVE_INFINITY, ctx)).toThrow(
      VideoError,
    );
  });

  it('throws "invalidDefinition" for an empty scenes array', () => {
    const empty = definition([], []);
    empty.scenes = [];
    expect(() => createFrameRenderer(empty, 30, ctx)).toThrow(VideoError);
    expect(() => createFrameRenderer(empty, 30, ctx)).toThrow(/scenes/);
  });

  it('throws "invalidDefinition" for a non-finite width', () => {
    const bad = definition([], [], { width: Number.NaN });
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(VideoError);
  });

  it('throws "invalidDefinition" for a zero width', () => {
    const bad = definition([], [], { width: 0 });
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(VideoError);
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(/width/);
  });

  it('throws "invalidDefinition" for a zero height', () => {
    const bad = definition([], [], { height: 0 });
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(VideoError);
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(/height/);
  });

  it('throws "invalidDefinition" for a negative duration', () => {
    const bad = definition([], [], { duration: -1 });
    expect(() => createFrameRenderer(bad, 30, ctx)).toThrow(VideoError);
  });
});

describe('FrameRenderer construction', () => {
  it('exposes the frame count, frame rate, and duration', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(renderer).toBeInstanceOf(FrameRenderer);
    expect(renderer.framesCount).toBe(30);
    expect(renderer.frameRate).toBe(30);
    expect(renderer.duration).toBe(1);
  });

  it('counts the frames a multi-scene duration spans', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 2 }),
      30,
      new MockContext(),
    );
    expect(renderer.framesCount).toBe(60);
    expect(renderer.duration).toBe(2);
  });

  it('reports zero frames for a zero-duration definition', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 0 }),
      30,
      new MockContext(),
    );
    expect(renderer.framesCount).toBe(0);
  });

  it('precomputes a schedule per scene (the renderer never re-schedules)', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 2 }),
      30,
      new MockContext(),
    );
    expect(renderer.framesCount).toBe(60);
  });
});

describe('renderFrame', () => {
  it('renders a valid frame index and reports its info', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []),
      30,
      ctx,
    );
    const info: FrameInfo = renderer.renderFrame(0);
    expect(info.index).toBe(0);
    expect(info.time).toBe(0);
    expect(info.sceneIndex).toBe(0);
    expect(info.localTime).toBe(0);
    expect(info.state.time).toBe(0);
    expect(info.state.objects.map((o) => o.id)).toEqual(['r']);
  });

  it('computes a frame timestamp from its index and the frame rate', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 2 }),
      30,
      new MockContext(),
    );
    expect(renderer.renderFrame(15).time).toBe(0.5);
    expect(renderer.renderFrame(30).time).toBe(1);
  });

  it('throws "invalidFrameIndex" for a negative index', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(() => renderer.renderFrame(-1)).toThrow(VideoError);
    expect(() => renderer.renderFrame(-1)).toThrow(/out of range/);
  });

  it('throws "invalidFrameIndex" for an index at or beyond the frame count', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(() => renderer.renderFrame(30)).toThrow(VideoError);
    expect(() => renderer.renderFrame(30)).toThrow(/out of range/);
  });

  it('throws "invalidFrameIndex" for a non-integer index', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(() => renderer.renderFrame(0.5)).toThrow(VideoError);
    expect(() => renderer.renderFrame(1.5)).toThrow(VideoError);
  });

  it('draws a rectangle onto the context', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition(
        [obj('r', 'rectangle', { properties: { width: 10, height: 10, fill: '#fff' } })],
        [],
      ),
      30,
      ctx,
    );
    renderer.renderFrame(0);
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(true);
  });

  it('is deterministic: the same index yields the same drawing sequence', () => {
    const a = new MockContext();
    const b = new MockContext();
    const def = definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []);
    const rendererA = createFrameRenderer(def, 30, a);
    const rendererB = createFrameRenderer(def, 30, b);
    rendererA.renderFrame(7);
    rendererB.renderFrame(7);
    expect(a.calls).toEqual(b.calls);
  });

  it('is history-independent: an out-of-order index does not depend on prior frames', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []),
      30,
      ctx,
    );
    renderer.renderFrame(20);
    ctx.reset();
    const first = renderer.renderFrame(5);
    ctx.reset();
    const second = renderer.renderFrame(5);
    expect(first.time).toBe(second.time);
    expect(first.sceneIndex).toBe(second.sceneIndex);
  });

  it('does not mutate the source definition', () => {
    const def = definition(
      [obj('r', 'rectangle', { properties: { width: 10, height: 10 } })],
      [op('m', 'move', 'r', 1, { x: 5, y: 5 })],
    );
    const snapshot = JSON.stringify(def);
    const renderer = createFrameRenderer(def, 30, new MockContext());
    for (let i = 0; i < renderer.framesCount; i++) {
      renderer.renderFrame(i);
    }
    expect(JSON.stringify(def)).toBe(snapshot);
  });
});

describe('renderFrameAtTime', () => {
  it('renders the frame nearest a time and rounds to the frame rate', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(renderer.renderFrameAtTime(0).index).toBe(0);
    expect(renderer.renderFrameAtTime(0.5).index).toBe(15);
    expect(renderer.renderFrameAtTime(1).index).toBe(29);
  });

  it('clamps a time before the start to frame 0', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(renderer.renderFrameAtTime(-5).index).toBe(0);
  });

  it('clamps a time past the end to the final frame', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    expect(renderer.renderFrameAtTime(100).index).toBe(29);
  });

  it('throws "invalidFrameIndex" for a zero-duration animation', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 0 }),
      30,
      new MockContext(),
    );
    expect(() => renderer.renderFrameAtTime(0)).toThrow(VideoError);
  });
});

describe('frames generator', () => {
  it('yields exactly the frame count, in order', () => {
    const renderer = createFrameRenderer(definition([], []), 30, new MockContext());
    const frames = [...renderer.frames()];
    expect(frames).toHaveLength(30);
    expect(frames[0]!.index).toBe(0);
    expect(frames[29]!.index).toBe(29);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i]!.index).toBe(i);
      expect(frames[i]!.time).toBeCloseTo(i / 30, 10);
    }
  });

  it('yields nothing for a zero-duration animation', () => {
    const renderer = createFrameRenderer(
      definition([], [], { duration: 0 }),
      30,
      new MockContext(),
    );
    expect([...renderer.frames()]).toHaveLength(0);
  });

  it('produces the same frames as random access', () => {
    const seqCtx = new MockContext();
    const randCtx = new MockContext();
    const def = definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []);
    const seqRenderer = createFrameRenderer(def, 30, seqCtx);
    const randRenderer = createFrameRenderer(def, 30, randCtx);
    for (const info of seqRenderer.frames()) {
      randRenderer.renderFrame(info.index);
    }
    expect(seqCtx.calls).toEqual(randCtx.calls);
  });

  it('draws each frame onto the context in sequence', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []),
      30,
      ctx,
    );
    for (const info of renderer.frames()) {
      expect(info.index).toBeGreaterThanOrEqual(0);
    }
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(true);
  });
});

describe('failure paths', () => {
  it('throws "evaluation" when a scene fails to evaluate (a missing target)', () => {
    const ctx = new MockContext();
    const def = definition(
      [obj('r', 'rectangle', { properties: { width: 10, height: 10 } })],
      [op('m', 'move', 'ghost', 1, { x: 1, y: 1 })],
    );
    const renderer = createFrameRenderer(def, 30, ctx);
    expect(() => renderer.renderFrame(0)).toThrow(VideoError);
    try {
      renderer.renderFrame(0);
    } catch (error) {
      expect(isVideoError(error)).toBe(true);
      expect(error.code).toBe('evaluation');
      expect(error.message).toMatch(/evaluation failed/);
    }
  });

  it('throws "render" when a draw fails (an unsupported object type)', () => {
    const ctx = new MockContext();
    const def = definition([obj('x', 'star', { properties: {} })], []);
    const renderer = createFrameRenderer(def, 30, ctx);
    expect(() => renderer.renderFrame(0)).toThrow(VideoError);
    try {
      renderer.renderFrame(0);
    } catch (error) {
      expect(isVideoError(error)).toBe(true);
      expect(error.code).toBe('render');
      expect(error.message).toMatch(/render failed/);
    }
  });

  it('does not draw when evaluation fails before the draw', () => {
    const ctx = new MockContext();
    const def = definition(
      [obj('r', 'rectangle', { properties: { width: 10, height: 10 } })],
      [op('m', 'move', 'ghost', 1, { x: 1, y: 1 })],
    );
    const renderer = createFrameRenderer(def, 30, ctx);
    try {
      renderer.renderFrame(0);
    } catch {
      // expected
    }
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(false);
  });
});

describe('render options', () => {
  it('fills the background color from the definition', () => {
    const ctx = new MockContext();
    const def = definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], [], {
      background: { kind: 'solid', color: '#111827' },
    });
    const renderer = createFrameRenderer(def, 30, ctx);
    renderer.renderFrame(0);
    const bg = ctx.calls.find((c) => c.op === 'fillRect' && c.width === 320 && c.height === 240);
    expect(bg).toBeDefined();
  });

  it('clears to transparent when there is no background', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []),
      30,
      ctx,
    );
    renderer.renderFrame(0);
    expect(ctx.calls.some((c) => c.op === 'clearRect')).toBe(true);
  });

  it('honors an explicit background option', () => {
    const ctx = new MockContext();
    const def = definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []);
    const renderer = createFrameRenderer(def, 30, ctx, { background: '#00ff00' });
    renderer.renderFrame(0);
    const sets = ctx.calls.filter((c) => c.op === 'set' && c.key === 'fillStyle');
    expect(sets.some((c) => c.value === '#00ff00')).toBe(true);
  });

  it('skips clearing when clear is false', () => {
    const ctx = new MockContext();
    const renderer = createFrameRenderer(
      definition([obj('r', 'rectangle', { properties: { width: 10, height: 10 } })], []),
      30,
      ctx,
      { clear: false },
    );
    renderer.renderFrame(0);
    expect(ctx.calls.some((c) => c.op === 'clearRect')).toBe(false);
    expect(ctx.calls.some((c) => c.op === 'fillRect' && c.width === 320 && c.height === 240)).toBe(
      false,
    );
  });

  it('passes the highlight color option through to the draw', () => {
    const ctx = new MockContext();
    const def = definition(
      [obj('r', 'rectangle', { properties: { width: 10, height: 10 } })],
      [op('h', 'highlight', 'r', 1, { color: null })],
    );
    const renderer = createFrameRenderer(def, 30, ctx, { highlightColor: '#abcdef' });
    renderer.renderFrame(15);
    const sets = ctx.calls.filter((c) => c.op === 'set' && c.key === 'strokeStyle');
    expect(sets.some((c) => c.value === '#abcdef')).toBe(true);
  });
});
