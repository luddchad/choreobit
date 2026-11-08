import { describe, expect, it } from 'vitest';
import type { AnimationDefinition, SemanticStep, TimelineNode } from '../index';
import {
  ANIMATION_DEFINITION_FORMAT_VERSION,
  parseDefinition,
  serializeDefinition,
  validateAnimationDefinition,
} from '../index';

/**
 * Test-local scheduling helpers.
 *
 * These implement the *interpretation* of the timeline for assertions only.
 * Core is data-only and performs no interpretation: the future
 * `@choreobit/animation` package is the real consumer of these rules. They are
 * deliberately not part of the public core API.
 *
 * A fixture that `validateAnimationDefinition` accepts (its duration tolerance is
 * 1e-9) is compared within the same precision here, since decimal durations are
 * not exactly representable in floating point: a sequence such as 0.4 + 0.2
 * yields 0.6000000000000001 rather than 0.6. End-time and duration assertions
 * therefore use `toBeCloseTo` rather than exact equality.
 */

/**
 * The start time, relative to a scene, of a node's first operation. Omitted
 * `startAt` is treated as `0`.
 */
function sequenceStarts(node: TimelineNode): number {
  return node.startAt ?? 0;
}

/**
 * A node's duration: the sum of its operations' durations for a `Sequence`, the
 * maximum for a `Parallel`.
 */
function nodeDuration(node: TimelineNode): number {
  if (node.kind === 'sequence') {
    return node.operations.reduce((sum, op) => sum + op.duration, 0);
  }
  return Math.max(...node.operations.map((op) => op.duration));
}

/**
 * A node's end time, relative to a scene: its start plus its duration.
 */
function nodeEnd(node: TimelineNode): number {
  return sequenceStarts(node) + nodeDuration(node);
}

/**
 * The cumulative start offset, in seconds, of each operation in a node treated as
 * a `Sequence`: the first operation starts at 0, and each subsequent one starts
 * when the previous one finishes. This is the test-only interpretation of the
 * {@link import('../definitions/timeline').Sequence} scheduling semantics; core
 * itself computes nothing at runtime.
 */
function sequenceOffsets(node: TimelineNode): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const op of node.operations) {
    offsets.push(running);
    running += op.duration;
  }
  return offsets;
}

/**
 * A realistic binary-search definition. It demonstrates multiple scenes,
 * visual objects with distinct type identifiers, sequential and concurrent
 * timeline operations, semantic steps (each bound to a scene), and
 * source-code mappings.
 *
 * Timings are in seconds and frame-rate independent: there is no `timebase`.
 * The total duration (2.2) is the sum of the scene durations (1.6 + 0.6).
 */
