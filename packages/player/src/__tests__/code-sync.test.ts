import { describe, expect, it } from 'vitest';
import type { SemanticStep, SemanticSteps, SourceLocation } from '@choreobit/core';
import {
  CodeSyncError,
  createCodeSyncResolver,
  isCodeSyncError,
  resolveCodeSync,
  resolveSteps,
  type CodeSyncResolution,
} from '../index';

/**
 * Code-synchronizer tests.
 *
 * These exercise the pure `resolveCodeSync` mapping and its companion forms. The
 * resolver owns no clock or state, so a test fixes the steps and a time and
 * asserts the active steps and locations exactly — no scheduler, no browser.
 */

/** Build a `SemanticStep` with sensible defaults and the given overrides. */
function step(overrides: Partial<SemanticStep> & Pick<SemanticStep, 'id'>): SemanticStep {
  return {
    sceneId: 'scene',
    description: overrides.id,
    start: 0,
    end: 1,
    operations: [],
    ...overrides,
  };
}

/** A source location shorthand. */
function loc(line: number, extra?: Partial<Omit<SourceLocation, 'line'>>): SourceLocation {
  return { line, ...extra };
}

describe('CodeSyncError', () => {
  it('is an Error with name and code "invalid"', () => {
    const error = new CodeSyncError('boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CodeSyncError');
    expect(error.code).toBe('invalid');
    expect(error.message).toBe('boom');
  });

  it('carries a cause when supplied', () => {
    const cause = new Error('root');
    const error = new CodeSyncError('boom', { cause });
    expect(error.cause).toBe(cause);
  });

  it('is recognised by isCodeSyncError and not for a plain error', () => {
    expect(isCodeSyncError(new CodeSyncError('x'))).toBe(true);
    expect(isCodeSyncError(new Error('x'))).toBe(false);
    expect(isCodeSyncError(null)).toBe(false);
  });
});

describe('resolveCodeSync — interval semantics', () => {
  it('is active at a step start (half-open lower bound inclusive)', () => {
    const steps = [step({ id: 'a', start: 0, end: 1 })];
    expect(resolveCodeSync(steps, undefined, 0).activeStepIds).toEqual(['a']);
  });

  it('is inactive at a step end (half-open upper bound exclusive)', () => {
    const steps = [step({ id: 'a', start: 0, end: 1 })];
    expect(resolveCodeSync(steps, undefined, 1).activeStepIds).toEqual([]);
  });

  it('is active just before the end', () => {
    const steps = [step({ id: 'a', start: 0, end: 1 })];
    expect(resolveCodeSync(steps, undefined, 0.999).activeStepIds).toEqual(['a']);
  });

  it('never activates a zero-duration step', () => {
    const steps = [step({ id: 'a', start: 0.5, end: 0.5 })];
    expect(resolveCodeSync(steps, undefined, 0.5).activeStepIds).toEqual([]);
    expect(resolveCodeSync(steps, undefined, 0.499).activeStepIds).toEqual([]);
    expect(resolveCodeSync(steps, undefined, 0.501).activeStepIds).toEqual([]);
  });

  it('is inactive before the first step', () => {
    const steps = [step({ id: 'a', start: 0.5, end: 1.5 })];
    expect(resolveCodeSync(steps, undefined, 0.4).activeStepIds).toEqual([]);
  });

  it('is inactive after the last step', () => {
    const steps = [step({ id: 'a', start: 0.5, end: 1.5 })];
    expect(resolveCodeSync(steps, undefined, 1.6).activeStepIds).toEqual([]);
  });

  it('is inactive in a gap between non-overlapping steps', () => {
    const steps = [step({ id: 'a', start: 0, end: 1 }), step({ id: 'b', start: 2, end: 3 })];
    expect(resolveCodeSync(steps, undefined, 1.5).activeStepIds).toEqual([]);
  });

  it('activates both overlapping steps', () => {
    const steps = [step({ id: 'a', start: 0, end: 2 }), step({ id: 'b', start: 1, end: 3 })];
    expect(resolveCodeSync(steps, undefined, 1.5).activeStepIds).toEqual(['a', 'b']);
  });

  it('keeps active steps in declared order', () => {
    const steps = [
      step({ id: 'first', start: 0, end: 5 }),
      step({ id: 'second', start: 0, end: 5 }),
      step({ id: 'third', start: 0, end: 5 }),
    ];
    expect(resolveCodeSync(steps, undefined, 2.5).activeStepIds).toEqual([
      'first',
      'second',
      'third',
    ]);
  });
});

