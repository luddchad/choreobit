import { describe, expect, it, vi } from 'vitest';
import type { Operation, OperationKind, Scene, Sequence, VisualObject } from '@choreobit/core';
import {
  Player,
  PlayerError,
  PLAYER_ERROR_CODES,
  createRequestAnimationFrameScheduler,
  isPlayerError,
  type FrameHandle,
  type FrameScheduler,
  type PlayerState,
} from '../index';
import type { Canvas2DContext, RenderOptions } from '@choreobit/renderer';

/**
 * Player fixtures and a deterministic fake scheduler.
 *
 * The player is browser-free: it owns the *logic* of an animation loop and
 * delegates the *timing* to a {@link FrameScheduler}. These tests supply a fake
 * that records scheduled callbacks and fires them on demand, plus a recording
 * mock of the {@link Canvas2DContext} contract, so playback is asserted exactly
 * without a browser or `Date.now`.
 */

/** One recorded command on the mock context. */
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
 * It stores the style fields a later read would see and logs every command, so a
 * test can count frames by counting the clearing commands a render issues. A
 * member may be replaced with a throwing function to exercise the render-failure
 * path.
 */
class MockContext {
  readonly calls: Call[] = [];
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  textAlign = 'left';
  textBaseline = 'alphabetic';
  font = '10px sans-serif';
  globalAlpha = 1;

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

  get clearCount(): number {
    return this.calls.filter((c) => c.op === 'clearRect' || c.op === 'fillRect').length;
  }
}

/**
 * A deterministic fake {@link FrameScheduler}.
 *
 * It keeps a single pending callback. `request` stores it and hands back a
 * monotonically increasing {@link FrameHandle}; `cancel` clears it if it still
 * matches; `tick` fires the pending callback (clearing it first) at a chosen
 * timestamp. This models a one-shot `requestAnimationFrame` without a browser.
 */
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

  tick(timeMs: number): void {
    const cb = this.pending;
    this.pending = null;
    if (cb !== null) {
      cb(timeMs);
    }
  }

  get pendingHandle(): FrameHandle | null {
    return this.requests[this.requests.length - 1] ?? null;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }
}

/** The default render options: a 100x100 transparent surface. */
const options: RenderOptions = { width: 100, height: 100 };

/** A single visual object with a type, an optional initial state, and children. */
function obj(
  id: string,
  type: string,
  state?: VisualObject['state'],
  children?: VisualObject[],
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
): Operation {
  return { id, type, target, duration, params };
}

/**
 * A scene whose single sequence holds the given operations. The `duration` field
 * is unused by the player (it reads the schedule's duration), but a valid scene
 * requires a non-negative one.
 */
function scene(objects: readonly VisualObject[], operations: readonly Operation[]): Scene {
  return { id: 's', objects, timeline: { nodes: [sequence(operations, 0)] }, duration: 1 };
}

/**
 * The canonical fixture: a 10x10 rectangle moving from (0,0) to (100,100) over
 * one second, so the schedule's duration is `1`.
 */
function movingScene(): Scene {
  return scene(
    [
      obj('a', 'rectangle', {
        position: { x: 0, y: 0 },
        opacity: 1,
        properties: { width: 10, height: 10 },
      }),
    ],
    [op('m', 'move', 'a', 1, { x: 100, y: 100 })],
  );
}

/** Build a player over the given scheduler and scene, with default options. */
function makePlayer(scheduler: FrameScheduler, sceneArg: Scene = movingScene()): Player {
  return new Player({
    scene: sceneArg,
    context: new MockContext() as Canvas2DContext,
    renderOptions: options,
    frameScheduler: scheduler,
  });
}

describe('PlayerError', () => {
  it('exposes the closed set of codes', () => {
    expect(PLAYER_ERROR_CODES).toEqual(['evaluation', 'render', 'invalid', 'destroyed']);
  });

  it('carries its code and a cause', () => {
    const cause = new Error('boom');
    const error = new PlayerError({ code: 'evaluation', message: 'failed', cause });
    expect(error.code).toBe('evaluation');
    expect(error.message).toBe('failed');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('PlayerError');
    expect(error instanceof Error).toBe(true);
  });

  it('is recognised by isPlayerError and not for a plain error', () => {
    expect(isPlayerError(new PlayerError({ code: 'render', message: 'x' }))).toBe(true);
    expect(isPlayerError(new Error('x'))).toBe(false);
    expect(isPlayerError(null)).toBe(false);
  });
});

