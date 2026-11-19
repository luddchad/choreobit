import { describe, expect, it } from 'vitest';
import type { Scene } from '@choreobit/core';
import { frameTimestamp, getFrameCount, resolveSceneAtTime } from '../index';

/**
 * Frame timing and scene resolution are the pure core of `@choreobit/video`.
 *
 * An {@link AnimationDefinition} carries all timing in seconds and no frame rate;
 * a video renderer picks a rate and converts between frame indices and
 * timestamps. These helpers do that conversion and resolve which scene a global
 * time falls in. Every function is pure, so the tests are direct equality checks
 * (with `toBeCloseTo` for the decimal fractions that are not exactly
 * representable in floating point).
 */

describe('frameTimestamp', () => {
  it('maps frame 0 to time 0', () => {
    expect(frameTimestamp(0, 30)).toBe(0);
  });

  it('divides the index by the frame rate', () => {
    expect(frameTimestamp(1, 30)).toBeCloseTo(1 / 30, 10);
    expect(frameTimestamp(15, 30)).toBe(0.5);
    expect(frameTimestamp(60, 30)).toBe(2);
  });

  it('honors an arbitrary frame rate', () => {
    expect(frameTimestamp(1, 24)).toBeCloseTo(1 / 24, 10);
    expect(frameTimestamp(1, 60)).toBeCloseTo(1 / 60, 10);
  });

  it('is the raw inverse n / fps (no zero-guard; the rate is validated upstream)', () => {
    expect(frameTimestamp(0, 30)).toBe(0);
    expect(Number.isNaN(frameTimestamp(0, 0))).toBe(true);
  });
});

describe('getFrameCount', () => {
  it('counts the frames a duration spans at a rate', () => {
    expect(getFrameCount(1, 30)).toBe(30);
    expect(getFrameCount(2, 30)).toBe(60);
    expect(getFrameCount(1, 60)).toBe(60);
  });

  it('ceil-rounds a duration that ends mid-frame', () => {
    expect(getFrameCount(1.5, 30)).toBe(45);
    expect(getFrameCount(0.5, 30)).toBe(15);
  });

  it('trims a spurious extra frame from float rounding', () => {
    expect(getFrameCount(3, 30)).toBe(90);
  });

  it('returns 0 for a non-positive duration', () => {
    expect(getFrameCount(0, 30)).toBe(0);
    expect(getFrameCount(-1, 30)).toBe(0);
  });

  it('returns 0 for a non-positive frame rate', () => {
    expect(getFrameCount(1, 0)).toBe(0);
    expect(getFrameCount(1, -30)).toBe(0);
  });
});

/** A scene with a bare duration and no timeline or objects. */
function scene(duration: number, id = 's'): Scene {
  return { id, duration, objects: [], timeline: { nodes: [] } };
}

describe('resolveSceneAtTime', () => {
  it('resolves a time within the first scene to that scene at the local time', () => {
    const scenes = [scene(1), scene(2)];
    const resolved = resolveSceneAtTime(scenes, 0.5);
    expect(resolved.scene).toBe(scenes[0]);
    expect(resolved.sceneIndex).toBe(0);
    expect(resolved.localTime).toBe(0.5);
  });

  it('resolves a time within a later scene to that scene with a shifted local time', () => {
    const scenes = [scene(1), scene(2)];
    const resolved = resolveSceneAtTime(scenes, 1.5);
    expect(resolved.scene).toBe(scenes[1]);
    expect(resolved.sceneIndex).toBe(1);
    expect(resolved.localTime).toBe(0.5);
  });

  it('gives a boundary time to the next scene at localTime 0 (half-open right)', () => {
    const scenes = [scene(1), scene(2)];
    const resolved = resolveSceneAtTime(scenes, 1);
    expect(resolved.scene).toBe(scenes[1]);
    expect(resolved.sceneIndex).toBe(1);
    expect(resolved.localTime).toBe(0);
  });

  it('clamps a time at or past the total to the final scene at its end', () => {
    const scenes = [scene(1), scene(2)];
    const atEnd = resolveSceneAtTime(scenes, 3);
    expect(atEnd.scene).toBe(scenes[1]);
    expect(atEnd.sceneIndex).toBe(1);
    expect(atEnd.localTime).toBe(2);

    const pastEnd = resolveSceneAtTime(scenes, 100);
    expect(pastEnd.scene).toBe(scenes[1]);
    expect(pastEnd.localTime).toBe(2);
  });

  it('resolves time 0 to the first scene at localTime 0', () => {
    const scenes = [scene(1), scene(2)];
    const resolved = resolveSceneAtTime(scenes, 0);
    expect(resolved.scene).toBe(scenes[0]);
    expect(resolved.sceneIndex).toBe(0);
    expect(resolved.localTime).toBe(0);
  });

  it('clamps a negative time to the first scene at localTime 0', () => {
    const scenes = [scene(1), scene(2)];
    const resolved = resolveSceneAtTime(scenes, -5);
    expect(resolved.scene).toBe(scenes[0]);
    expect(resolved.sceneIndex).toBe(0);
    expect(resolved.localTime).toBe(0);
  });

  it('resolves a single-scene definition to that scene', () => {
    const scenes = [scene(2)];
    const resolved = resolveSceneAtTime(scenes, 0.7);
    expect(resolved.scene).toBe(scenes[0]);
    expect(resolved.sceneIndex).toBe(0);
    expect(resolved.localTime).toBe(0.7);
  });
});
