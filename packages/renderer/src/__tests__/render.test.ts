import { describe, expect, it } from 'vitest';
import type { Scene } from '@choreobit/core';
import type { EvaluatedVisualObject, SceneVisualState } from '@choreobit/animation';
import { evaluateSceneAt, scheduleTimeline } from '@choreobit/animation';
import {
  DEFAULT_STYLE,
  HIGHLIGHT_STYLE,
  RendererError,
  RENDERER_ERROR_CODES,
  SUPPORTED_OBJECT_TYPES,
  isRendererError,
  renderScene,
} from '../index';

/**
 * Fixtures and a recording mock for the Canvas 2D backend.
 *
 * The renderer is a pure drawing pass over a {@link SceneVisualState}: it issues
 * a sequence of commands on a {@link Canvas2DContext} and mutates nothing else.
 * These tests supply a mock that records every command and every style
 * assignment, so the *sequence* of drawing is asserted deterministically without
 * a browser. A mock is a `Canvas2DContext` by shape, which is exactly the
 * structural contract the renderer relies on.
 */

/** One recorded command or style assignment on the mock context. */
type Call =
  | { op: 'translate'; x: number; y: number }
  | { op: 'setTransform' }
  | { op: 'clearRect'; x: number; y: number; width: number; height: number }
  | { op: 'fillRect'; x: number; y: number; width: number; height: number }
  | { op: 'strokeRect'; x: number; y: number; width: number; height: number }
  | { op: 'beginPath' }
  | { op: 'rect'; x: number; y: number; width: number; height: number }
  | { op: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number }
  | { op: 'closePath' }
  | { op: 'fill' }
  | { op: 'stroke' }
  | { op: 'fillText'; text: string; x: number; y: number }
  | { op: 'strokeText'; text: string; x: number; y: number }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'set'; key: string; value: unknown };

/**
 * A recording mock of the {@link Canvas2DContext} contract.
 *
 * It stores the current style/opacity fields (so a later read reflects an
 * earlier write, like a real context) and logs every command and assignment as a
 * {@link Call}. This lets a test assert the exact order and values of the
 * drawing the renderer produced.
 */
class MockContext {
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

  strokeText(text: string, x: number, y: number): void {
    this.calls.push({ op: 'strokeText', text, x, y });
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

  private _fillStyle = '';
  private _strokeStyle = '';
  private _lineWidth = 1;
  private _textAlign = '';
  private _textBaseline = '';
  private _font = '';
  private _globalAlpha = 1;
}

/** Build an evaluated object with a total state, filling the always-present fields. */
function evObj(
  id: string,
  type: string,
  props: { [key: string]: unknown },
  extra: Partial<EvaluatedVisualObject['state']> = {},
  children: readonly EvaluatedVisualObject[] = [],
): EvaluatedVisualObject {
  return {
    id,
    type,
    state: {
      visible: true,
      highlighted: false,
      properties: props,
      ...extra,
    },
    children,
  };
}

/** Wrap a single evaluated object as a scene. */
function sceneOf(objects: readonly EvaluatedVisualObject[], time = 0): SceneVisualState {
  return { time, objects };
}

/** The operations of a call list, ignoring style assignments (for sequencing). */
function ops(calls: Call[]): Call[] {
  return calls.filter((c) => c.op !== 'set');
}

/**
 * The `globalAlpha` in effect at the moment of the first call matching `pred`.
 *
 * The mock records every `globalAlpha` assignment as a `set` call, so scanning the
 * call list and remembering the most recent `globalAlpha` value reproduces the
 * value the real context held at the time of that draw call. This is how a test
 * asserts the *draw-time* opacity of a specific shape, not just the final value.
 */
function alphaAt(calls: Call[], pred: (c: Call) => boolean): number | undefined {
  let alpha = 1;
  for (const c of calls) {
    if (c.op === 'set' && c.key === 'globalAlpha') alpha = c.value as number;
    if (pred(c)) return alpha;
  }
  return undefined;
}

/**
 * The `globalAlpha` in effect when a shape filled with `fillColor` is drawn.
 *
 * The renderer sets `fillStyle` immediately before filling, so the fill for a
 * specific color is located by its preceding `fillStyle` assignment. This pins a
 * draw-time alpha to a particular shape even when several shapes are filled in one
 * pass.
 */
function alphaAtFillOf(calls: Call[], fillColor: string): number | undefined {
  let alpha = 1;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c) continue;
    if (c.op === 'set' && c.key === 'globalAlpha') alpha = c.value as number;
    if (c.op === 'set' && c.key === 'fillStyle' && c.value === fillColor) {
      const fill = calls[i + 1];
      if (fill && fill.op === 'fillRect') return alpha;
    }
  }
  return undefined;
}

