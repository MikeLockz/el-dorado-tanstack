import { describe, expect, it } from 'vitest';
import { placeholderDomain } from './index';

describe('placeholderDomain', () => {
  it('reports a ready state for the shared domain package', () => {
    expect(placeholderDomain()).toBe('domain-ready');
  });
});
