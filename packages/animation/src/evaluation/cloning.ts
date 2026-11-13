import type { JsonValue } from '@choreobit/core';

/**
 * Deep structural cloning of a JSON value.
 *
 * The evaluator's snapshots must share **no references** with the source scene
 * or with one another, even for nested structures: a `properties` bag that holds
 * an object or an array value must be copied at every level, so a renderer that
 * mutates a nested field of a frame cannot reach the source scene or a sibling
 * frame. A shallow copy of the top-level bag is not enough — its nested values
 * would still alias.
 *
 * The function is recursive over the whole {@link JsonValue} domain: `null` is
 * returned as `null`; the primitives (`boolean`, `number`, `string`) are
 * returned by value (no copy is possible or needed); arrays and objects are
 * rebuilt element by element. Numbers are copied by value, so `NaN` and
 * `Infinity` survive intact without a `JSON` round-trip (which would rewrite
 * them to `null`).
 */
export function deepCloneJsonValue(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'object') {
    // A primitive (boolean, number, string): returned by value.
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((element) => deepCloneJsonValue(element)) as unknown as JsonValue;
  }
  const out: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value)) {
    out[key] = deepCloneJsonValue(value[key])!;
  }
  return out;
}

/**
 * The deep copy of a JSON map, or `undefined` when the input is `undefined`.
 *
 * A convenience over {@link deepCloneJsonValue} for the map-typed fields the
 * evaluator carries (`properties`, `extensions`): it copies the top-level map and
 * every value it holds, recursively.
 */
export function deepCloneJsonMap(
  map: { [key: string]: JsonValue } | undefined,
): { [key: string]: JsonValue } | undefined {
  return deepCloneJsonValue(map) as { [key: string]: JsonValue } | undefined;
}
