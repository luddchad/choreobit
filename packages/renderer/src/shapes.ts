import type { EvaluatedVisualObject } from '@choreobit/animation';
import { RendererError } from './error';
import type { Canvas2DContext } from './types';

/**
 * The object types the Canvas 2D backend knows how to draw.
 *
 * These are the closed set the renderer interprets; any other type is reported as
 * an {@link RendererErrorCode.unsupportedType}. The renderer never guesses how to
 * draw an unknown type.
 */
export const SUPPORTED_OBJECT_TYPES = ['rectangle', 'circle', 'text'] as const;

/** The object types the renderer draws. */
export type SupportedObjectType = (typeof SUPPORTED_OBJECT_TYPES)[number];

/**
 * The documented default drawing style.
 *
 * A property that is absent falls back to its default here; a property that is
 * present but of the wrong kind is a malformed-property error rather than a
 * silent default, so a typo in a scene never hides in a rendered frame.
 */
export const DEFAULT_STYLE = {
  /** The fill color when none is given. */
  fill: '#4f8cff',
  /** No stroke by default; an object is filled unless a stroke is requested. */
  stroke: null,
  /** The line width, in pixels, for strokes. */
  lineWidth: 1,
  /** The font size, in pixels, for text. */
  fontSize: 16,
  /** The font family for text. */
  fontFamily: 'sans-serif',
  /** The text color when none is given. */
  textColor: '#111111',
  /** The text alignment. */
  textAlign: 'center',
  /** The text baseline. */
  textBaseline: 'middle',
} as const;

/**
 * The documented default highlight style.
 *
 * A highlighted object is outlined in this color when no per-object or
 * per-render highlight color is supplied. The `pad` insets/extends the outline so
 * it does not coincide with the shape's own edge, and the `lineWidth` is the
 * outline's thickness.
 */
export const HIGHLIGHT_STYLE = {
  /** The outline color when no highlight color is otherwise supplied. */
  color: '#ffcc00',
  /** The outline thickness, in pixels. */
  lineWidth: 3,
  /** The padding, in pixels, between a shape's edge and its highlight outline. */
  pad: 4,
} as const;

/**
 * Read a required numeric property, throwing when it is absent or malformed.
 *
 * A required property must be present, a finite number, and strictly positive —
 * the three degenerate cases (missing, non-numeric, non-positive) are reported so
 * a malformed scene surfaces immediately. The error carries the object's id and
 * type so it is self-describing.
 */
function readRequiredNumber(
  properties: { [key: string]: unknown },
  key: string,
  object: EvaluatedVisualObject,
): number {
  const value = properties[key];
  if (value === undefined) {
    throw new RendererError({
      code: 'missingProperty',
      message: `Object ${object.id} (${object.type}) is missing required property '${key}'.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be a finite number, got ${describe(value)}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  if (value <= 0) {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be positive, got ${value}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  return value;
}

/**
 * Read an optional numeric property, returning the default when it is absent.
 *
 * When the property is present it must be a finite number; a non-numeric value is
 * a malformed-property error, so a typo never silently falls back to a default.
 */
function readOptionalNumber(
  properties: { [key: string]: unknown },
  key: string,
  fallback: number,
  object: EvaluatedVisualObject,
): number {
  const value = properties[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be a finite number, got ${describe(value)}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  return value;
}

/**
 * Read a required string property, throwing when it is absent or not a string.
 */
function readRequiredString(
  properties: { [key: string]: unknown },
  key: string,
  object: EvaluatedVisualObject,
): string {
  const value = properties[key];
  if (value === undefined) {
    throw new RendererError({
      code: 'missingProperty',
      message: `Object ${object.id} (${object.type}) is missing required property '${key}'.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  if (typeof value !== 'string') {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be a string, got ${describe(value)}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  return value;
}

/**
 * Read an optional string property, returning the default when it is absent.
 *
 * When present it must be a string; a non-string value is a malformed-property
 * error.
 */
function readOptionalString(
  properties: { [key: string]: unknown },
  key: string,
  fallback: string,
  object: EvaluatedVisualObject,
): string {
  const value = properties[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be a string, got ${describe(value)}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  return value;
}

/**
 * Read an optional stroke color. Absent means "no stroke" (`null`); when present
 * it must be a string, otherwise it is a malformed-property error.
 */
function readOptionalStroke(
  properties: { [key: string]: unknown },
  key: string,
  object: EvaluatedVisualObject,
): string | null {
  const value = properties[key];
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    throw new RendererError({
      code: 'malformedProperty',
      message: `Object ${object.id} (${object.type}) property '${key}' must be a string or absent, got ${describe(value)}.`,
      objectId: object.id,
      objectType: object.type,
      property: key,
    });
  }
  return value;
}

/**
 * A short, human-readable rendering of an unexpected value, for error messages.
 */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return typeof value;
}

/**
 * Draw a rectangle centered at the current origin.
 *
 * Requires positive `width` and `height`. Fills with the object's fill color (or
 * the default) and, when a stroke is requested, strokes the same rectangle. A
 * highlighted rectangle gets a padded outline in the highlight color.
 */
function drawRectangle(
  ctx: Canvas2DContext,
  object: EvaluatedVisualObject,
  highlightColor: string,
): void {
  const width = readRequiredNumber(object.state.properties, 'width', object);
  const height = readRequiredNumber(object.state.properties, 'height', object);
  const fill = readOptionalString(object.state.properties, 'fill', DEFAULT_STYLE.fill, object);
  const stroke = readOptionalStroke(object.state.properties, 'stroke', object);
  const lineWidth = readOptionalNumber(
    object.state.properties,
    'lineWidth',
    DEFAULT_STYLE.lineWidth,
    object,
  );

  const x = -width / 2;
  const y = -height / 2;

  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);

  if (stroke !== null) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, width, height);
  }

  if (object.state.highlighted) {
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = HIGHLIGHT_STYLE.lineWidth;
    ctx.strokeRect(
      x - HIGHLIGHT_STYLE.pad,
      y - HIGHLIGHT_STYLE.pad,
      width + HIGHLIGHT_STYLE.pad * 2,
      height + HIGHLIGHT_STYLE.pad * 2,
    );
  }
}

