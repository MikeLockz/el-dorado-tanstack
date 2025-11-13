import { describe, expect, it } from 'vitest';
import { placeholderClient } from './index';

describe('placeholderClient', () => {
  it('returns a ready flag for the client app', () => {
    expect(placeholderClient()).toBe('client-ready');
  });
});
