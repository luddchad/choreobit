import { describe, expect, it } from 'vitest';
import type { Scene } from '@choreobit/core';
import { AuthoringError, defineScene, move, sequence } from '../index';

/**
 * Behavioural tests for {@link defineScene}.
 *
 * A scene is a segment of an animation: its own objects plus a timeline of
 * composition nodes. The builder copies the `objects`/`nodes` arrays and the
 * `config`/`extensions` maps, defaults `timeline.nodes` to an empty array, and
 * rejects an empty id or a non-finite/non-negative duration.
 */

describe('defineScene', () => {
  it('builds a scene with a default empty timeline', () => {
    const scene = defineScene({ id: 's1', duration: 3 });
    expect(scene).toEqual({ id: 's1', duration: 3, objects: [], timeline: { nodes: [] } });
  });

  it('carries objects and nodes', () => {
    const scene = defineScene({
      id: 's1',
      duration: 2,
      objects: [{ id: 'box', type: 'rectangle', state: {} }],
      nodes: [sequence(0, move('m1', 'box', { x: 1, y: 1 }, 1))],
    });
    expect(scene.objects).toHaveLength(1);
    expect(scene.timeline.nodes).toHaveLength(1);
    expect((scene.timeline.nodes[0] as { kind: string }).kind).toBe('sequence');
  });

  it('threads config and extensions through, copied', () => {
    const config = { caption: 'first' };
    const scene = defineScene({ id: 's1', duration: 1, config });
    config.caption = 'changed';
    expect(scene.config).toEqual({ caption: 'first' });
  });

  it('copies the objects and nodes arrays', () => {
    const objects = [{ id: 'a', type: 'rectangle', state: {} }];
    const scene = defineScene({ id: 's1', duration: 1, objects });
    objects.push({ id: 'b', type: 'circle', state: {} });
    expect(scene.objects).toHaveLength(1);
  });

  it('rejects an empty id', () => {
    expect(() => defineScene({ id: '', duration: 1 })).toThrow(AuthoringError);
  });

  it('rejects a negative duration', () => {
    expect(() => defineScene({ id: 's1', duration: -1 })).toThrow(AuthoringError);
  });

  it('rejects a non-finite duration', () => {
    expect(() => defineScene({ id: 's1', duration: Number.NaN })).toThrow(AuthoringError);
  });

  it('produces a Scene typed value', () => {
    const scene: Scene = defineScene({ id: 's1', duration: 1 });
    expect(scene.id).toBe('s1');
  });
});
