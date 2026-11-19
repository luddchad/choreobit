import type { StableId, VisualObject } from '@choreobit/core';
import { createPrimitive } from './common';
import type { PrimitiveOptions } from './common';

/**
 * A rectangle primitive, as a typed {@link VisualObject} builder.
 *
 * Calling it with an id and options produces a {@link VisualObject} whose `type`
 * is `'rectangle'` — one of the shapes `@choreobit/renderer` draws — ready to be
 * placed in a scene and animated by `@choreobit/authoring`. The options control
 * only the initial {@link VisualObjectState}; the geometry (`width`, `height`,
 * `fill`, `stroke`, `lineWidth`) lives in `properties` and is left to the caller
 * and the renderer to default.
 */
export interface RectangleOptions extends PrimitiveOptions {
  /**
   * Type-specific properties for the rectangle, e.g. `{ width, height, fill }`.
   * Merged into the object's state `properties`; a renderer fills in any the
   * caller omits.
   */
  properties?: PrimitiveOptions['properties'];
}

/**
 * Build a rectangle {@link VisualObject} from its id and options.
 *
 * @example
 * ```ts
 * const box = rectangle('box', {
 *   position: { x: 100, y: 100 },
 *   properties: { width: 40, height: 40, fill: '#4f8cff' },
 * });
 * ```
 */
export function rectangle(id: StableId, options?: RectangleOptions): VisualObject {
  return createPrimitive('rectangle', { id, options });
}