describe('renderer contract surface', () => {
  it('exposes the supported object types and error codes', () => {
    expect(SUPPORTED_OBJECT_TYPES).toEqual(['rectangle', 'circle', 'text']);
    expect(RENDERER_ERROR_CODES).toEqual([
      'unsupportedType',
      'missingProperty',
      'malformedProperty',
      'invalidContext',
    ]);
    expect(DEFAULT_STYLE.fill).toBe('#4f8cff');
    expect(HIGHLIGHT_STYLE.color).toBe('#ffcc00');
    expect(HIGHLIGHT_STYLE.lineWidth).toBe(3);
    expect(HIGHLIGHT_STYLE.pad).toBe(4);
  });

  it('isRendererError guards the error type', () => {
    expect(isRendererError(new RendererError({ code: 'unsupportedType', message: 'x' }))).toBe(
      true,
    );
    expect(isRendererError(new Error('x'))).toBe(false);
    expect(isRendererError('x')).toBe(false);
  });
});

describe('renderScene — clearing', () => {
  it('clears to a background fill when one is supplied', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([]), { width: 100, height: 50, background: '#000000' });
    expect(ctx.calls).toEqual([
      { op: 'set', key: 'fillStyle', value: '#000000' },
      { op: 'fillRect', x: 0, y: 0, width: 100, height: 50 },
    ]);
  });

  it('clears to transparent via clearRect when no background is given', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([]), { width: 80, height: 40 });
    expect(ops(ctx.calls)).toEqual([{ op: 'clearRect', x: 0, y: 0, width: 80, height: 40 }]);
  });

  it('does not clear when clear is false', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([]), { width: 80, height: 40, clear: false });
    expect(ctx.calls).toEqual([]);
  });

  it('does not clear and does not draw when the scene is empty and clear is false', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([]), { width: 10, height: 10, clear: false });
    expect(ctx.calls).toEqual([]);
  });
});

describe('renderScene — rectangle', () => {
  it('fills a centered rectangle with the default fill', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('r', 'rectangle', { width: 40, height: 20 })]), {
      width: 100,
      height: 100,
    });
    // fillStyle default then fillRect at the centered (-w/2, -h/2).
    expect(ctx.fillStyle).toBe('#4f8cff');
    const fill = ctx.calls.find((c) => c.op === 'fillRect');
    expect(fill).toEqual({ op: 'fillRect', x: -20, y: -10, width: 40, height: 20 });
  });

  it('does not stroke a rectangle when no stroke is given', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 })]), {
      width: 50,
      height: 50,
    });
    expect(ctx.calls.some((c) => c.op === 'strokeRect')).toBe(false);
  });

  it('strokes a rectangle when a stroke color is given', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 10, height: 10, stroke: '#000' })]),
      {
        width: 50,
        height: 50,
      },
    );
    const stroke = ctx.calls.find((c) => c.op === 'strokeRect');
    expect(stroke).toEqual({ op: 'strokeRect', x: -5, y: -5, width: 10, height: 10 });
    expect(ctx.strokeStyle).toBe('#000');
  });

  it('passes a lineWidth property to the canvas context', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 10, height: 10, stroke: '#000', lineWidth: 5 })]),
      {
        width: 50,
        height: 50,
      },
    );
    // The stroke width is read from the object's `lineWidth` property.
    expect(ctx.lineWidth).toBe(5);
  });

  it('translates to the object position before drawing', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 }, { position: { x: 30, y: 20 } })]),
      { width: 100, height: 100 },
    );
    // translate happens inside the saved state, after the clear.
    expect(ctx.calls).toContainEqual({ op: 'translate', x: 30, y: 20 });
  });

  it('throws missingProperty when width is absent', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('r', 'rectangle', { height: 10 })]), {
        width: 50,
        height: 50,
      }),
    ).toThrowError(/width/);
  });

  it('throws malformedProperty when width is non-positive', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('r', 'rectangle', { width: 0, height: 10 })]), {
        width: 50,
        height: 50,
      }),
    ).toThrowError(/positive/);
  });

  it('throws malformedProperty when width is non-numeric', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('r', 'rectangle', { width: 'wide', height: 10 })]), {
        width: 50,
        height: 50,
      }),
    ).toThrowError(/finite number/);
  });

  it('reports the offending object id and property in the error', () => {
    const ctx = new MockContext();
    try {
      renderScene(ctx, sceneOf([evObj('box1', 'rectangle', {})]), { width: 50, height: 50 });
      throw new Error('expected a throw');
    } catch (err) {
      if (!isRendererError(err)) throw err;
      expect(err.objectId).toBe('box1');
      expect(err.objectType).toBe('rectangle');
      expect(err.property).toBe('width');
      expect(err.code).toBe('missingProperty');
    }
  });
});

