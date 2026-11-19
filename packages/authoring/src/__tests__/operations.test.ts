import { describe, expect, it } from 'vitest';
import { AuthoringError, highlight, move, set, setVisible } from '../index';

/**
 * Behavioural tests for the operation builders: {@link move}, {@link set},
 * {@link highlight}, {@link setVisible}.
 *
 * Each builder produces a core {@link Operation} carrying exactly the fields the
 * caller supplied (a missing `params`/`easing`/`extensions` stays absent), and
 * throws an {@link AuthoringError} at authoring time on a malformed input.
 */

describe('move', () => {
  it('produces a move operation with x/y params', () => {
    const op = move('m1', 'box', { x: 10, y: 20 }, 2);
    expect(op).toEqual({
      id: 'm1',
      type: 'move',
      target: 'box',
      duration: 2,
      params: { x: 10, y: 20 },
    });
  });

  it('threads easing and extensions onto the operation', () => {
    const op = move('m1', 'box', { x: 1, y: 2 }, 1, {
      easing: 'ease-in-out',
      extensions: { vendor: true },
    });
    expect(op.easing).toBe('ease-in-out');
    expect(op.extensions).toEqual({ vendor: true });
  });

  it('rejects a non-finite coordinate', () => {
    expect(() => move('m1', 'box', { x: Number.NaN, y: 1 }, 1)).toThrow(AuthoringError);
    expect(() => move('m1', 'box', { x: 1, y: Infinity }, 1)).toThrow(AuthoringError);
  });

  it('rejects a negative duration', () => {
    expect(() => move('m1', 'box', { x: 1, y: 1 }, -1)).toThrow(AuthoringError);
  });

  it('rejects an empty id or target', () => {
    expect(() => move('', 'box', { x: 1, y: 1 }, 1)).toThrow(AuthoringError);
    expect(() => move('m1', '', { x: 1, y: 1 }, 1)).toThrow(AuthoringError);
  });
});

describe('set', () => {
  it('produces a set operation with name/value params', () => {
    const op = set('s1', 'box', 'opacity', 0.5, 1);
    expect(op).toEqual({
      id: 's1',
      type: 'set',
      target: 'box',
      duration: 1,
      params: { name: 'opacity', value: 0.5 },
    });
  });

  it('accepts a JSON value of any kind', () => {
    expect(set('s1', 'box', 'fill', '#123456', 0).params).toEqual({
      name: 'fill',
      value: '#123456',
    });
    expect(set('s1', 'box', 'n', [1, 2], 0).params).toEqual({ name: 'n', value: [1, 2] });
  });

  it('rejects an empty property name', () => {
    expect(() => set('s1', 'box', '', 0, 1)).toThrow(AuthoringError);
  });

  it('rejects a negative duration', () => {
    expect(() => set('s1', 'box', 'opacity', 1, -0.5)).toThrow(AuthoringError);
  });
});

describe('highlight', () => {
  it('defaults to an instantaneous highlight with no params', () => {
    expect(highlight('h1', 'box')).toEqual({
      id: 'h1',
      type: 'highlight',
      target: 'box',
      duration: 0,
    });
  });

  it('carries a color into params when given', () => {
    const op = highlight('h1', 'box', { color: '#ff0', duration: 0.5 });
    expect(op.params).toEqual({ color: '#ff0' });
    expect(op.duration).toBe(0.5);
  });

  it('rejects a negative duration', () => {
    expect(() => highlight('h1', 'box', { duration: -1 })).toThrow(AuthoringError);
  });
});

describe('setVisible', () => {
  it('defaults to a visible, instantaneous toggle', () => {
    expect(setVisible('v1', 'box')).toEqual({
      id: 'v1',
      type: 'setVisible',
      target: 'box',
      duration: 0,
      params: { visible: true },
    });
  });

  it('honours an explicit visible flag', () => {
    expect(setVisible('v1', 'box', { visible: false }).params).toEqual({ visible: false });
  });

  it('carries a duration when given', () => {
    expect(setVisible('v1', 'box', { duration: 1 }).duration).toBe(1);
  });
});