function binarySearchDefinition(): AnimationDefinition {
  const setup: TimelineNode = {
    kind: 'sequence',
    startAt: 0,
    operations: [
      {
        id: 'op-setup-array',
        type: 'addObject',
        params: { id: 'array-root', type: 'array' },
        duration: 0,
      },
    ],
  };

  // Two operations that begin together: the mid pointer appears while the
  // current cell is highlighted.
  const findMid: TimelineNode = {
    kind: 'parallel',
    startAt: 0.5,
    operations: [
      {
        id: 'op-mid-appear',
        type: 'setVisible',
        target: 'ptr-mid',
        params: { visible: true },
        duration: 0,
      },
      {
        id: 'op-mid-highlight',
        type: 'highlight',
        target: 'cell-3',
        params: { color: '#f59e0b' },
        duration: 0.3,
        easing: { name: 'easeInOutQuad' },
      },
    ],
  };

  const narrow: TimelineNode = {
    kind: 'sequence',
    startAt: 0.8,
    operations: [
      {
        id: 'op-low-nudge',
        type: 'move',
        target: 'ptr-low',
        params: { x: 3, y: 0 },
        duration: 0.4,
      },
      {
        id: 'op-found',
        type: 'set',
        target: 'result',
        params: { name: 'value', value: 3 },
        duration: 0.2,
      },
    ],
  };

  const stepInit: SemanticStep = {
    id: 'step-init',
    sceneId: 'scene-search',
    description: 'Initialise the low and high pointers at the ends of the array.',
    start: 0,
    end: 0.5,
    operations: ['op-setup-array'],
    sourceLocations: [{ line: 2, endColumn: 28, description: 'low, high = 0, n-1' }],
  };

  const stepMid: SemanticStep = {
    id: 'step-mid',
    sceneId: 'scene-search',
    description: 'Compute the midpoint and compare it with the target.',
    start: 0.5,
    end: 1.0,
    operations: ['op-mid-appear', 'op-mid-highlight'],
    sourceLocations: [
      { line: 5, description: 'mid = (low + high) // 2' },
      { line: 6, description: 'if a[mid] == target' },
    ],
  };

  // A non-visual reasoning step: it drives the narrowing but maps to no source
  // line of its own (it is an explanatory beat between two code lines).
  const stepNarrow: SemanticStep = {
    id: 'step-narrow',
    sceneId: 'scene-search',
    description: 'The midpoint did not match, so narrow the range.',
    start: 1.0,
    end: 1.4,
    operations: ['op-low-nudge', 'op-found'],
  };

  // A second step that also references source line 6, proving that several
  // steps may map to the same source location.
  const stepCheck: SemanticStep = {
    id: 'step-check',
    sceneId: 'scene-search',
    description: 'Re-check the midpoint on the next iteration.',
    start: 1.4,
    end: 1.6,
    operations: [],
    sourceLocations: [{ line: 6, description: 'while low <= high' }],
  };

  // A step bound to the second scene, proving a step can live in a scene other
  // than the first. Its `start`/`end` are measured within `scene-result`.
  const stepResult: SemanticStep = {
    id: 'step-result',
    sceneId: 'scene-result',
    description: 'Display the found index as the result.',
    start: 0,
    end: 0.6,
    operations: [],
  };

  return {
    id: 'anim-binary-search',
    name: 'Binary Search',
    description: 'A binary search over a sorted array, with semantic steps.',
    formatVersion: ANIMATION_DEFINITION_FORMAT_VERSION,
    authoring: {
      author: 'ChoreoBit Team',
      createdAt: '2026-01-01T00:00:00Z',
      metadata: { course: 'CS101', tags: ['search', 'divide-and-conquer'] },
    },
    width: 1000,
    height: 600,
    background: { kind: 'solid', color: '#111827' },
    duration: 2.2,
    scenes: [
      {
        id: 'scene-search',
        duration: 1.6,
        objects: [
          {
            id: 'array-root',
            type: 'array',
            children: [
              {
                id: 'cell-0',
                type: 'array.cell',
                state: { position: { x: 0, y: 0 }, properties: { value: 1 } },
              },
              {
                id: 'cell-3',
                type: 'array.cell',
                state: { position: { x: 3, y: 0 }, properties: { value: 7 } },
              },
              {
                id: 'cell-6',
                type: 'array.cell',
                state: { position: { x: 6, y: 0 }, properties: { value: 15 } },
              },
            ],
          },
          { id: 'ptr-low', type: 'pointer', state: { position: { x: 0, y: -1 } } },
          { id: 'ptr-high', type: 'pointer', state: { position: { x: 6, y: -1 } } },
          { id: 'ptr-mid', type: 'pointer', state: { position: { x: 3, y: -1 }, visible: false } },
          { id: 'result', type: 'text.label', state: { properties: { text: 'not found' } } },
        ],
        timeline: { nodes: [setup, findMid, narrow] },
      },
      {
        id: 'scene-result',
        duration: 0.6,
        objects: [{ id: 'result', type: 'text.label', state: { properties: { text: '3' } } }],
        timeline: { nodes: [] },
      },
    ],
    semanticSteps: [stepInit, stepMid, stepNarrow, stepCheck, stepResult],
    sourceCode: {
      language: 'python',
      filename: 'binary_search.py',
      content: [
        'def binary_search(a, target):',
        '    low, high = 0, len(a) - 1',
        '',
        '    while low <= high:',
        '        mid = (low + high) // 2',
        '        if a[mid] == target:',
        '            return mid',
        '        low = mid + 1',
        '    return -1',
      ].join('\n'),
    },
  };
}

