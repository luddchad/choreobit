import { describe, expect, it } from 'vitest';
import { VIDEO_ERROR_CODES, VideoError, isVideoError, type VideoErrorCode } from '../index';

/**
 * `VideoError` is the single failure type `@choreobit/video` throws. It owns the
 * codes a frame renderer can produce and may wrap an underlying
 * `EvaluationError`/`RendererError` in its `cause`. These tests pin the surface
 * without depending on the underlying packages' error types.
 */

describe('VIDEO_ERROR_CODES', () => {
  it('lists the closed set of failure codes', () => {
    expect([...VIDEO_ERROR_CODES]).toEqual([
      'invalidDefinition',
      'invalidFps',
      'invalidFrameIndex',
      'evaluation',
      'render',
    ]);
  });

  it('is a readonly tuple whose members are VideoErrorCode', () => {
    const codes: readonly VideoErrorCode[] = VIDEO_ERROR_CODES;
    expect(codes.length).toBe(5);
  });
});

describe('VideoError', () => {
  it('carries a code, message, and name', () => {
    const error = new VideoError({ code: 'invalidFps', message: 'bad rate' });
    expect(error.name).toBe('VideoError');
    expect(error.code).toBe('invalidFps');
    expect(error.message).toBe('bad rate');
    expect(error instanceof Error).toBe(true);
  });

  it('exposes an optional cause when one is supplied', () => {
    const underlying = new Error('downstream');
    const error = new VideoError({
      code: 'render',
      message: 'render failed',
      cause: underlying,
    });
    expect(error.cause).toBe(underlying);
  });

  it('leaves cause undefined when none is supplied', () => {
    const error = new VideoError({ code: 'invalidFrameIndex', message: 'out of range' });
    expect(error.cause).toBeUndefined();
  });

  it('surfaces the cause through the standard Error option', () => {
    const underlying = new Error('downstream');
    const error = new VideoError({
      code: 'evaluation',
      message: 'evaluation failed',
      cause: underlying,
    });
    expect((error as { cause?: unknown }).cause).toBe(underlying);
    // The standard cause option means the underlying message is reachable.
    expect(error.stack).toBeDefined();
  });
});

describe('isVideoError', () => {
  it('recognizes a VideoError', () => {
    const error = new VideoError({ code: 'invalidDefinition', message: 'malformed' });
    expect(isVideoError(error)).toBe(true);
  });

  it('rejects a plain Error', () => {
    expect(isVideoError(new Error('nope'))).toBe(false);
  });

  it('rejects non-error values', () => {
    expect(isVideoError('string')).toBe(false);
    expect(isVideoError(42)).toBe(false);
    expect(isVideoError(null)).toBe(false);
    expect(isVideoError(undefined)).toBe(false);
  });
});
