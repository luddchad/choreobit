import type { Scene } from '@choreobit/core';
import { evaluateSceneAt, scheduleTimeline } from '@choreobit/animation';
import type { TimelineSchedule } from '@choreobit/animation';
import { renderScene } from '@choreobit/renderer';
import type { Canvas2DContext, RenderOptions } from '@choreobit/renderer';
import { PlayerError } from './error';
import { createSemanticStepper } from './stepping';
import type { SemanticStepper } from './stepping';
import type {
  FrameHandle,
  FrameScheduler,
  PlayerOptions,
  PlayerState,
  PlayerStateListener,
} from './types';

/**
 * The browser-free playback controller.
 *
 * A `Player` advances a scene's timeline through time and renders each resulting
 * frame to a 2D context, driven by a {@link FrameScheduler} (typically a
 * `requestAnimationFrame` adapter). It owns the *logic* of an animation loop —
 * advancing time, evaluating, rendering, stopping, looping — and delegates the
 * *timing* to the scheduler, so the loop is deterministic under test.
 *
 * A player renders a **fixed** `Scene` and a fixed {@link Canvas2DContext} and
 * {@link RenderOptions}. The schedule is computed once from the scene's timeline
 * at construction. A player is not a live scene: it does not mutate the scene,
 * and it does not re-schedule.
 */
export class Player {
  /** The scene being played. */
  readonly scene: Scene;
  /** The 2D context rendered onto. */
  readonly context: Canvas2DContext;
  /** The render options applied to every frame. */
  readonly renderOptions: RenderOptions;
  /** The scheduler that drives the loop. */
  readonly frameScheduler: FrameScheduler;
  /** The computed timeline schedule, reused across every evaluation. */
  readonly schedule: TimelineSchedule;
  /** The scene's duration, the maximum evaluation time. */
  readonly duration: number;
  /**
   * The distinct semantic step boundaries (step start times), sorted ascending
   * and frozen. Empty when the player was built without {@link PlayerOptions.semanticSteps}.
   */
  readonly stopTimes: readonly number[];

  private status: PlayerState['status'] = 'paused';
  private currentTime = 0;
  private playbackRate = 1;
  private loop = false;
  private error: PlayerError | null = null;
  private lastFrameMs: number | null = null;
  private pendingHandle: FrameHandle | null = null;
  private destroyed = false;
  private readonly listeners = new Set<PlayerStateListener>();
  private readonly stepper: SemanticStepper;

  /**
   * Build a player.
   *
   * The scene's timeline is scheduled once here, so the schedule is reused across
   * every evaluation rather than recomputed per frame. `playbackRate` defaults to
   * `1` and `loop` to `false` when not supplied. When `semanticSteps` are given,
   * a {@link SemanticStepper} is built from them (scoped to the scene) so the
   * player can step between beats; absent steps leave an empty stepper.
   */
  constructor(options: PlayerOptions) {
    this.scene = options.scene;
    this.context = options.context;
    this.renderOptions = options.renderOptions;
    this.frameScheduler = options.frameScheduler;
    this.schedule = scheduleTimeline(options.scene.timeline);
    this.duration = this.schedule.duration;
    this.playbackRate = options.playbackRate ?? 1;
    this.loop = options.loop ?? false;
    this.stepper = createSemanticStepper(options.semanticSteps ?? [], this.scene.id, this.duration);
    this.stopTimes = this.stepper.stopTimes;
  }

  /**
   * Start (or resume) playback from the current time.
   *
   * Clears any prior error, marks the player playing, and schedules the first
   * frame. On the first tick after a (re)start the scheduler's timestamp only
   * seeds the clock (`lastFrameMs`) and advances no time, so the next tick
   * measures a real delta. A no-op when already playing.
   */
  play(): void {
    this.assertAlive();
    if (this.status === 'playing') return;
    this.error = null;
    this.lastFrameMs = null;
    if (this.duration <= 0) {
      this.renderAt(0);
      this.setStatus('ended');
      return;
    }
    this.setStatus('playing');
    this.scheduleTick();
  }

  /**
   * Pause playback.
   *
   * Cancels any pending frame and stops the clock. The current time is kept, so
   * `play()` resumes from where it stopped. A no-op when not playing.
   */
  pause(): void {
    this.assertAlive();
    if (this.status !== 'playing') return;
    this.cancelPending();
    this.setStatus('paused');
  }