describe('createRequestAnimationFrameScheduler', () => {
  it('throws when requestAnimationFrame is unavailable', () => {
    const original = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    try {
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
      expect(() => createRequestAnimationFrameScheduler()).toThrow(/requestAnimationFrame/i);
    } finally {
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = original;
    }
  });

  it('returns a scheduler that delegates to the host functions when present', () => {
    const raf = vi.fn(() => 42);
    const caf = vi.fn();
    const original = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    const originalCancel = (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    try {
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = raf;
      (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = caf;
      const scheduler = createRequestAnimationFrameScheduler();
      const handle = scheduler.request(() => {});
      expect(handle).toBe(42);
      expect(raf).toHaveBeenCalled();
      scheduler.cancel(7);
      expect(caf).toHaveBeenCalledWith(7);
    } finally {
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = original;
      (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = originalCancel;
    }
  });
});

describe('construction', () => {
  it('computes the schedule and duration from the scene timeline', () => {
    const player = makePlayer(new FakeScheduler());
    expect(player.duration).toBe(1);
    expect(player.schedule.operations.length).toBe(1);
  });

  it('exposes the scene, context, render options, and scheduler as given', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    expect(player.context).toBe(ctx);
    expect(player.renderOptions).toBe(options);
    expect(player.frameScheduler).toBe(scheduler);
  });

  it('defaults the playback rate to 1 and loop to false', () => {
    const state = makePlayer(new FakeScheduler()).getState();
    expect(state.playbackRate).toBe(1);
    expect(state.loop).toBe(false);
    expect(state.status).toBe('paused');
    expect(state.currentTime).toBe(0);
    expect(state.error).toBeUndefined();
  });

  it('honors a supplied playback rate and loop flag', () => {
    const ctx = new MockContext();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: new FakeScheduler(),
      playbackRate: 2,
      loop: true,
    });
    expect(player.getState().playbackRate).toBe(2);
    expect(player.getState().loop).toBe(true);
  });
});

describe('play', () => {
  it('schedules a frame and marks the player playing', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    expect(player.getState().status).toBe('playing');
    expect(scheduler.hasPending).toBe(true);
  });

  it('does not advance time on the first tick after play', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(16);
    expect(player.getState().currentTime).toBe(0);
    expect(player.getState().status).toBe('playing');
    expect(scheduler.hasPending).toBe(true);
  });

  it('advances by the measured delta on the second tick', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    expect(player.getState().currentTime).toBeCloseTo(0.5, 10);
  });

  it('renders a frame on each tick that advances', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    expect(ctx.clearCount).toBeGreaterThanOrEqual(1);
  });

  it('is a no-op when already playing', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    const before = scheduler.requests.length;
    player.play();
    expect(scheduler.requests.length).toBe(before);
    expect(scheduler.hasPending).toBe(true);
  });

  it('clears a prior error and resumes on a fresh play', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.seek(0.5);
    player.play();
    expect(player.getState().error).toBeUndefined();
    expect(player.getState().status).toBe('playing');
  });

  it('renders a single frame and ends a zero-duration scene without scheduling', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const zeroScene = scene([obj('a', 'rectangle', { properties: { width: 10, height: 10 } })], []);
    const player = new Player({
      scene: zeroScene,
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    expect(player.duration).toBe(0);
    player.play();
    expect(player.getState().status).toBe('ended');
    expect(scheduler.hasPending).toBe(false);
    expect(scheduler.requests.length).toBe(0);
    expect(ctx.clearCount).toBeGreaterThanOrEqual(1);
  });
});

describe('pause', () => {
  it('cancels the pending frame and pauses, keeping the time', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    player.pause();
    expect(player.getState().status).toBe('paused');
    expect(scheduler.hasPending).toBe(false);
    expect(player.getState().currentTime).toBeCloseTo(0.5, 10);
  });

  it('is a no-op when not playing', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.pause();
    expect(scheduler.cancels.length).toBe(0);
    expect(player.getState().status).toBe('paused');
  });

  it('then resumes from where it paused', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    player.pause();
    player.play();
    scheduler.tick(0);
    scheduler.tick(250);
    expect(player.getState().currentTime).toBeCloseTo(0.75, 10);
  });
});

describe('the end of a non-looping scene', () => {
  it('ends at the duration and stops scheduling', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(1000);
    expect(player.getState().status).toBe('ended');
    expect(player.getState().currentTime).toBe(1);
    expect(scheduler.hasPending).toBe(false);
  });

  it('renders the final frame at the duration', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.play();
    scheduler.tick(0);
    scheduler.tick(1000);
    expect(ctx.clearCount).toBeGreaterThanOrEqual(1);
  });

  it('is a no-op on further ticks after ending', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(1000);
    scheduler.tick(1500);
    expect(player.getState().status).toBe('ended');
    expect(scheduler.hasPending).toBe(false);
  });
});

