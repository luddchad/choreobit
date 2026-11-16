import type { Scene } from '@choreobit/core';
import type { Canvas2DContext, RenderOptions } from '@choreobit/renderer';
import type { PlayerError } from './error';

/**
 * The opaque handle returned when a frame is scheduled.
 *
 * The player never inspects a handle: it only passes it back to the same
 * {@link FrameScheduler} that produced it, so a handle may be any value the
 * host runtime chooses to return. A browser `requestAnimationFrame` returns a
 * positive integer, and a test's fake scheduler may return an incrementing
 * counter or a token.
 */
export type FrameHandle = number;

/**
 * The minimal frame-clock contract the player drives its animation loop through.
 *
 * The player is browser-free: it never calls `requestAnimationFrame` itself. It
 * owns the *logic* of an animation loop (advancing time, evaluating, rendering,
 * stopping, looping) and delegates the *timing* to this contract. A real browser
 * adapter is built on top of `requestAnimationFrame`/`cancelAnimationFrame`; a
 * test supplies a deterministic fake that fires callbacks on demand.
 *
 * Decoupling timing from logic is what makes the player unit-testable without a
 * browser and without `Date.now`: the fake scheduler hands the player whatever
 * timestamps it chooses, so a test drives playback exactly.
 */
export interface FrameScheduler {
  /**
   * Schedule a callback to run on the next frame.
   *
   * The callback receives the frame's timestamp in milliseconds, in the same
   * clock the host uses (a browser passes the `DOMHighResTimeStamp`; a fake
   * passes a test-chosen value). The returned {@link FrameHandle} is the only
   * reference to the pending callback, for later {@link cancel}.
   */
  request(callback: (timeMs: number) => void): FrameHandle;
  /**
   * Cancel a previously scheduled callback.
   *
   * Cancelling a handle that is already fired, already cancelled, or unknown is a
   * no-op: the player always cancels its own handle on pause/seek/destroy, and
   * the host must tolerate being asked to cancel something it no longer has.
   */
  cancel(handle: FrameHandle): void;
}

/**
 * The lifecycle status of a player, as surfaced on {@link PlayerState}.
 */
export type PlayerStatus = 'paused' | 'playing' | 'ended';

/**
 * The options a player is created with.
 *
 * A player binds one {@link Scene} to one drawing {@link Canvas2DContext} and one
 * frame {@link FrameScheduler}. Everything is supplied at construction so the
 * player holds no hidden environment of its own; the only state it owns is its
 * clock and its subscriptions.
 */
export interface PlayerOptions {
  /**
   * The scene to play. The player schedules its timeline once at construction and
   * never mutates it.
   */
  scene: Scene;
  /**
   * The 2D context to draw onto. The player issues a render per frame through it;
   * it is the same structural contract a browser `CanvasRenderingContext2D`
   * satisfies, so a real context or a recording mock both work.
   */
  context: Canvas2DContext;
  /**
   * The render options passed to every frame's {@link import('@choreobit/renderer').renderScene}.
   *
   * Required because a render must know the surface's `width` and `height` to
   * clear and lay out. The caller supplies these (often the canvas's own size).
   */
  renderOptions: RenderOptions;
  /**
   * The frame clock the animation loop is driven by. A browser supplies
   * {@link createRequestAnimationFrameScheduler}; a test supplies a deterministic
   * fake.
   */
  frameScheduler: FrameScheduler;
  /**
   * The playback rate, in scene-seconds advanced per real second.
   *
   * Defaults to `1`. A rate of `2` plays twice as fast; `0.5` half speed. Must be
   * finite and positive when set; see {@link Player.setPlaybackRate}.
   */
  playbackRate?: number;
  /**
   * Whether the scene loops when it reaches the end.
   *
   * Defaults to `false`. When `false`, reaching the end stops the loop and sets
   * the status to `'ended'`.
   */
  loop?: boolean;
}

/**
 * An immutable snapshot of a player's state, handed to every subscriber on a
 * change.
 *
 * A fresh object is produced for each notification, so a subscriber may hold the
 * last one without it mutating underneath it. It is a *projection* of the
 * player's full state — enough for a UI to render a transport bar — not the whole
 * internal state.
 */
export interface PlayerState {
  /** The current lifecycle status. */
  readonly status: PlayerStatus;
  /** The current playback position, in scene-seconds, within `[0, duration]`. */
  readonly currentTime: number;
  /** The scene's duration, in seconds. */
  readonly duration: number;
  /** The current playback rate. */
  readonly playbackRate: number;
  /** Whether the scene loops. */
  readonly loop: boolean;
  /**
   * The last error that stopped playback, when there is one.
   *
   * Present after a failed evaluation or render has paused the player; a later
   * successful frame clears it.
   */
  readonly error?: PlayerError;
}

/**
 * A listener that receives a {@link PlayerState} snapshot on every change.
 */
export type PlayerStateListener = (state: PlayerState) => void;
