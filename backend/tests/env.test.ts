import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

describe('loadEnv', () => {
  it('rejects missing required environment variables', () => {
    expect(() => loadEnv({})).toThrow(/Invalid or missing environment variables/);
  });
});