describe('renderScene — circle', () => {
  it('fills a centered circle via an arc of the given radius', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('c', 'circle', { radius: 12 })]), { width: 50, height: 50 });
    const arc = ctx.calls.find((c) => c.op === 'arc');
    expect(arc).toEqual({
      op: 'arc',
      x: 0,
      y: 0,
      radius: 12,
      startAngle: 0,
      endAngle: Math.PI * 2,
    });
    expect(ctx.calls.some((c) => c.op === 'fill')).toBe(true);
  });

  it('strokes a circle when a stroke color is given', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('c', 'circle', { radius: 8, stroke: '#f00' })]), {
      width: 50,
      height: 50,
    });
    expect(ctx.calls.some((c) => c.op === 'stroke')).toBe(true);
    expect(ctx.strokeStyle).toBe('#f00');
  });

  it('throws missingProperty when radius is absent', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('c', 'circle', {})]), { width: 50, height: 50 }),
    ).toThrowError(/radius/);
  });

  it('throws malformedProperty when radius is non-positive', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('c', 'circle', { radius: -5 })]), { width: 50, height: 50 }),
    ).toThrowError(/positive/);
  });
});

describe('renderScene — text', () => {
  it('fills text with the default font and color', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('t', 'text', { text: 'hello' })]), { width: 50, height: 50 });
    expect(ctx.font).toBe('16px sans-serif');
    expect(ctx.fillStyle).toBe('#111111');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
    expect(ctx.calls.some((c) => c.op === 'fillText' && c.text === 'hello')).toBe(true);
  });

  it('composes the font from a fontSize and fontFamily', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('t', 'text', { text: 'hi', fontSize: 32, fontFamily: 'serif' })]),
      { width: 50, height: 50 },
    );
    expect(ctx.font).toBe('32px serif');
  });

  it('throws missingProperty when text is absent', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('t', 'text', {})]), { width: 50, height: 50 }),
    ).toThrowError(/text/);
  });

  it('throws malformedProperty when text is not a string', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('t', 'text', { text: 42 })]), { width: 50, height: 50 }),
    ).toThrowError(/must be a string/);
  });

  it('fills text with its color property, not fill', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('t', 'text', { text: 'hi', color: '#00ff00' })]), {
      width: 50,
      height: 50,
      clear: false,
    });
    // Text color is read from the `color` property; a `fill` property is ignored.
    expect(ctx.fillStyle).toBe('#00ff00');
  });
});

describe('renderScene — unsupported type', () => {
  it('throws unsupportedType for an unknown object type', () => {
    const ctx = new MockContext();
    expect(() =>
      renderScene(ctx, sceneOf([evObj('x', 'triangle', { width: 10, height: 10 })]), {
        width: 50,
        height: 50,
      }),
    ).toThrowError(/unsupported/);
  });

  it('reports the offending type in the error', () => {
    const ctx = new MockContext();
    try {
      renderScene(ctx, sceneOf([evObj('x', 'triangle', {})]), { width: 50, height: 50 });
      throw new Error('expected a throw');
    } catch (err) {
      if (!isRendererError(err)) throw err;
      expect(err.code).toBe('unsupportedType');
      expect(err.objectType).toBe('triangle');
      expect(err.objectId).toBe('x');
    }
  });
});

