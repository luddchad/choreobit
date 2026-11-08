import type { JsonValue } from './common';

/**
 * A location in a source file, 1-based line, 1-based column.
 *
 * Line and column are the conventional source locations a code editor or
 * viewer would highlight. `endLine`/`endColumn` let a location span a range.
 * A {@link SemanticStep} references these directly, so a step may map to several
 * lines and several steps may map to the same line.
 */
export interface SourceLocation {
  /** 1-based line number. */
  line: number;
  /** 1-based column within the line. */
  column?: number;
  /** 1-based end line for a range that spans multiple lines. */
  endLine?: number;
  /** 1-based end column for a range that ends mid-line. */
  endColumn?: number;
  /** A human-readable description of the referenced region. */
  description?: string;
}

/**
 * The source-code presentation attached to an animation definition.
 *
 * This is data only: core does not parse, highlight, or edit code. A `language`
 * plus either inlined `content` or an external `reference` lets a player display
 * the code a student is reading alongside the animation. The mapping from steps
 * to source lives on each {@link SemanticStep.sourceLocations}.
 */
export interface SourceCode {
  /** The source language (e.g. `'python'`, `'typescript'`, `'java'`). */
  language: string;
  /** An identifier or path for the source, when it is not inlined. */
  filename?: string;
  /** The source text, when it is inlined into the definition. */
  content?: string;
  /** An external reference (e.g. a URL or a resource id) when not inlined. */
  reference?: string;
  /** Vendor/extension data for forward compatibility. */
  extensions?: { [key: string]: JsonValue };
}
