import { describe, expect, it } from 'vitest';
import type {
  Operation,
  OperationKind,
  Scene,
  SemanticStep,
  Sequence,
  VisualObject,
} from '@choreobit/core';
import { CodeSyncError, Player, type FrameHandle, type FrameScheduler } from '../index';
import type { Canvas2DContext, RenderOptions } from '@choreobit/renderer';

/**
 * Player stepping tests.
 *
 * These exercise the {@link Player}'s semantic navigation methods
 * (`stepForward`, `stepBackward`, `hasNextStep`, `hasPreviousStep`) on top of a
 * deterministic fake scheduler and a recording context. A player stepping is just
 * a `seek` to a step boundary, so these assert that navigation moves the single
 * playback clock, pauses, renders, and notifies — never a second engine.
 */

/**
 * A recording mock of the {@link Canvas2DContext} contract; a test counts frames
 * by the clear commands a render issues.
 */
class MockContext {
  readonly calls: string[] = [];
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  textAlign = 'left';
  textBaseline = 'alphabetic';
  font = '10px sans-serif';
  globalAlpha = 1;

  translate(): void {
    this.calls.push('translate');
  }
  setTransform(): void {
    this.calls.push('setTransform');
  }
  clearRect(): void {
    this.calls.push('clearRect');
  }
  fillRect(): void {
    this.calls.push('fillRect');
  }
  strokeRect(): void {
    this.calls.push('strokeRect');
  }
  beginPath(): void {
    this.calls.push('beginPath');
  }
  rect(): void {
    this.calls.push('rect');
  }
  arc(): void {
    this.calls.push('arc');
  }
  closePath(): void {
    this.calls.push('closePath');
  }
  fill(): void {
    this.calls.push('fill');
  }
  stroke(): void {
    this.calls.push('stroke');
  }
  fillText(): void {
    this.calls.push('fillText');
  }
  strokeText(): void {
    this.calls.push('strokeText');
  }
  save(): void {
    this.calls.push('save');
  }
  restore(): void {
    this.calls.push('restore');
  }

  get clearCount(): number {
    return this.calls.filter((c) => c === 'clearRect' || c === 'fillRect').length;
  }
}

/** A deterministic fake {@link FrameScheduler} that fires its callback on demand. */
class FakeScheduler implements FrameScheduler {
  pending: ((t: number) => void) | null = null;
  readonly requests: number[] = [];
  readonly cancels: number[] = [];
  private next = 1;

  request(callback: (timeMs: number) => void): FrameHandle {
    this.pending = callback;
    const handle = this.next++;
    this.requests.push(handle);
    return handle;
  }

  cancel(handle: FrameHandle): void {
    this.cancels.push(handle);
    if (this.pending !== null && this.requests[this.requests.length - 1] === handle) {
      this.pending = null;
    }
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  tick(timeMs: number): void {
    const cb = this.pending;
    this.pending = null;
    if (cb !== null) cb(timeMs);
  }
}

const options: RenderOptions = { width: 100, height: 100 };

function obj(
  id: string,
  type: string,
  state?: VisualObject['state'],
  children?: VisualObject[],
): VisualObject {
  return { id, type, state, children };
}

function sequence(operations: readonly Operation[], startAt = 0): Sequence {
  return { kind: 'sequence', startAt, operations };
}

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
 * A scene whose timeline spans `duration` seconds, so the schedule's duration
 * (and therefore the stepping bound) matches `duration`. The first move runs for
 * the full duration so the beat stops fall inside it.
 */
function movingScene(duration = 10): Scene {
  return {
    id: 's',
    objects: [
      obj('a', 'rectangle', {
        position: { x: 0, y: 0 },
        opacity: 1,
        properties: { width: 10, height: 10 },
      }),
    ],
    timeline: { nodes: [sequence([op('m', 'move', 'a', duration, { x: 100, y: 100 })])] },
    duration,
  };
}

/** Build a `SemanticStep` with sensible defaults and the given overrides. */
function step(overrides: Partial<SemanticStep> & Pick<SemanticStep, 'id'>): SemanticStep {
  const start = overrides.start ?? 0;
  return {
    sceneId: 's',
    description: overrides.id,
    start,
    end: overrides.end ?? start + 1,
    operations: [],
    ...overrides,
  };
}

/** A scene's stops, in the order the binary-search example uses them. */
const beats = [
  step({ id: 'init', start: 0, end: 1.5 }),
  step({ id: 'mid-1', start: 1.5, end: 3 }),
  step({ id: 'narrow-low', start: 3, end: 4.5 }),
  step({ id: 'found', start: 9, end: 10 }),
];

/** Build a player over a fresh fake scheduler, with the given options. */
function makePlayer(extra: { semanticSteps?: readonly SemanticStep[] } = {}): {
  player: Player;
  scheduler: FakeScheduler;
  ctx: MockContext;
} {
  const scheduler = new FakeScheduler();
  const ctx = new MockContext();
  const player = new Player({
    scene: movingScene(),
    context: ctx as Canvas2DContext,
    renderOptions: options,
    frameScheduler: scheduler,
    semanticSteps: extra.semanticSteps,
  });
  return { player, scheduler, ctx };
}

describe('Player — stopTimes exposure', () => {
  it('exposes the distinct, sorted step starts as stopTimes', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    expect([...player.stopTimes]).toEqual([0, 1.5, 3, 9]);
  });

  it('has no stops when built without semanticSteps', () => {
    const { player } = makePlayer({});
    expect(player.stopTimes).toEqual([]);
  });

  it('ignores steps of another scene when building stopTimes', () => {
    const { player } = makePlayer({
      semanticSteps: [
        step({ id: 'a', start: 1, end: 2 }),
        step({ id: 'b', sceneId: 'other', start: 4, end: 5 }),
      ],
    });
    expect([...player.stopTimes]).toEqual([1]);
  });
});