describe('resolveCodeSync — location mapping', () => {
  it('collects the locations of the active step', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(5), loc(6)] })];
    const result = resolveCodeSync(steps, undefined, 0.5);
    expect(result.activeLocations.map((l) => l.line)).toEqual([5, 6]);
  });

  it('emits no locations for a step that has none', () => {
    const steps = [step({ id: 'a', start: 0, end: 1 })];
    const result = resolveCodeSync(steps, undefined, 0.5);
    expect(result.activeStepIds).toEqual(['a']);
    expect(result.activeLocations).toEqual([]);
  });

  it('de-duplicates identical locations across steps', () => {
    const steps = [
      step({ id: 'a', start: 0, end: 2, sourceLocations: [loc(6)] }),
      step({ id: 'b', start: 1, end: 3, sourceLocations: [loc(6)] }),
    ];
    const result = resolveCodeSync(steps, undefined, 1.5);
    expect(result.activeLocations.map((l) => l.line)).toEqual([6]);
  });

  it('keeps distinct locations that differ only by column', () => {
    const steps = [
      step({ id: 'a', start: 0, end: 2, sourceLocations: [loc(6, { column: 1 })] }),
      step({ id: 'b', start: 0, end: 2, sourceLocations: [loc(6, { column: 10 })] }),
    ];
    const result = resolveCodeSync(steps, undefined, 0.5);
    expect(result.activeLocations.map((l) => l.line)).toEqual([6, 6]);
    expect(result.activeLocations.map((l) => l.column)).toEqual([1, 10]);
  });

  it('sorts active locations by line then column', () => {
    const steps = [
      step({ id: 'a', start: 0, end: 2, sourceLocations: [loc(6, { column: 5 })] }),
      step({ id: 'b', start: 0, end: 2, sourceLocations: [loc(2, { column: 1 })] }),
      step({ id: 'c', start: 0, end: 2, sourceLocations: [loc(6, { column: 1 })] }),
    ];
    const result = resolveCodeSync(steps, undefined, 0.5);
    expect(result.activeLocations.map((l) => [l.line, l.column])).toEqual([
      [2, 1],
      [6, 1],
      [6, 5],
    ]);
  });

  it('carries a location description through the resolution', () => {
    const steps = [
      step({
        id: 'a',
        start: 0,
        end: 1,
        sourceLocations: [loc(6, { description: 'while low <= high' })],
      }),
    ];
    const result = resolveCodeSync(steps, undefined, 0.5);
    expect(result.activeLocations[0]?.description).toBe('while low <= high');
  });
});

describe('resolveCodeSync — scene scoping', () => {
  it('ignores steps bound to a different scene', () => {
    const steps = [
      step({ id: 'here', sceneId: 'scene-a', start: 0, end: 1, sourceLocations: [loc(1)] }),
      step({ id: 'other', sceneId: 'scene-b', start: 0, end: 1, sourceLocations: [loc(9)] }),
    ];
    const result = resolveCodeSync(steps, 'scene-a', 0.5);
    expect(result.activeStepIds).toEqual(['here']);
    expect(result.activeLocations.map((l) => l.line)).toEqual([1]);
  });

  it('includes a step whose sceneId is unset when scoping by scene', () => {
    const steps = [
      step({ id: 'here', sceneId: 'scene-a', start: 0, end: 1, sourceLocations: [loc(1)] }),
      {
        id: 'free',
        description: 'free',
        start: 0,
        end: 1,
        operations: [],
        sourceLocations: [loc(2)],
      } as unknown as SemanticStep,
    ];
    const result = resolveCodeSync(steps, 'scene-a', 0.5);
    expect(result.activeStepIds).toEqual(['here', 'free']);
    expect(result.activeLocations.map((l) => l.line)).toEqual([1, 2]);
  });

  it('resolves across all scenes when sceneId is undefined', () => {
    const steps = [
      step({ id: 'a', sceneId: 'scene-a', start: 0, end: 1 }),
      step({ id: 'b', sceneId: 'scene-b', start: 0, end: 1 }),
    ];
    expect(resolveCodeSync(steps, undefined, 0.5).activeStepIds).toEqual(['a', 'b']);
  });
});

