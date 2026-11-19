import { describe, expect, it } from 'vitest';
import type { VisualObject } from '@choreobit/core';
import { circle, createPrimitive, group, rectangle, text, type PrimitiveShape } from '../index';

/**
 * Behavioural tests for the `@choreobit/primitives` constructors.
 *
 * Each primitive folds an optional options bag into a lean
 * {@link VisualObjectState}, writing a field only when the caller supplied a
 * non-default value, and never mutates the caller's input. These tests pin that
 * contract: the produced shape, the lean-state rule, the copy semantics, and the
 * text/group special cases.
 */

describe('rectangle', () => {
  it('builds a rectangle object with the right type and a lean state', () => {
    const box = rectangle('box');
    expect(box).toEqual({ id: 'box', type: 'rectangle', state: {} });
  });

  it('carries position into state', () => {
    const box = rectangle('box', { position: { x: 10, y: 20 } });
    expect(box.state?.position).toEqual({ x: 10, y: 20 });
  });

  it('carries properties into state', () => {
    const box = rectangle('box', { properties: { width: 40, height: 30, fill: '#111' } });
    expect(box.state?.properties).toEqual({ width: 40, height: 30, fill: '#111' });
  });

  it('writes visible only when false and highlighted only when true', () => {
    expect(rectangle('a', { visible: true }).state?.visible).toBeUndefined();
    expect(rectangle('a', { visible: false }).state?.visible).toBe(false);
    expect(rectangle('a', { highlighted: false }).state?.highlighted).toBeUndefined();
    expect(rectangle('a', { highlighted: true }).state?.highlighted).toBe(true);
  });

  it('copies the caller properties map rather than sharing it', () => {
    const props = { width: 1, height: 1 };
    const box = rectangle('box', { properties: props });
    props.width = 999;
    expect(box.state?.properties).toEqual({ width: 1, height: 1 });
  });
});

describe('circle', () => {
  it('builds a circle object', () => {
    const dot = circle('dot', { properties: { radius: 24, fill: '#22c55e' } });
    expect(dot.type).toBe('circle');
    expect(dot.state?.properties).toEqual({ radius: 24, fill: '#22c55e' });
  });

  it('defaults to a lean state when no options are given', () => {
    expect(circle('dot').state).toEqual({});
  });
});

describe('text', () => {
  it('stores the text content under properties.text', () => {
    const label = text('label', 'midpoint');
    expect(label.type).toBe('text');
    expect(label.state?.properties).toEqual({ text: 'midpoint' });
  });

  it('merges properties with the text content, with content winning on conflict', () => {
    const label = text('label', 'hi', { properties: { text: 'ignored', fontSize: 12 } });
    expect(label.state?.properties).toEqual({ text: 'hi', fontSize: 12 });
  });

  it('omits text when no content is given', () => {
    const label = text('label', undefined, { properties: { fontSize: 12 } });
    expect(label.state?.properties).toEqual({ fontSize: 12 });
  });

  it('carries position and extensions alongside the text', () => {
    const label = text('label', 'hi', {
      position: { x: 1, y: 2 },
      extensions: { vendor: 'x' },
    });
    expect(label.state?.position).toEqual({ x: 1, y: 2 });
    expect(label.state?.extensions).toEqual({ vendor: 'x' });
  });
});

describe('group', () => {
  it('composes children under type group', () => {
    const figure = group('figure', [
      rectangle('base', { properties: { width: 80, height: 40 } }),
      circle('cap', { position: { x: 80, y: 0 }, properties: { radius: 12 } }),
    ]);
    expect(figure.type).toBe('group');
    expect(figure.children?.map((child) => child.id)).toEqual(['base', 'cap']);
  });

  it('copies the children array rather than sharing it', () => {
    const children: VisualObject[] = [rectangle('a'), circle('b')];
    const figure = group('figure', children);
    children.push(text('c'));
    expect(figure.children?.map((child) => child.id)).toEqual(['a', 'b']);
  });

  it('applies options to the group itself', () => {
    const figure = group('figure', [], { visible: false });
    expect(figure.state?.visible).toBe(false);
    expect(figure.children).toEqual([]);
  });
});

describe('createPrimitive', () => {
  it('is the shared builder for every shape', () => {
    const shapes: PrimitiveShape[] = ['rectangle', 'circle', 'text', 'group'];
    for (const shape of shapes) {
      const object = createPrimitive(shape, { id: shape });
      expect(object).toEqual({ id: shape, type: shape, state: {} });
    }
  });

  it('does not mutate the caller options', () => {
    const options = { position: { x: 1, y: 1 } };
    createPrimitive('rectangle', { id: 'r', options });
    expect(options.position).toEqual({ x: 1, y: 1 });
  });
});