describe('Player — stepForward / stepBackward', () => {
  it('steps forward to the next stop and returns true', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    expect(player.stepForward()).toBe(true);
    expect(player.getState().currentTime).toBe(1.5);
  });

  it('advances through every beat in order', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    expect(player.stepForward()).toBe(true);
    expect(player.getState().currentTime).toBe(1.5);
    expect(player.stepForward()).toBe(true);
    expect(player.getState().currentTime).toBe(3);
    expect(player.stepForward()).toBe(true);
    expect(player.getState().currentTime).toBe(9);
    expect(player.stepForward()).toBe(false);
    expect(player.getState().currentTime).toBe(9);
  });

  it('steps backward to the previous stop and returns true', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    player.seek(9);
    expect(player.stepBackward()).toBe(true);
    expect(player.getState().currentTime).toBe(3);
    expect(player.stepBackward()).toBe(true);
    expect(player.getState().currentTime).toBe(1.5);
    expect(player.stepBackward()).toBe(true);
    expect(player.getState().currentTime).toBe(0);
    expect(player.stepBackward()).toBe(false);
    expect(player.getState().currentTime).toBe(0);
  });

  it('skips the stop at the current time (strict comparison)', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    player.seek(3);
    expect(player.stepForward()).toBe(true);
    expect(player.getState().currentTime).toBe(9);
  });

  it('pauses the player after a step', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    player.stepForward();
    expect(player.getState().status).toBe('paused');
  });

  it('renders the frame at the stepped-to time', () => {
    const { player, ctx } = makePlayer({ semanticSteps: beats });
    const before = ctx.clearCount;
    player.stepForward();
    expect(ctx.clearCount).toBeGreaterThan(before);
  });

  it('cancels a pending frame when stepping over a playing loop', () => {
    const { player, scheduler } = makePlayer({ semanticSteps: beats });
    player.play();
    expect(scheduler.hasPending).toBe(true);
    expect(player.stepForward()).toBe(true);
    expect(scheduler.hasPending).toBe(false);
    expect(player.getState().status).toBe('paused');
  });

  it('notifies subscribers when it steps', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    const seen: number[] = [];
    player.subscribe((state) => seen.push(state.currentTime));
    player.stepForward();
    expect(seen[seen.length - 1]).toBe(1.5);
  });

  it('does not move when there is no next / previous stop', () => {
    const { player, ctx } = makePlayer({ semanticSteps: beats });
    const before = ctx.clearCount;
    expect(player.stepForward()).toBe(true);
    expect(player.stepForward()).toBe(true);
    expect(player.stepForward()).toBe(true);
    expect(player.stepForward()).toBe(false);
    expect(ctx.clearCount).toBe(before + 6);
  });

  it('returns false for stepForward with no stops', () => {
    const { player } = makePlayer({});
    expect(player.stepForward()).toBe(false);
    expect(player.stepBackward()).toBe(false);
    expect(player.getState().currentTime).toBe(0);
  });

  it('throws after destroy', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    player.destroy();
    expect(() => player.stepForward()).toThrow();
    expect(() => player.stepBackward()).toThrow();
  });
});

describe('Player — hasNextStep / hasPreviousStep', () => {
  it('report whether a step exists from the current time', () => {
    const { player } = makePlayer({ semanticSteps: beats });
    expect(player.hasNextStep()).toBe(true);
    expect(player.hasPreviousStep()).toBe(false);
    player.seek(3);
    expect(player.hasNextStep()).toBe(true);
    expect(player.hasPreviousStep()).toBe(true);
    player.seek(9);
    expect(player.hasNextStep()).toBe(false);
    expect(player.hasPreviousStep()).toBe(true);
  });

  it('are pure reads that do not move the clock or render', () => {
    const { player, ctx } = makePlayer({ semanticSteps: beats });
    const before = ctx.clearCount;
    player.hasNextStep();
    player.hasPreviousStep();
    expect(ctx.clearCount).toBe(before);
    expect(player.getState().currentTime).toBe(0);
  });

  it('are both false with no stops', () => {
    const { player } = makePlayer({});
    expect(player.hasNextStep()).toBe(false);
    expect(player.hasPreviousStep()).toBe(false);
  });
});

describe('Player — construction validation', () => {
  it('throws on a malformed step at construction', () => {
    const ctx = new MockContext();
    expect(
      () =>
        new Player({
          scene: movingScene(),
          context: ctx as Canvas2DContext,
          renderOptions: options,
          frameScheduler: new FakeScheduler(),
          semanticSteps: [step({ id: 'a', start: 11, end: 12 })],
        }),
    ).toThrow(CodeSyncError);
  });

  it('throws on a duplicate step id at construction', () => {
    const ctx = new MockContext();
    expect(
      () =>
        new Player({
          scene: movingScene(),
          context: ctx as Canvas2DContext,
          renderOptions: options,
          frameScheduler: new FakeScheduler(),
          semanticSteps: [step({ id: 'a', start: 1, end: 2 }), step({ id: 'a', start: 4, end: 5 })],
        }),
    ).toThrow(CodeSyncError);
  });
});