describe('resolveCodeSync — validation', () => {
  it('throws for a non-finite time', () => {
    expect(() => resolveCodeSync([], undefined, Number.NaN)).toThrow(CodeSyncError);
    expect(() => resolveCodeSync([], undefined, Number.POSITIVE_INFINITY)).toThrow(CodeSyncError);
  });

  it('throws for a negative time', () => {
    expect(() => resolveCodeSync([], undefined, -1)).toThrow(CodeSyncError);
  });

  it('throws for a non-finite step start', () => {
    const steps = [step({ id: 'a', start: Number.NaN, end: 1 })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/start is not finite/);
  });

  it('throws for a negative step start', () => {
    const steps = [step({ id: 'a', start: -1, end: 1 })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/start is negative/);
  });

  it('throws for a non-finite step end', () => {
    const steps = [step({ id: 'a', start: 0, end: Number.NaN })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/end is not finite/);
  });

  it('throws for a negative step end', () => {
    const steps = [step({ id: 'a', start: 0, end: -1 })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/end is negative/);
  });

  it('throws when a step end precedes its start', () => {
    const steps = [step({ id: 'a', start: 2, end: 1 })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/precedes/);
  });

  it('throws for a non-positive step line', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(0)] })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/line is not a positive integer/);
  });

  it('throws for a non-integer step line', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(1.5)] })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/line is not a positive integer/);
  });

  it('throws for a non-positive location column', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(1, { column: 0 })] })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(
      /column is not a positive integer/,
    );
  });

  it('throws when an endLine precedes its line', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(5, { endLine: 3 })] })];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/endLine precedes/);
  });

  it('throws when an endColumn precedes its column on the same line', () => {
    const steps = [
      step({
        id: 'a',
        start: 0,
        end: 1,
        sourceLocations: [loc(5, { column: 10, endLine: 5, endColumn: 4 })],
      }),
    ];
    expect(() => resolveCodeSync(steps, undefined, 0.5)).toThrow(/endColumn precedes/);
  });

  it('does not validate a step scoped out by sceneId', () => {
    const steps = [step({ id: 'other', sceneId: 'other', start: Number.NaN, end: 1 })];
    expect(() => resolveCodeSync(steps, 'here', 0.5)).not.toThrow();
    expect(resolveCodeSync(steps, 'here', 0.5).activeStepIds).toEqual([]);
  });

  it('returns empty resolutions for empty steps', () => {
    expect(resolveCodeSync([], undefined, 0.5)).toEqual({ activeStepIds: [], activeLocations: [] });
  });
});

describe('resolveCodeSync — return shape', () => {
  it('returns fresh arrays that do not alias a prior result', () => {
    const steps = [step({ id: 'a', start: 0, end: 2, sourceLocations: [loc(1)] })];
    const first = resolveCodeSync(steps, undefined, 0.5);
    const second = resolveCodeSync(steps, undefined, 1.5);
    expect(first).not.toBe(second);
    expect(first.activeStepIds).not.toBe(second.activeStepIds);
    expect(first.activeLocations).not.toBe(second.activeLocations);
  });

  it('reports no active state at time 0 with no covering step', () => {
    const steps = [step({ id: 'a', start: 1, end: 2 })];
    expect(resolveCodeSync(steps, undefined, 0)).toEqual({
      activeStepIds: [],
      activeLocations: [],
    });
  });
});

describe('resolveSteps — container convenience', () => {
  it('resolves the steps of a SemanticSteps container', () => {
    const container: SemanticSteps = {
      steps: [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(3)] })],
    };
    expect(resolveSteps(container, undefined, 0.5).activeStepIds).toEqual(['a']);
  });

  it('scopes a container by scene id', () => {
    const container: SemanticSteps = {
      steps: [
        step({ id: 'a', sceneId: 'scene-a', start: 0, end: 1 }),
        step({ id: 'b', sceneId: 'scene-b', start: 0, end: 1 }),
      ],
    };
    expect(resolveSteps(container, 'scene-b', 0.5).activeStepIds).toEqual(['b']);
  });
});

