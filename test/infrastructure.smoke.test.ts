import { describe, expect, it } from 'vitest';

describe('test infrastructure', () => {
  it('runs the Vitest runner', () => {
    expect(1 + 1).toBe(2);
  });

  it('supports TypeScript assertions', () => {
    const value: number = 42;
    expect(value).toBeGreaterThanOrEqual(42);
  });
});
