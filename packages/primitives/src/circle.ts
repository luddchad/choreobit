import type { StableId, VisualObject } from '@choreobit/core';
import { createPrimitive } from './common';
import type { PrimitiveOptions } from './common';

/**
 * The options a circle primitive accepts: the shared options plus type-specific
 * properties such as `radius`, `fill`, and `stroke`.
 */
export interface CircleOptions extends PrimitiveOptions {
  /**
   * Type-specific properties for the circle, e.g. `{ radius, fill, stroke }`.
   * Merged into the object's state `properties`; a renderer fills in any the
   * caller omits.
   */
  properties?: PrimitiveOptions['properties'];
}

/**
 * Build a circle {@link VisualObject} from its id and options.
 *
 * The produced object's `type` is `'circle'`, one of the shapes
 * `@choreobit/renderer` draws.
 *
 * @example
 * ```ts
 * const dot = circle('dot', {
 *   position: { x: 200, y: 150 },
 *   properties: { radius: 24, fill: '#22c55e' },
 * });
 * ```
 */
export function circle(id: StableId, options?: CircleOptions): VisualObject {
  return createPrimitive('circle', { id, options });
}
