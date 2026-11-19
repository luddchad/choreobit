import { describe, expect, it } from 'vitest';
import type { SemanticStep } from '@choreobit/core';
import { AuthoringError, semanticStep, sourceCode } from '../index';

/**
 * Behavioural tests for {@link semanticStep} and {@link sourceCode}.
 *
 * A semantic step is a meaningful unit of an algorithm that may span many
 * frames; it names its scene, its `start`/`end` window on that scene, the
 * operation ids it drives, and the source locations it maps to. A source-code
 * entry attaches the code a student reads alongside the animation.
 */

describe('semanticStep', () => {
  it('builds a step driving a single operation', () => {
    const step = semanticStep('step-1', {
      sceneId: 'scene-1',
      description: 'move the box right',
      start: 0,
      end: 1,
      operations: ['move-1'],
    });
    expect(step).toEqual({
      id: 'step-1',
      sceneId: 'scene-1',
      description: 'move the box right',
      start: 0,
      end: 1,
      operations: ['move-1'],
    });
  });

  it('allows a non-visual step with no operations', () => {
    const step = semanticStep('think', {
      sceneId: 's',
      description: 'consider the case',
      start: 0,
      end: 2,
      operations: [],
    });
    expect(step.operations).toEqual([]);
  });

  it('drives several operations over a window', () => {
    const step = semanticStep('s1', {
      sceneId: 'scene',
      description: 'a and b together',
      start: 1,
      end: 3,
      operations: ['op-a', 'op-b'],
    });
    expect(step.operations).toEqual(['op-a', 'op-b']);
    expect(step.start).toBe(1);
    expect(step.end).toBe(3);
  });

  it('maps to source locations', () => {
    const step = semanticStep('s1', {
      sceneId: 'scene',
      description: 'a',
      start: 0,
      end: 1,
      operations: ['op-a'],
      sourceLocations: [{ line: 10, column: 3 }, { line: 12 }],
    });
    expect(step.sourceLocations).toEqual([{ line: 10, column: 3 }, { line: 12 }]);
  });

  it('copies operations and source locations', () => {
    const ops = ['op-a'];
    const locations = [{ line: 1 }];
    const step = semanticStep('s1', {
      sceneId: 'scene',
      description: 'a',
      start: 0,
      end: 1,
      operations: ops,
      sourceLocations: locations,
    });
    ops.push('op-b');
    locations.push({ line: 2 });
    expect(step.operations).toEqual(['op-a']);
    expect(step.sourceLocations).toEqual([{ line: 1 }]);
  });

  it('rejects a step whose start exceeds its end', () => {
    expect(() =>
      semanticStep('s1', {
        sceneId: 'scene',
        description: 'a',
        start: 5,
        end: 1,
        operations: [],
      }),
    ).toThrow(AuthoringError);
  });

  it('allows start equal to end', () => {
    const step = semanticStep('s1', {
      sceneId: 'scene',
      description: 'instant',
      start: 2,
      end: 2,
      operations: [],
    });
    expect(step.start).toBe(step.end);
  });

  it('rejects a negative start', () => {
    expect(() =>
      semanticStep('s1', {
        sceneId: 'scene',
        description: 'a',
        start: -1,
        end: 1,
        operations: [],
      }),
    ).toThrow(AuthoringError);
  });

  it('rejects an empty scene id', () => {
    expect(() =>
      semanticStep('s1', { sceneId: '', description: 'a', start: 0, end: 1, operations: [] }),
    ).toThrow(AuthoringError);
  });

  it('rejects an empty description', () => {
    expect(() =>
      semanticStep('s1', { sceneId: 's', description: '', start: 0, end: 1, operations: [] }),
    ).toThrow(AuthoringError);
  });

  it('rejects a non-string operation id', () => {
    expect(() =>
      semanticStep('s1', {
        sceneId: 's',
        description: 'a',
        start: 0,
        end: 1,
        operations: ['ok', ''] as unknown as readonly string[],
      }),
    ).toThrow(AuthoringError);
  });

  it('produces a SemanticStep typed value', () => {
    const step: SemanticStep = semanticStep('s1', {
      sceneId: 's',
      description: 'a',
      start: 0,
      end: 1,
      operations: [],
    });
    expect(step.id).toBe('s1');
  });
});

describe('sourceCode', () => {
  it('builds a source-code entry with inlined content', () => {
    const src = sourceCode({ language: 'python', content: 'x = 1', filename: 'demo.py' });
    expect(src).toEqual({ language: 'python', content: 'x = 1', filename: 'demo.py' });
  });

  it('supports an external reference instead of content', () => {
    const src = sourceCode({ language: 'java', reference: 'repo://Main.java' });
    expect(src).toEqual({ language: 'java', reference: 'repo://Main.java' });
  });

  it('copies the extensions map', () => {
    const extensions = { vendor: 'x' };
    const src = sourceCode({ language: 'ts', extensions });
    extensions.vendor = 'y';
    expect(src.extensions).toEqual({ vendor: 'x' });
  });

  it('rejects an empty language', () => {
    expect(() => sourceCode({ language: '' })).toThrow(AuthoringError);
  });
});