describe('renderScene — visibility', () => {
  it('skips an invisible object and its subtree', () => {
    const ctx = new MockContext();
    const child = evObj('child', 'rectangle', { width: 10, height: 10 });
    const parent = evObj('parent', 'rectangle', { width: 10, height: 10 }, { visible: false }, [
      child,
    ]);
    renderScene(ctx, sceneOf([parent]), { width: 50, height: 50, clear: false });
    // No save, no fill: the invisible parent draws nothing and skips its child.
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(false);
    expect(ctx.calls.some((c) => c.op === 'save')).toBe(false);
  });

  it('draws a visible parent and its visible child', () => {
    const ctx = new MockContext();
    const child = evObj('child', 'circle', { radius: 5 }, { position: { x: 10, y: 0 } });
    const parent = evObj('parent', 'rectangle', { width: 20, height: 20 }, undefined, [child]);
    renderScene(ctx, sceneOf([parent]), { width: 100, height: 100, clear: false });
    // Parent rectangle, then child circle.
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'arc')).toBe(true);
    // Child translates relative to the (already translated) parent origin.
    expect(ctx.calls).toContainEqual({ op: 'translate', x: 10, y: 0 });
  });
});

describe('renderScene — opacity composition', () => {
  it('sets globalAlpha to the object opacity when present', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 }, { opacity: 0.5 })]),
      {
        width: 50,
        height: 50,
        clear: false,
      },
    );
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it('multiplies parent and child opacity', () => {
    const ctx = new MockContext();
    const child = evObj('child', 'circle', { radius: 5 }, { opacity: 0.5 });
    const parent = evObj('parent', 'rectangle', { width: 10, height: 10 }, { opacity: 0.5 }, [
      child,
    ]);
    renderScene(ctx, sceneOf([parent]), { width: 100, height: 100, clear: false });
    // The child's final alpha is parent * child = 0.25.
    expect(ctx.globalAlpha).toBe(0.25);
  });

  it('leaves globalAlpha at 1 when no opacity is given', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 })]), {
      width: 50,
      height: 50,
      clear: false,
    });
    expect(ctx.globalAlpha).toBe(1);
  });

  it('composes opacity across three nested levels', () => {
    const ctx = new MockContext();
    const grandchild = evObj('gc', 'circle', { radius: 5 }, { opacity: 0.5 });
    const child = evObj('child', 'rectangle', { width: 10, height: 10 }, { opacity: 0.5 }, [
      grandchild,
    ]);
    const parent = evObj('parent', 'rectangle', { width: 10, height: 10 }, { opacity: 0.5 }, [
      child,
    ]);
    renderScene(ctx, sceneOf([parent]), { width: 100, height: 100, clear: false });
    // The grandchild's draw-time alpha is parent * child * grandchild = 0.125.
    expect(alphaAt(ctx.calls, (c) => c.op === 'arc')).toBe(0.125);
  });

  it('does not render a nested object under an invisible parent', () => {
    const ctx = new MockContext();
    const child = evObj('child', 'circle', { radius: 5 }, { opacity: 0.5 });
    const parent = evObj('parent', 'rectangle', { width: 10, height: 10 }, { visible: false }, [
      child,
    ]);
    renderScene(ctx, sceneOf([parent]), { width: 50, height: 50, clear: false });
    // Neither the invisible parent nor its child is drawn.
    expect(ctx.calls.some((c) => c.op === 'fillRect' || c.op === 'arc')).toBe(false);
    expect(alphaAt(ctx.calls, (c) => c.op === 'arc')).toBeUndefined();
  });

  it('does not let siblings inherit each other opacity', () => {
    const ctx = new MockContext();
    const faded = evObj(
      'faded',
      'rectangle',
      { width: 10, height: 10, fill: '#ff0000' },
      { opacity: 0.5 },
    );
    const sibling = evObj('sibling', 'rectangle', { width: 10, height: 10, fill: '#00ff00' });
    renderScene(ctx, sceneOf([faded, sibling]), { width: 100, height: 100, clear: false });
    // The opaque sibling starts its own draw at parent alpha 1, unaffected by its
    // faded neighbor.
    expect(alphaAtFillOf(ctx.calls, '#00ff00')).toBe(1);
  });

  it('starts each top-level object at parent alpha 1', () => {
    const ctx = new MockContext();
    const faded = evObj(
      'faded',
      'rectangle',
      { width: 10, height: 10, fill: '#ff0000' },
      { opacity: 0.5 },
    );
    const sibling = evObj('sibling', 'rectangle', { width: 10, height: 10, fill: '#00ff00' });
    renderScene(ctx, sceneOf([faded, sibling]), { width: 100, height: 100, clear: false });
    // The second top-level object is not inside the first one, so its parent alpha
    // is 1.
    expect(alphaAtFillOf(ctx.calls, '#00ff00')).toBe(1);
  });
});

