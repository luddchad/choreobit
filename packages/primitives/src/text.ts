import type { StableId, VisualObject } from '@choreobit/core';
import { createPrimitive } from './common';
import type { PrimitiveOptions } from './common';

/**
 * The options a text primitive accepts: the shared options plus the text content
 * and type-specific properties such as `fontSize`, `fontFamily`, and `color`.
 */
export interface TextOptions extends PrimitiveOptions {
  /**
   * The string the text object renders. Stored as a `properties` entry; a
   * renderer reads it when drawing. When omitted, the object has no text.
   */
  text?: string;
  /**
   * Type-specific properties for the text, e.g. `{ fontSize, fontFamily, color }`.
   * Merged into the object's state `properties`; a renderer fills in any the
   * caller omits.
   */
  properties?: PrimitiveOptions['properties'];
}

/**
 * Build a text {@link VisualObject} from its id, the text content, and options.
 *
 * The `text` is stored in the object's `properties.text` so it is part of the
 * serializable definition. When both a `text` argument and a `properties.text`
 * are given, the `text` argument wins. The produced object's `type` is `'text'`,
 * one of the shapes `@choreobit/renderer` draws.
 *
 * @example
 * ```ts
 * const label = text('label', 'midpoint', {
 *   position: { x: 300, y: 50 },
 *   properties: { fontSize: 20, color: '#111111' },
 * });
 * ```
 */
export function text(id: StableId, content?: string, options?: TextOptions): VisualObject {
  const merged =
    content === undefined
      ? options
      : { ...(options ?? {}), properties: { ...(options?.properties ?? {}), text: content } };
  return createPrimitive('text', { id, options: merged });
}
