import { describe, expect, it } from 'vitest';
import { placeholderServer } from './index';

describe('placeholderServer', () => {
  it('returns a ready flag for the backend app', () => {
    expect(placeholderServer()).toBe('server-ready');
  });
});