describe('renderScene — highlighting', () => {
  it('draws a padded outline for a highlighted rectangle', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 20, height: 10 }, { highlighted: true })]),
      { width: 50, height: 50, clear: false },
    );
    // The highlight stroke is the outermost strokeRect, padded by HIGHLIGHT_STYLE.pad.
    const strokes = ctx.calls.filter((c) => c.op === 'strokeRect');
    expect(strokes.length).toBe(1);
    const stroke = strokes[0]!;
    expect(stroke).toEqual({
      op: 'strokeRect',
      x: -14,
      y: -9,
      width: 28,
      height: 18,
    });
    expect(ctx.strokeStyle).toBe(HIGHLIGHT_STYLE.color);
    expect(ctx.lineWidth).toBe(HIGHLIGHT_STYLE.lineWidth);
  });

  it('draws a larger outline for a highlighted circle', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('c', 'circle', { radius: 10 }, { highlighted: true })]), {
      width: 50,
      height: 50,
      clear: false,
    });
    const arcs = ctx.calls.filter((c) => c.op === 'arc');
    // Two arcs: the fill and the highlight (radius + pad).
    expect(arcs.length).toBe(2);
    expect(arcs[1]!.radius).toBe(10 + HIGHLIGHT_STYLE.pad);
  });

  it('outlines highlighted text via strokeText', () => {
    const ctx = new MockContext();
    renderScene(ctx, sceneOf([evObj('t', 'text', { text: 'hi' }, { highlighted: true })]), {
      width: 50,
      height: 50,
      clear: false,
    });
    expect(ctx.calls.some((c) => c.op === 'strokeText')).toBe(true);
    expect(ctx.strokeStyle).toBe(HIGHLIGHT_STYLE.color);
  });

  it('uses the render option highlight color when the object has none', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 }, { highlighted: true })]),
      {
        width: 50,
        height: 50,
        clear: false,
        highlightColor: '#00ff00',
      },
    );
    expect(ctx.strokeStyle).toBe('#00ff00');
  });

  it('prefers the object highlight color over the render option', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([
        evObj(
          'r',
          'rectangle',
          { width: 10, height: 10 },
          { highlighted: true, highlightColor: '#abcdef' },
        ),
      ]),
      { width: 50, height: 50, clear: false, highlightColor: '#00ff00' },
    );
    expect(ctx.strokeStyle).toBe('#abcdef');
  });

  it('ignores a non-string object highlight color and falls back to the default', () => {
    const ctx = new MockContext();
    renderScene(
      ctx,
      sceneOf([
        evObj(
          'r',
          'rectangle',
          { width: 10, height: 10 },
          {
            highlighted: true,
            highlightColor: 42,
          },
        ),
      ]),
      { width: 50, height: 50, clear: false },
    );
    expect(ctx.strokeStyle).toBe(HIGHLIGHT_STYLE.color);
  });
});