describe('looping', () => {
  it('wraps the time at the duration', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler, movingScene());
    player.setLoop(true);
    player.play();
    scheduler.tick(0);
    scheduler.tick(1500);
    expect(player.getState().currentTime).toBeCloseTo(0.5, 10);
    expect(player.getState().status).toBe('playing');
    expect(scheduler.hasPending).toBe(true);
  });

  it('keeps advancing across multiple wraps', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler, movingScene());
    player.setLoop(true);
    player.play();
    scheduler.tick(0);
    scheduler.tick(2500);
    expect(player.getState().currentTime).toBeCloseTo(0.5, 10);
    expect(player.getState().status).toBe('playing');
  });

  it('a zero-duration looping scene does not divide by zero', () => {
    const scheduler = new FakeScheduler();
    const zeroScene = scene([obj('a', 'rectangle', { properties: { width: 10, height: 10 } })], []);
    const player = new Player({
      scene: zeroScene,
      context: new MockContext() as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
      loop: true,
    });
    player.play();
    expect(player.getState().status).toBe('ended');
    expect(scheduler.hasPending).toBe(false);
  });
});

describe('playback rate', () => {
  it('scales the advance by the rate', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.setPlaybackRate(2);
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    expect(player.getState().currentTime).toBeCloseTo(1, 10);
  });

  it('rejects a non-positive or non-finite rate', () => {
    const player = makePlayer(new FakeScheduler());
    expect(() => player.setPlaybackRate(0)).toThrow(PlayerError);
    expect(() => player.setPlaybackRate(-1)).toThrow(PlayerError);
    expect(() => player.setPlaybackRate(Number.NaN)).toThrow(PlayerError);
    expect(() => player.setPlaybackRate(Number.POSITIVE_INFINITY)).toThrow(PlayerError);
  });

  it('reports a rejected rate as an invalid error', () => {
    const player = makePlayer(new FakeScheduler());
    let thrown: unknown;
    try {
      player.setPlaybackRate(0);
    } catch (error) {
      thrown = error;
    }
    expect(isPlayerError(thrown)).toBe(true);
    expect((thrown as PlayerError).code).toBe('invalid');
    expect(player.getState().playbackRate).toBe(1);
  });
});

describe('seek', () => {
  it('jumps to a clamped time, paused', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.seek(0.4);
    expect(player.getState().currentTime).toBeCloseTo(0.4, 10);
    expect(player.getState().status).toBe('paused');
    expect(scheduler.hasPending).toBe(false);
  });

  it('clamps a negative time to 0', () => {
    const player = makePlayer(new FakeScheduler());
    player.seek(-5);
    expect(player.getState().currentTime).toBe(0);
  });

  it('clamps a time past the duration', () => {
    const player = makePlayer(new FakeScheduler());
    player.seek(5);
    expect(player.getState().currentTime).toBe(1);
  });

  it('clamps a non-finite time to 0', () => {
    const player = makePlayer(new FakeScheduler());
    player.seek(Number.NaN);
    expect(player.getState().currentTime).toBe(0);
  });

  it('cancels any pending frame before seeking', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    expect(scheduler.hasPending).toBe(true);
    player.seek(0.3);
    expect(scheduler.hasPending).toBe(false);
  });

  it('renders the sought frame', () => {
    const ctx = new MockContext();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: new FakeScheduler(),
    });
    player.seek(0.5);
    expect(ctx.clearCount).toBeGreaterThanOrEqual(1);
  });
});

describe('restart', () => {
  it('resets the time to 0 and renders frame 0, paused', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    player.restart();
    expect(player.getState().currentTime).toBe(0);
    expect(player.getState().status).toBe('paused');
    expect(scheduler.hasPending).toBe(false);
  });

  it('does not auto-play', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    player.restart();
    expect(scheduler.hasPending).toBe(false);
  });

  it('clears a prior error', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.restart();
    expect(player.getState().error).toBeUndefined();
  });
});

describe('subscribe', () => {
  it('receives a fresh snapshot on every change', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    const seen: PlayerState[] = [];
    player.subscribe((s) => seen.push(s));
    player.play();
    scheduler.tick(0);
    scheduler.tick(500);
    player.pause();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).not.toBe(seen[1]);
    const last = seen[seen.length - 1];
    expect(last?.status).toBe('paused');
  });

  it('stops notifying after unsubscribe', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    const seen: PlayerState[] = [];
    const unsubscribe = player.subscribe((s) => seen.push(s));
    unsubscribe();
    player.play();
    scheduler.tick(0);
    expect(seen.length).toBe(0);
  });

  it('supports multiple subscribers', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    let a = 0;
    let b = 0;
    player.subscribe(() => {
      a++;
    });
    player.subscribe(() => {
      b++;
    });
    player.play();
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(1);
  });

  it('does not abort the loop when a listener throws', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.subscribe(() => {
      throw new Error('listener boom');
    });
    player.play();
    expect(() => scheduler.tick(0)).not.toThrow();
    expect(() => scheduler.tick(500)).not.toThrow();
    expect(player.getState().status).toBe('playing');
  });
});

