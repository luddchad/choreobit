import type { JsonValue, SourceCode } from '@choreobit/core';
import { AuthoringError } from './errors';

/**
 * Attach source-code presentation to a definition via {@link sourceCode}.
 *
 * A `SourceCode` is the code a student is reading alongside the animation: a
 * `language` plus either inlined `content` or an external `reference`. The
 * mapping from semantic steps to source lives on each step's `sourceLocations`,
 * not here. The builder is data only; core does not parse, highlight, or edit
 * code.
 */

/**
 * The configuration a {@link sourceCode} call accepts.
 */
export interface SourceCodeConfig {
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

/**
 * Build a {@link SourceCode} from a {@link SourceCodeConfig}.
 *
 * The `extensions` map, when present, is spread so the produced source shares no
 * reference with the caller's input.
 *
 * Throws an {@link AuthoringError} when the language is not a non-empty string.
 */
export function sourceCode(config: SourceCodeConfig): SourceCode {
  if (typeof config.language !== 'string' || config.language.length === 0) {
    throw new AuthoringError('sourceCode.language: must be a non-empty string');
  }

  const built: SourceCode = { language: config.language };

  if (config.filename !== undefined) {
    built.filename = config.filename;
  }
  if (config.content !== undefined) {
    built.content = config.content;
  }
  if (config.reference !== undefined) {
    built.reference = config.reference;
  }
  if (config.extensions !== undefined) {
    built.extensions = { ...config.extensions };
  }

  return built;
}