describe('renderScene — save/restore and idempotency', () => {
  it('balances a save and restore per visible object', () => {
    const ctx = new MockContext();
    const child = evObj('child', 'circle', { radius: 5 });
    const parent = evObj('parent', 'rectangle', { width: 10, height: 10 }, undefined, [child]);
    renderScene(ctx, sceneOf([parent]), { width: 50, height: 50, clear: false });
    const saves = ctx.calls.filter((c) => c.op === 'save').length;
    const restores = ctx.calls.filter((c) => c.op === 'restore').length;
    expect(saves).toBe(2);
    expect(restores).toBe(2);
    expect(saves).toBe(restores);
  });

  it('does not mutate the input scene', () => {
    const objects = [evObj('r', 'rectangle', { width: 10, height: 10 })];
    const scene = sceneOf(objects);
    const before = JSON.parse(JSON.stringify(scene)) as SceneVisualState;
    const ctx = new MockContext();
    renderScene(ctx, scene, { width: 50, height: 50 });
    expect(scene).toEqual(before);
  });

  it('renders the same scene twice with identical command sequences', () => {
    const objects = [evObj('r', 'rectangle', { width: 10, height: 10 })];
    const scene = sceneOf(objects);
    const a = new MockContext();
    const b = new MockContext();
    renderScene(a, scene, { width: 50, height: 50 });
    renderScene(b, scene, { width: 50, height: 50 });
    expect(b.calls).toEqual(a.calls);
  });

  it('does not carry drawing state between two independent renders', () => {
    const scene = sceneOf([evObj('r', 'rectangle', { width: 10, height: 10 })]);
    const a = new MockContext();
    const b = new MockContext();
    renderScene(a, scene, { width: 50, height: 50 });
    renderScene(b, scene, { width: 50, height: 50 });
    // Each render starts fresh; the second context has its own, matching sequence.
    expect(b.calls).toEqual(a.calls);
    expect(b.calls.length).toBeGreaterThan(0);
  });
});

describe('renderScene — driven by the evaluation pipeline', () => {
  // The renderer is the last stage of the pipeline: schedule a core `Scene`,
  // evaluate a frame, and draw it. These pin that a `move` operation's effect on
  // an object reaches the surface as the translation the renderer applies, and
  // that advancing the clock advances that translation.

  /** A scene whose single `move` sweeps a rectangle from the origin to (100, 50). */
  function sweepScene(): Scene {
    return {
      id: 'sweep',
      duration: 1,
      objects: [
        {
          id: 'rect',
          type: 'rectangle',
          state: {
            position: { x: 0, y: 0 },
            properties: { width: 10, height: 10, fill: '#4f8cff' },
          },
          children: [],
        },
      ],
      timeline: {
        nodes: [
          {
            kind: 'sequence',
            startAt: 0,
            operations: [
              { id: 'm', type: 'move', target: 'rect', duration: 1, params: { x: 100, y: 50 } },
            ],
          },
        ],
      },
    };
  }

  it('translates a rectangle to the position a move operation produces', () => {
    const scene = sweepScene();
    const schedule = scheduleTimeline(scene.timeline);
    // At 0.5 the move interpolates the origin to (100, 50), giving (50, 25).
    const frame = evaluateSceneAt(scene, schedule, 0.5);
    expect(frame.ok).toBe(true);
    if (!frame.ok) throw new Error('expected ok');
    const ctx = new MockContext();
    renderScene(ctx, frame.state, { width: 200, height: 200 });
    // The renderer issues a translation to the frame's evaluated position.
    expect(ctx.calls).toContainEqual({ op: 'translate', x: 50, y: 25 });
  });

  it('advances the translation as the clock advances', () => {
    const scene = sweepScene();
    const schedule = scheduleTimeline(scene.timeline);
    const early = evaluateSceneAt(scene, schedule, 0.25);
    const late = evaluateSceneAt(scene, schedule, 0.75);
    expect(early.ok).toBe(true);
    expect(late.ok).toBe(true);
    if (!early.ok || !late.ok) throw new Error('expected ok');
    const earlyCtx = new MockContext();
    const lateCtx = new MockContext();
    renderScene(earlyCtx, early.state, { width: 200, height: 200 });
    renderScene(lateCtx, late.state, { width: 200, height: 200 });
    // 0.25 -> (25, 12.5); 0.75 -> (75, 37.5). The later frame translates further.
    expect(earlyCtx.calls).toContainEqual({ op: 'translate', x: 25, y: 12.5 });
    expect(lateCtx.calls).toContainEqual({ op: 'translate', x: 75, y: 37.5 });
  });

  it('does not mutate the scene across a schedule/evaluate/render pass', () => {
    const scene = sweepScene();
    const before = JSON.parse(JSON.stringify(scene)) as Scene;
    const schedule = scheduleTimeline(scene.timeline);
    const frame = evaluateSceneAt(scene, schedule, 0.5);
    expect(frame.ok).toBe(true);
    if (!frame.ok) throw new Error('expected ok');
    renderScene(new MockContext(), frame.state, { width: 200, height: 200 });
    expect(scene).toEqual(before);
  });
});
