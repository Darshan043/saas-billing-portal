import { describe, expect, it } from 'vitest';
import {
  parseSignatureHeader,
  signPayload,
  signaturesMatch,
  stableStringify,
} from '../src/lib/hmac';

describe('hmac helpers', () => {
  it('signs timestamp plus raw body', () => {
    const hex = signPayload('secret-secret-secret', '1700000000', '{"a":1}');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(
      signaturesMatch(hex, signPayload('secret-secret-secret', '1700000000', '{"a":1}')),
    ).toBe(true);
    expect(
      signaturesMatch(hex, signPayload('secret-secret-secret', '1700000001', '{"a":1}')),
    ).toBe(false);
  });

  it('parses v1 signature headers', () => {
    expect(parseSignatureHeader('v1=abc')).toBe('abc');
    expect(parseSignatureHeader(undefined)).toBeNull();
  });

  it('stringifies objects with sorted keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