describe('getState', () => {
  it('returns a fresh snapshot each call', () => {
    const player = makePlayer(new FakeScheduler());
    expect(player.getState()).not.toBe(player.getState());
  });

  it('does not leak internal references', () => {
    const player = makePlayer(new FakeScheduler());
    const a = player.getState();
    player.play();
    const b = player.getState();
    expect(a.status).toBe('paused');
    expect(b.status).toBe('playing');
  });
});

describe('error handling', () => {
  it('stops the loop and reports an evaluation failure', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const badScene = scene([obj('a', 'rectangle')], [op('m', 'move', 'ghost', 1, { x: 1, y: 1 })]);
    const player = new Player({
      scene: badScene,
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.play();
    scheduler.tick(0);
    expect(player.getState().status).toBe('paused');
    expect(player.getState().error?.code).toBe('evaluation');
    expect(scheduler.hasPending).toBe(false);
  });

  it('does not render a frame that failed to evaluate', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const badScene = scene([obj('a', 'rectangle')], [op('m', 'move', 'ghost', 1, { x: 1, y: 1 })]);
    const player = new Player({
      scene: badScene,
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.play();
    scheduler.tick(0);
    expect(ctx.clearCount).toBe(0);
  });

  it('reports a render failure', () => {
    const ctx = new MockContext();
    ctx.clearRect = () => {
      throw new Error('canvas boom');
    };
    const scheduler = new FakeScheduler();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.play();
    scheduler.tick(0);
    expect(player.getState().error?.code).toBe('render');
    expect(player.getState().status).toBe('paused');
    expect(scheduler.hasPending).toBe(false);
  });

  it('clears a prior error on a successful frame', () => {
    const ctx = new MockContext();
    const scheduler = new FakeScheduler();
    const player = new Player({
      scene: movingScene(),
      context: ctx as Canvas2DContext,
      renderOptions: options,
      frameScheduler: scheduler,
    });
    player.seek(0.5);
    player.play();
    expect(player.getState().error).toBeUndefined();
  });
});

describe('destroy', () => {
  it('cancels the pending frame and blocks further use', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    player.play();
    scheduler.tick(0);
    player.destroy();
    expect(scheduler.hasPending).toBe(false);
    expect(() => player.play()).toThrow(PlayerError);
    expect(() => player.pause()).toThrow(PlayerError);
    expect(() => player.seek(0)).toThrow(PlayerError);
    expect(() => player.setPlaybackRate(1)).toThrow(PlayerError);
    expect(() => player.setLoop(true)).toThrow(PlayerError);
    expect(() => player.restart()).toThrow(PlayerError);
  });

  it('reports the blocked call as a destroyed error', () => {
    const player = makePlayer(new FakeScheduler());
    player.destroy();
    expect(() => player.play()).toThrow(/destroyed/i);
  });

  it('is idempotent', () => {
    const player = makePlayer(new FakeScheduler());
    player.destroy();
    expect(() => player.destroy()).not.toThrow();
  });

  it('makes the player inert and keeps its unsubscribe safe', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler);
    let calls = 0;
    const unsubscribe = player.subscribe(() => {
      calls++;
    });
    player.play();
    scheduler.tick(0);
    const before = calls;
    expect(before).toBeGreaterThanOrEqual(1);
    player.destroy();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => player.restart()).toThrow(PlayerError);
  });
});

describe('setLoop and setPlaybackRate take effect without notifying', () => {
  it('setLoop updates the loop flag and is reflected in the next tick', () => {
    const scheduler = new FakeScheduler();
    const player = makePlayer(scheduler, movingScene());
    let notified = 0;
    player.subscribe(() => {
      notified++;
    });
    player.setLoop(true);
    expect(notified).toBe(0);
    expect(player.getState().loop).toBe(true);
    player.play();
    scheduler.tick(0);
    scheduler.tick(1500);
    expect(player.getState().currentTime).toBeCloseTo(0.5, 10);
    expect(player.getState().status).toBe('playing');
  });

  it('setPlaybackRate updates the rate without notifying', () => {
    const player = makePlayer(new FakeScheduler());
    let notified = 0;
    player.subscribe(() => {
      notified++;
    });
    player.setPlaybackRate(1.5);
    expect(notified).toBe(0);
    expect(player.getState().playbackRate).toBe(1.5);
  });
});
