import { describe, expect, it } from 'vitest';
import type { Operation, Sequence, Parallel } from '@choreobit/core';
import { AuthoringError, move, parallel, sequence } from '../index';

/**
 * Behavioural tests for the composition builders: {@link sequence} and
 * {@link parallel}.
 *
 * Both copy the operations array so a caller may keep mutating its own list, and
 * both reject a non-finite or negative `startAt`.
 */

const op = (id: string): Operation => ({
  id,
  type: 'move',
  target: 'x',
  duration: 1,
  params: { x: 1, y: 1 },
});

describe('sequence', () => {
  it('runs operations back-to-back starting at startAt', () => {
    const node = sequence(2, op('a'), op('b'));
    expect(node).toEqual({ kind: 'sequence', startAt: 2, operations: [op('a'), op('b')] });
  });

  it('defaults startAt to 0', () => {
    expect(sequence(0, op('a'))).toEqual({ kind: 'sequence', startAt: 0, operations: [op('a')] });
  });

  it('allows an empty sequence', () => {
    const node = sequence(0);
    expect(node.kind).toBe('sequence');
    expect(node.operations).toEqual([]);
  });

  it('copies the operations array', () => {
    const ops: Operation[] = [op('a')];
    const node = sequence(0, ...ops);
    ops.push(op('b'));
    expect(node.operations).toHaveLength(1);
  });

  it('rejects a negative startAt', () => {
    expect(() => sequence(-1, op('a'))).toThrow(AuthoringError);
  });

  it('rejects a non-finite startAt', () => {
    expect(() => sequence(Number.NaN, op('a'))).toThrow(AuthoringError);
  });

  it('is a Sequence node', () => {
    const node: Sequence = sequence(0, op('a'));
    expect(node.kind).toBe('sequence');
  });
});

describe('parallel', () => {
  it('runs operations together at startAt', () => {
    const node = parallel(1, op('a'), op('b'));
    expect(node).toEqual({ kind: 'parallel', startAt: 1, operations: [op('a'), op('b')] });
  });

  it('defaults startAt to 0', () => {
    expect(parallel(0, op('a'))).toEqual({ kind: 'parallel', startAt: 0, operations: [op('a')] });
  });

  it('copies the operations array', () => {
    const ops: Operation[] = [op('a')];
    const node = parallel(0, ...ops);
    ops.push(op('b'));
    expect(node.operations).toHaveLength(1);
  });

  it('rejects a negative startAt', () => {
    expect(() => parallel(-1, op('a'))).toThrow(AuthoringError);
  });

  it('is a Parallel node', () => {
    const node: Parallel = parallel(0, op('a'));
    expect(node.kind).toBe('parallel');
  });
});

describe('composition with move', () => {
  it('nests a move operation inside a sequence', () => {
    const node = sequence(0, move('m1', 'box', { x: 10, y: 10 }, 2));
    expect(node.kind).toBe('sequence');
    expect(node.operations[0]?.type).toBe('move');
    expect(node.operations[0]?.duration).toBe(2);
  });
});
