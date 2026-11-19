import type { StableId, VisualObject } from '@choreobit/core';
import { createPrimitive } from './common';
import type { PrimitiveOptions } from './common';

/**
 * A group primitive, as a typed {@link VisualObject} builder.
 *
 * A group is a structural container, not a rendered shape: `@choreobit/renderer`
 * does not draw it, it composites its `children`. Calling {@link group} with an
 * id, a list of children, and options produces a {@link VisualObject} whose
 * `type` is `'group'` and whose `children` are the parts it composes, so a scene
 * can build a composite figure and animate the whole group or its parts.
 *
 * @example
 * ```ts
 * const figure = group('figure', [
 *   rectangle('base', { properties: { width: 80, height: 40 } }),
 *   circle('cap', { position: { x: 80, y: 0 }, properties: { radius: 12 } }),
 * ]);
 * ```
 */
export function group(
  id: StableId,
  children: readonly VisualObject[],
  options?: PrimitiveOptions,
): VisualObject {
  return createPrimitive('group', { id, options }, children);
}