describe('createCodeSyncResolver — factory', () => {
  it('resolves the same as the one-shot form', () => {
    const steps = [step({ id: 'a', start: 0, end: 1, sourceLocations: [loc(4)] })];
    const resolver = createCodeSyncResolver(steps, undefined);
    expect(resolver.resolve(0.5).activeStepIds).toEqual(['a']);
    expect(resolver.resolve(0.5).activeLocations.map((l) => l.line)).toEqual([4]);
    expect(resolver.resolve(1).activeStepIds).toEqual([]);
  });

  it('exposes its scene id', () => {
    const resolver = createCodeSyncResolver([], 'scene-x');
    expect(resolver.sceneId).toBe('scene-x');
  });

  it('scopes by scene id', () => {
    const steps = [
      step({ id: 'a', sceneId: 'scene-a', start: 0, end: 1, sourceLocations: [loc(1)] }),
      step({ id: 'b', sceneId: 'scene-b', start: 0, end: 1, sourceLocations: [loc(9)] }),
    ];
    const resolver = createCodeSyncResolver(steps, 'scene-b');
    expect(resolver.resolve(0.5).activeStepIds).toEqual(['b']);
  });

  it('validates eagerly at construction', () => {
    const steps = [step({ id: 'a', start: 2, end: 1 })];
    expect(() => createCodeSyncResolver(steps, undefined)).toThrow(CodeSyncError);
  });

  it('throws for a non-finite time on resolve', () => {
    const resolver = createCodeSyncResolver([], undefined);
    expect(() => resolver.resolve(Number.NaN)).toThrow(CodeSyncError);
    expect(() => resolver.resolve(-1)).toThrow(CodeSyncError);
  });

  it('returns a fresh resolution per call', () => {
    const resolver = createCodeSyncResolver([], undefined);
    expect(resolver.resolve(0)).not.toBe(resolver.resolve(0));
  });
});

describe('binary-search demonstration scenario', () => {
  // Mirrors the core contract fixture: initialise pointers, compute mid, narrow,
  // re-check, then report the result — with one step mapping to two lines and one
  // mapping to none.
  const steps: readonly SemanticStep[] = [
    step({
      id: 'step-init',
      sceneId: 'scene-search',
      start: 0,
      end: 0.5,
      sourceLocations: [loc(2, { endColumn: 28 })],
    }),
    step({
      id: 'step-mid',
      sceneId: 'scene-search',
      start: 0.5,
      end: 1.0,
      sourceLocations: [loc(5), loc(6)],
    }),
    step({ id: 'step-narrow', sceneId: 'scene-search', start: 1.0, end: 1.4 }),
    step({
      id: 'step-check',
      sceneId: 'scene-search',
      start: 1.4,
      end: 1.6,
      sourceLocations: [loc(6)],
    }),
    step({ id: 'step-result', sceneId: 'scene-result', start: 0, end: 0.6 }),
  ];

  it('maps the init beat to its single source line', () => {
    const result = resolveCodeSync(steps, 'scene-search', 0.25);
    expect(result.activeStepIds).toEqual(['step-init']);
    expect(result.activeLocations.map((l) => l.line)).toEqual([2]);
  });

  it('maps the mid beat to two source lines', () => {
    const result = resolveCodeSync(steps, 'scene-search', 0.75);
    expect(result.activeStepIds).toEqual(['step-mid']);
    expect(result.activeLocations.map((l) => l.line)).toEqual([5, 6]);
  });

  it('maps the narrowing beat to no source line but keeps it active', () => {
    const result = resolveCodeSync(steps, 'scene-search', 1.2);
    expect(result.activeStepIds).toEqual(['step-narrow']);
    expect(result.activeLocations).toEqual([]);
  });

  it('de-duplicates the re-check line with the earlier mid line', () => {
    const result = resolveCodeSync(steps, 'scene-search', 1.5);
    expect(result.activeStepIds).toEqual(['step-check']);
    expect(result.activeLocations.map((l) => l.line)).toEqual([6]);
  });

  it('scopes the result beat to its own scene', () => {
    const result: CodeSyncResolution = resolveCodeSync(steps, 'scene-result', 0.3);
    expect(result.activeStepIds).toEqual(['step-result']);
    expect(result.activeLocations).toEqual([]);
    expect(resolveCodeSync(steps, 'scene-search', 0.3).activeStepIds).not.toContain('step-result');
  });

  it('tracks the active lines across the whole scene', () => {
    const resolver = createCodeSyncResolver(steps, 'scene-search');
    const trace = [0, 0.25, 0.5, 0.75, 1.0, 1.2, 1.4, 1.5, 1.6].map((t) =>
      resolver.resolve(t).activeLocations.map((l) => l.line),
    );
    expect(trace).toEqual([[2], [2], [5, 6], [5, 6], [], [], [6], [6], []]);
  });
});