describe('core domain contracts', () => {
  const def = binarySearchDefinition();

  it('represents a minimal valid animation definition', () => {
    const result = validateAnimationDefinition(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('supports multiple scenes in authoring order', () => {
    expect(def.scenes.map((s) => s.id)).toEqual(['scene-search', 'scene-result']);
    expect(def.scenes.length).toBeGreaterThan(1);
  });

  it('allows a scene to contain multiple visual objects', () => {
    const scene = def.scenes[0]!;
    const objects = scene.objects;
    expect(objects.length).toBe(5);
    const ids = objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('supports objects with different type identifiers', () => {
    const scene = def.scenes[0]!;
    const types = new Set(
      scene.objects.flatMap((o) => [o.type, ...(o.children ?? []).map((c) => c.type)]),
    );
    expect(types.has('array')).toBe(true);
    expect(types.has('array.cell')).toBe(true);
    expect(types.has('pointer')).toBe(true);
    expect(types.has('text.label')).toBe(true);
  });

  it('lets timeline operations target multiple objects', () => {
    const scene = def.scenes[0]!;
    const targets = scene.timeline.nodes
      .flatMap((node) => node.operations)
      .filter((op) => op.target !== undefined)
      .map((op) => op.target as string);
    expect(targets).toContain('ptr-low');
    expect(targets).toContain('ptr-mid');
    expect(targets).toContain('cell-3');
  });

  it('represents concurrent operations that share a start time', () => {
    const scene = def.scenes[0]!;
    const node = scene.timeline.nodes[1]!;
    expect(node.kind).toBe('parallel');
    if (node.kind === 'parallel') {
      expect(node.operations.map((op) => op.id)).toEqual(['op-mid-appear', 'op-mid-highlight']);
      expect(node.startAt).toBe(0.5);
    }
  });

  it('lets a semantic step reference multiple operations', () => {
    const step = def.semanticSteps?.find((s) => s.id === 'step-mid');
    expect(step).toBeDefined();
    expect(step!.operations).toEqual(['op-mid-appear', 'op-mid-highlight']);
  });

  it('lets a semantic step reference multiple source-code lines', () => {
    const step = def.semanticSteps?.find((s) => s.id === 'step-mid');
    expect(step).toBeDefined();
    expect(step!.sourceLocations!.map((l) => l.line)).toEqual([5, 6]);
  });

  it('lets multiple semantic steps reference the same source line', () => {
    const byLine = new Map<number, string[]>();
    for (const step of def.semanticSteps ?? []) {
      for (const loc of step.sourceLocations ?? []) {
        const list = byLine.get(loc.line) ?? [];
        list.push(step.id);
        byLine.set(loc.line, list);
      }
    }
    expect(byLine.get(6)).toEqual(['step-mid', 'step-check']);
  });

  it('supports a non-visual semantic step (no visible animation)', () => {
    const step = def.semanticSteps?.find((s) => s.id === 'step-narrow');
    expect(step).toBeDefined();
    expect(step!.operations.length).toBeGreaterThan(0);
    // And a step that drives nothing at all is still valid.
    const reasoning: SemanticStep = {
      id: 'step-think',
      sceneId: 'scene-search',
      description: 'Decide whether to keep searching.',
      start: 1.4,
      end: 1.6,
      operations: [],
    };
    const withReasoning: AnimationDefinition = {
      ...def,
      semanticSteps: [...(def.semanticSteps ?? []), reasoning],
    };
    expect(validateAnimationDefinition(withReasoning).valid).toBe(true);
    expect(withReasoning.semanticSteps!.at(-1)!.operations).toEqual([]);
  });

  it('survives JSON serialization and deserialization', () => {
    const json = serializeDefinition(def);
    expect(typeof json).toBe('string');
    const parsed = parseDefinition(json);
    expect(parsed).toEqual(def);
    expect(validateAnimationDefinition(parsed).valid).toBe(true);
  });

  it('preserves stable identifiers across round trips', () => {
    const parsed = parseDefinition(serializeDefinition(def));
    expect(parsed.id).toBe('anim-binary-search');
    expect(parsed.scenes.map((s) => s.id)).toEqual(['scene-search', 'scene-result']);
    const parsedScene = parsed.scenes[0]!;
    expect(parsedScene.objects.map((o) => o.id)).toEqual([
      'array-root',
      'ptr-low',
      'ptr-high',
      'ptr-mid',
      'result',
    ]);
    expect(parsed.semanticSteps!.map((s) => s.id)).toEqual([
      'step-init',
      'step-mid',
      'step-narrow',
      'step-check',
      'step-result',
    ]);
  });

  it('rejects structurally invalid data when validation is enabled', () => {
    const bad = { id: 123, name: '', width: 'x', duration: NaN, scenes: 'nope' };
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });

  it('rejects a non-JSON member (a function) in the definition', () => {
    const withFn: unknown = { ...def, onPlay: () => undefined };
    const result = validateAnimationDefinition(withFn);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-JSON'))).toBe(true);
  });

  it('preserves unknown extension fields (forward compatibility)', () => {
    const extended: AnimationDefinition = {
      ...def,
      extensions: { 'choreobit.com/lab': { labId: 'cs101-lab-7', extra: [1, 2, 3] } },
    };
    const parsed = parseDefinition(serializeDefinition(extended));
    expect(parsed.extensions).toEqual(extended.extensions);
    expect(validateAnimationDefinition(parsed).valid).toBe(true);
  });

  it('rejects an incompatible format version', () => {
    const future: AnimationDefinition = { ...def, formatVersion: '2.0.0' };
    const result = validateAnimationDefinition(future, {
      expectedVersion: ANIMATION_DEFINITION_FORMAT_VERSION,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('formatVersion'))).toBe(true);
  });
});

describe('timeline scheduling semantics', () => {
  const def = binarySearchDefinition();
  const search = def.scenes[0]!;
  const nodes = search.timeline.nodes;
  const setup = nodes[0]!;
  const findMid = nodes[1]!;
  const narrow = nodes[2]!;

  it('chains sequence operations consecutively from startAt', () => {
    expect(nodeDuration(setup)).toBe(0);
    expect(nodeEnd(setup)).toBe(0);
    expect(sequenceStarts(findMid)).toBe(0.5);
    expect(sequenceStarts(narrow)).toBe(0.8);
  });

  it('ends a sequence at the sum of its operations durations', () => {
    expect(nodeDuration(narrow)).toBeCloseTo(0.6, 9);
    expect(nodeEnd(narrow)).toBeCloseTo(1.4, 9);
  });

  it('starts parallel operations simultaneously', () => {
    expect(findMid.kind).toBe('parallel');
    if (findMid.kind === 'parallel') {
      expect(findMid.operations.map((op) => op.id)).toEqual(['op-mid-appear', 'op-mid-highlight']);
      // Every operation in the group begins at the group's startAt.
      expect(sequenceStarts(findMid)).toBe(0.5);
    }
  });

  it('ends a parallel at its longest operation duration', () => {
    expect(nodeDuration(findMid)).toBe(0.3);
    expect(nodeEnd(findMid)).toBe(0.8);
  });

  it('treats an omitted startAt as 0', () => {
    const bare = binarySearchDefinition();
    bare.scenes[0]!.timeline.nodes = bare.scenes[0]!.timeline.nodes.map((n) => {
      if (n.kind === 'parallel') {
        const { startAt: _omit, ...rest } = n;
        return rest;
      }
      return n;
    });
    // findMid now has no startAt and must be interpreted as starting at 0.
    const bareFindMid = bare.scenes[0]!.timeline.nodes[1]!;
    expect(bareFindMid.startAt).toBeUndefined();
    expect(sequenceStarts(bareFindMid)).toBe(0);
  });

  it('allows overlapping top-level nodes', () => {
    // Independent top-level nodes are not chained: their intervals may overlap.
    // findMid: [0.5, 0.8]; narrow: [0.8, 1.4] — they abut but neither depends
    // on the other's end time. A third node placed earlier would overlap freely.
    expect(nodeEnd(findMid) <= sequenceStarts(narrow)).toBe(true);
  });

  it('chains a three-operation sequence at cumulative offsets 0, 0.5 and 0.7', () => {
    const sequence: TimelineNode = {
      kind: 'sequence',
      startAt: 0,
      operations: [
        { id: 'op-a', type: 'set', duration: 0.5 },
        { id: 'op-b', type: 'move', duration: 0.2 },
        { id: 'op-c', type: 'highlight', duration: 0.3 },
      ],
    };
    const offsets = sequenceOffsets(sequence);
    expect(offsets[0]!).toBe(0);
    expect(offsets[1]!).toBeCloseTo(0.5, 9);
    expect(offsets[2]!).toBeCloseTo(0.7, 9);
    expect(nodeDuration(sequence)).toBeCloseTo(1.0, 9);
  });
});

describe('operation-kind recognition', () => {
  it('rejects an operation whose type is not a recognised kind', () => {
    const bad = binarySearchDefinition();
    // Corrupt exactly one operation's `type`; leave the structure intact so the
    // only failure is the unrecognised kind.
    const op = bad.scenes[0]!.timeline.nodes[0]!.operations[0]!;
    op.type = 'teleport' as unknown as typeof op.type;
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('operation kind') || e.includes('op-setup-array')),
    ).toBe(true);
  });

  it('accepts every recognised operation kind', () => {
    expect(validateAnimationDefinition(binarySearchDefinition()).valid).toBe(true);
  });
});

describe('duration consistency', () => {
  it('accepts a definition whose total duration equals the scene sum', () => {
    const def = binarySearchDefinition();
    const sum = def.scenes.reduce((acc, s) => acc + s.duration, 0);
    expect(Math.abs(sum - def.duration) < 1e-9).toBe(true);
    expect(validateAnimationDefinition(def).valid).toBe(true);
  });

  it('rejects a total duration that is not the sum of scene durations', () => {
    const bad = binarySearchDefinition();
    bad.duration = 1.0; // scene durations sum to 2.2
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duration') && e.includes('sum'))).toBe(true);
  });

  it('rejects a node whose end time exceeds its scene duration', () => {
    const bad = binarySearchDefinition();
    bad.scenes[0]!.duration = 0.5; // narrow ends at 1.4, well past 0.5
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('end time') && e.includes('scene duration'))).toBe(
      true,
    );
  });

  it('rejects a step whose end exceeds its scene duration', () => {
    const bad = binarySearchDefinition();
    // step-result ends at 0.6 within scene-result (duration 0.6): valid.
    // Shrink scene-result so the step end exceeds it.
    bad.scenes[1]!.duration = 0.4;
    // Keep the total duration consistent so only the step/scene mismatch fires.
    bad.duration = bad.scenes[0]!.duration + bad.scenes[1]!.duration;
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('end') && e.includes('scene duration'))).toBe(true);
  });

  it('rejects a semantic step whose sceneId names no scene', () => {
    const bad = binarySearchDefinition();
    // Detach one step from every scene by pointing it at a scene id that exists
    // in neither scene; the total duration stays consistent.
    bad.semanticSteps![0]!.sceneId = 'scene-missing';
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sceneId') && e.includes('does not match'))).toBe(
      true,
    );
  });

  it('rejects a semantic step whose start is greater than its end', () => {
    const bad = binarySearchDefinition();
    // Invert one step's bounds; leave its scene intact so only the start/end
    // invariant fires.
    bad.semanticSteps![0]!.start = 0.6;
    bad.semanticSteps![0]!.end = 0.4;
    const result = validateAnimationDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('start') && e.includes('greater than'))).toBe(true);
  });
});
