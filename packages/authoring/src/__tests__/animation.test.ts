import { describe, expect, it } from 'vitest';
import { ANIMATION_DEFINITION_FORMAT_VERSION, validateAnimationDefinition } from '@choreobit/core';
import {
  AuthoringError,
  circle,
  defineAnimation,
  defineScene,
  highlight,
  move,
  parallel,
  rectangle,
  semanticStep,
  sequence,
  setVisible,
  sourceCode,
} from '../index';

/**
 * Behavioural tests for {@link defineAnimation}, the top-level authoring entry
 * point, plus an end-to-end check that a fully authored definition is accepted by
 * core's {@link validateAnimationDefinition}.
 *
 * A definition stitches scenes, semantic steps, and source-code presentation into
 * one portable document. Its `duration` defaults to the sum of its scenes'
 * durations, and its `formatVersion` defaults to the current core version.
 */

describe('defineAnimation', () => {
  it('defaults its duration to the sum of its scenes', () => {
    const def = defineAnimation({
      id: 'anim',
      name: 'Demo',
      width: 800,
      height: 600,
      scenes: [defineScene({ id: 's1', duration: 2 }), defineScene({ id: 's2', duration: 3 })],
    });
    expect(def.duration).toBe(5);
  });

  it('honours an explicit duration when given', () => {
    const def = defineAnimation({
      id: 'anim',
      name: 'Demo',
      width: 1,
      height: 1,
      duration: 10,
      scenes: [defineScene({ id: 's1', duration: 2 })],
    });
    expect(def.duration).toBe(10);
  });

  it('defaults the formatVersion to the current core version', () => {
    const def = defineAnimation({
      id: 'anim',
      name: 'Demo',
      width: 1,
      height: 1,
      scenes: [defineScene({ id: 's1', duration: 1 })],
    });
    expect(def.formatVersion).toBe(ANIMATION_DEFINITION_FORMAT_VERSION);
  });

  it('threads optional metadata through, copied', () => {
    const metadata = { course: 'cs101' };
    const def = defineAnimation({
      id: 'anim',
      name: 'Demo',
      width: 1,
      height: 1,
      authoring: { author: 'Ada', metadata },
      background: { kind: 'solid', color: '#fff' },
      scenes: [defineScene({ id: 's1', duration: 1 })],
    });
    metadata.course = 'cs202';
    expect(def.authoring?.metadata).toEqual({ course: 'cs101' });
    expect(def.background).toEqual({ kind: 'solid', color: '#fff' });
  });

  it('rejects an empty id or name', () => {
    expect(() =>
      defineAnimation({
        id: '',
        name: 'Demo',
        width: 1,
        height: 1,
        scenes: [],
      }),
    ).toThrow(AuthoringError);
    expect(() =>
      defineAnimation({
        id: 'anim',
        name: '',
        width: 1,
        height: 1,
        scenes: [],
      }),
    ).toThrow(AuthoringError);
  });

  it('rejects a negative width', () => {
    expect(() =>
      defineAnimation({ id: 'anim', name: 'Demo', width: -1, height: 1, scenes: [] }),
    ).toThrow(AuthoringError);
  });

  it('does not mutate its input scenes', () => {
    const scene = defineScene({ id: 's1', duration: 1 });
    defineAnimation({ id: 'anim', name: 'Demo', width: 1, height: 1, scenes: [scene] });
    expect(scene.id).toBe('s1');
  });
});

describe('defineAnimation end-to-end', () => {
  it('produces a definition that passes core validation', () => {
    const scene = defineScene({
      id: 'scene-1',
      duration: 2,
      objects: [
        rectangle('box', { position: { x: 0, y: 0 }, properties: { width: 40, height: 40 } }),
        circle('dot', { position: { x: 100, y: 100 }, properties: { radius: 12 } }),
      ],
      nodes: [
        sequence(0, move('move-1', 'box', { x: 200, y: 100 }, 1), highlight('hl-1', 'box')),
        parallel(1, setVisible('vis-1', 'dot', { visible: false })),
      ],
    });

    const step = semanticStep('step-1', {
      sceneId: 'scene-1',
      description: 'slide the box over and hide the dot',
      start: 0,
      end: 2,
      operations: ['move-1', 'hl-1', 'vis-1'],
      sourceLocations: [{ line: 5, column: 1 }],
    });

    const def = defineAnimation({
      id: 'anim-1',
      name: 'Slide and hide',
      description: 'a box slides over while a dot is hidden',
      width: 800,
      height: 600,
      background: { kind: 'solid', color: '#111827' },
      scenes: [scene],
      semanticSteps: [step],
      sourceCode: sourceCode({
        language: 'python',
        content: 'box.move_to(200, 100)\n',
        filename: 'demo.py',
      }),
    });

    expect(def.duration).toBe(2);
    const result = validateAnimationDefinition(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('is JSON-serializable without losing structure', () => {
    const def = defineAnimation({
      id: 'anim',
      name: 'Demo',
      width: 100,
      height: 100,
      scenes: [defineScene({ id: 's1', duration: 1, objects: [rectangle('box')] })],
    });
    const roundTripped = JSON.parse(JSON.stringify(def));
    expect(roundTripped.id).toBe('anim');
    expect(roundTripped.scenes[0].objects[0].type).toBe('rectangle');
  });
});