  /**
   * Stop and return to the start, paused.
   *
   * Cancels any pending frame, resets the time to `0`, renders frame `0`, and
   * clears any error. It does **not** auto-play.
   */
  restart(): void {
    this.assertAlive();
    this.cancelPending();
    this.currentTime = 0;
    this.lastFrameMs = null;
    this.error = null;
    this.status = 'paused';
    this.renderAt(0);
  }

  /**
   * Jump to an absolute time, paused.
   *
   * The time is clamped to `[0, duration]`. The pending frame is cancelled, the
   * clock reset, and the frame at the new time rendered. A no-op when not
   * playing.
   */
  seek(time: number): void {
    this.assertAlive();
    this.cancelPending();
    this.currentTime = this.clamp(time);
    this.lastFrameMs = null;
    this.status = 'paused';
    this.renderAt(this.currentTime);
  }

  /**
   * Step forward to the next semantic beat.
   *
   * Seeks to the smallest step boundary strictly after the current time. Because
   * the comparison is strict, a position that sits exactly on a boundary advances
   * to the *following* one rather than staying. The step is reached with the
   * player's ordinary {@link seek}, so it cancels any pending frame, pauses, and
   * renders the new frame through the single evaluation path. Returns `false`
   * (without seeking) when there is no later boundary.
   */
  stepForward(): boolean {
    this.assertAlive();
    const target = this.stepper.nextStop(this.currentTime);
    if (target === null) return false;
    this.seek(target);
    return true;
  }

  /**
   * Step backward to the previous semantic beat.
   *
   * Seeks to the largest step boundary strictly before the current time, mirroring
   * {@link stepForward} in the other direction. Returns `false` (without seeking)
   * when there is no earlier boundary.
   */
  stepBackward(): boolean {
    this.assertAlive();
    const target = this.stepper.previousStop(this.currentTime);
    if (target === null) return false;
    this.seek(target);
    return true;
  }

  /**
   * Whether {@link stepForward} would advance.
   *
   * A pure read of the current position against the stops; it does not touch the
   * clock or render, so it is safe to poll from a UI without disturbing playback.
   */
  hasNextStep(): boolean {
    return this.stepper.hasNext(this.currentTime);
  }

  /**
   * Whether {@link stepBackward} would advance.
   *
   * A pure read of the current position against the stops; it does not touch the
   * clock or render, so it is safe to poll from a UI without disturbing playback.
   */
  hasPreviousStep(): boolean {
    return this.stepper.hasPrevious(this.currentTime);
  }