/**
 * Draw a circle centered at the current origin.
 *
 * Requires a positive `radius`. Fills with the object's fill color and, when a
 * stroke is requested, strokes the same circle. A highlighted circle gets a
 * slightly larger outline in the highlight color.
 */
function drawCircle(
  ctx: Canvas2DContext,
  object: EvaluatedVisualObject,
  highlightColor: string,
): void {
  const radius = readRequiredNumber(object.state.properties, 'radius', object);
  const fill = readOptionalString(object.state.properties, 'fill', DEFAULT_STYLE.fill, object);
  const stroke = readOptionalStroke(object.state.properties, 'stroke', object);
  const lineWidth = readOptionalNumber(
    object.state.properties,
    'lineWidth',
    DEFAULT_STYLE.lineWidth,
    object,
  );

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke !== null) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  if (object.state.highlighted) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + HIGHLIGHT_STYLE.pad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = HIGHLIGHT_STYLE.lineWidth;
    ctx.stroke();
  }
}

/**
 * Draw text at the current origin.
 *
 * Requires `text`. The font is composed from an optional `fontSize` and
 * `fontFamily` (both defaulted), and the fill uses an optional `color`. A
 * highlighted text gets an outline via `strokeText` in the highlight color.
 */
function drawText(
  ctx: Canvas2DContext,
  object: EvaluatedVisualObject,
  highlightColor: string,
): void {
  const text = readRequiredString(object.state.properties, 'text', object);
  const color = readOptionalString(
    object.state.properties,
    'color',
    DEFAULT_STYLE.textColor,
    object,
  );
  const fontSize = readOptionalNumber(
    object.state.properties,
    'fontSize',
    DEFAULT_STYLE.fontSize,
    object,
  );
  const fontFamily = readOptionalString(
    object.state.properties,
    'fontFamily',
    DEFAULT_STYLE.fontFamily,
    object,
  );
  const align = readOptionalString(
    object.state.properties,
    'textAlign',
    DEFAULT_STYLE.textAlign,
    object,
  );
  const baseline = readOptionalString(
    object.state.properties,
    'textBaseline',
    DEFAULT_STYLE.textBaseline,
    object,
  );

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);

  if (object.state.highlighted) {
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = HIGHLIGHT_STYLE.lineWidth;
    ctx.strokeText(text, 0, 0);
  }
}

/**
 * Dispatch a known object to its drawing routine.
 *
 * Throws an {@link RendererErrorCode.unsupportedType} error for a type the
 * renderer does not interpret, so an unknown type never renders as nothing
 * silent.
 */
export function drawShape(
  ctx: Canvas2DContext,
  object: EvaluatedVisualObject,
  highlightColor: string,
): void {
  switch (object.type) {
    case 'rectangle':
      drawRectangle(ctx, object, highlightColor);
      return;
    case 'circle':
      drawCircle(ctx, object, highlightColor);
      return;
    case 'text':
      drawText(ctx, object, highlightColor);
      return;
    default:
      throw new RendererError({
        code: 'unsupportedType',
        message: `Cannot render object ${object.id}: unsupported type ${describe(object.type)}.`,
        objectId: object.id,
        objectType: object.type,
      });
  }
}