  /**
   * Set the playback rate.
   *
   * The rate must be finite and positive; anything else throws a
   * {@link PlayerError} of code `'invalid'`. A live loop keeps its time and only
   * changes the rate of subsequent advancement.
   */
  setPlaybackRate(rate: number): void {
    this.assertAlive();
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new PlayerError({
        code: 'invalid',
        message: `setPlaybackRate: rate must be a positive finite number, got ${String(rate)}`,
      });
    }
    this.playbackRate = rate;
  }

  /**
   * Toggle loop mode.
   *
   * When enabled, the time wraps at the duration; when disabled, playback ends at
   * the duration. A live loop reads the new value on its next tick.
   */
  setLoop(loop: boolean): void {
    this.assertAlive();
    this.loop = loop;
  }

  /**
   * Snapshot the player's current state.
   *
   * Returns a fresh immutable {@link PlayerState}; the player's internal state is
   * not exposed by reference.
   */
  getState(): PlayerState {
    return this.snapshot();
  }

  /**
   * Subscribe to state changes.
   *
   * `listener` is invoked with a fresh {@link PlayerState} snapshot whenever the
   * player's status, time, rate, or error changes — on `play`, `pause`,
   * `restart`, `seek`, `setPlaybackRate`, `setLoop`, and on every tick. Returns
   * an unsubscribe function.
   */
  subscribe(listener: PlayerStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Tear the player down.
   *
   * Cancels any pending frame and removes all subscribers. After `destroy()`,
   * every other method throws a {@link PlayerError} of code `'destroyed'`. It is
   * idempotent.
   */
  destroy(): void {
    this.cancelPending();
    this.listeners.clear();
    this.destroyed = true;
  }

  /**
   * The per-tick driver, invoked by the scheduler with the host's timestamp.
   *
   * The first tick after a (re)start seeds the clock with no advance; subsequent
   * ticks advance by `deltaSeconds * playbackRate`, evaluate and render, then
   * either schedule the next frame, loop, or end. A failed evaluation or render
   * stops the loop and reports the error.
   */
  private tick = (timeMs: number): void => {
    this.pendingHandle = null;
    const deltaMs = this.lastFrameMs === null ? 0 : timeMs - this.lastFrameMs;
    this.lastFrameMs = timeMs;
    const deltaSeconds = deltaMs / 1000;
    this.advance(deltaSeconds);
  };

  /**
   * Advance by one measured interval, rendering the result.
   *
   * Advances the time, loops or ends as configured, and renders the new frame. If
   * playback is still live after the frame (not ended by the advance and not
   * failed by the render), the next frame is scheduled. A zero-duration scene
   * ends immediately after rendering its single frame.
   */
  private advance(deltaSeconds: number): void {
    const next = this.currentTime + deltaSeconds * this.playbackRate;
    this.currentTime = this.stepTime(next);
    this.renderAt(this.currentTime);
    this.scheduleTick();
  }

  /**
   * Fold a raw advanced time into the player's current time.
   *
   * When looping, the time wraps into `[0, duration)` (guarded by a non-zero
   * duration). Otherwise it is clamped to `[0, duration]`; reaching the duration
   * ends playback.
   */
  private stepTime(raw: number): number {
    if (this.loop && this.duration > 0) {
      return raw % this.duration;
    }
    if (raw >= this.duration) {
      this.endTime();
      return this.duration;
    }
    return raw;
  }

  /**
   * Stop the loop at the end.
   *
   * Cancels the pending frame and marks the player ended. The final frame at the
   * duration is rendered by the caller, which then notifies.
   */
  private endTime(): void {
    this.cancelPending();
    this.status = 'ended';
  }

  /**
   * Render a frame at `time`, reporting any failure.
   *
   * Evaluates the scene at `time` and renders it. A failed evaluation or a
   * thrown render stops the loop, sets the error, and does not render — a defect
   * surfaces instead of drawing a partial frame.
   */
  private renderAt(time: number): void {
    const evaluation = evaluateSceneAt(this.scene, this.schedule, time);
    if (!evaluation.ok) {
      this.fail(
        new PlayerError({
          code: 'evaluation',
          message: `evaluation failed: ${evaluation.error.message}`,
          cause: evaluation.error,
        }),
      );
      return;
    }
    try {
      renderScene(this.context, evaluation.state, this.renderOptions);
    } catch (error) {
      this.fail(
        new PlayerError({
          code: 'render',
          message: `render failed: ${(error as Error)?.message ?? String(error)}`,
          cause: error,
        }),
      );
      return;
    }
    this.error = null;
    this.setStatus(this.status);
  }

  /**
   * Handle a playback failure.
   *
   * Stops the loop, keeps the current time, sets the error, and notifies. The
   * frame that failed is not rendered.
   */
  private fail(error: PlayerError): void {
    this.cancelPending();
    this.status = 'paused';
    this.error = error;
    this.notify();
  }

  /**
   * Schedule the next frame, unless the player is not playing or already has a
   * frame pending.
   */
  private scheduleTick(): void {
    if (this.status !== 'playing') return;
    if (this.pendingHandle !== null) return;
    this.pendingHandle = this.frameScheduler.request(this.tick);
  }

  /**
   * Cancel the pending frame, if any.
   */
  private cancelPending(): void {
    if (this.pendingHandle === null) return;
    this.frameScheduler.cancel(this.pendingHandle);
    this.pendingHandle = null;
  }

  /**
   * Clamp a time to `[0, duration]`.
   */
  private clamp(time: number): number {
    if (!Number.isFinite(time)) return 0;
    if (time < 0) return 0;
    if (time > this.duration) return this.duration;
    return time;
  }

  /**
   * Update the status and notify if it changed.
   */
  private setStatus(status: PlayerState['status']): void {
    if (this.status === status) {
      this.notify();
      return;
    }
    this.status = status;
    this.notify();
  }

  /**
   * Notify every listener with a fresh snapshot.
   *
   * A listener is invoked through a `try`/`catch` so a throwing listener does not
   * abort the loop or prevent other listeners from being notified.
   */
  private notify(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // A misbehaving listener must not break the loop or other listeners.
      }
    }
  }

  /**
   * Build a fresh, immutable snapshot of the current state.
   */
  private snapshot(): PlayerState {
    return {
      status: this.status,
      currentTime: this.currentTime,
      duration: this.duration,
      playbackRate: this.playbackRate,
      loop: this.loop,
      error: this.error ?? undefined,
    };
  }

  /**
   * Assert the player is alive, throwing a {@link PlayerError} if it has been
   * destroyed.
   */
  private assertAlive(): void {
    if (this.destroyed) {
      throw new PlayerError({
        code: 'destroyed',
        message: 'player has been destroyed',
      });
    }
  }
}
