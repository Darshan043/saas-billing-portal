import { describe, expect, it } from 'vitest';
import {
  computeWebhookSignature,
  parseSignatureHeader,
  verifyWebhookSignature,
} from '../src/lib/webhookSignature';

const SECRET = 'dev-only-test-secret';
const OTHER_SECRET = 'other-secret-value-xx';
const NOW = 1_700_000_000;
const TOLERANCE = 300;
const RAW_BODY = '{"id":"evt_1","type":"payment.succeeded","data":{"ok":true}}';

function verify(overrides: {
  secret?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  rawBody?: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
} = {}) {
  const timestamp = overrides.timestampHeader ?? String(NOW);
  const rawBody = overrides.rawBody ?? RAW_BODY;
  const secret = overrides.secret ?? SECRET;
  const signature =
    overrides.signatureHeader === undefined && !('signatureHeader' in overrides)
      ? `v1=${computeWebhookSignature(secret, timestamp, rawBody)}`
      : overrides.signatureHeader;
  return verifyWebhookSignature({
    secret: overrides.secret ?? SECRET,
    signatureHeader: signature,
    timestampHeader: timestamp,
    rawBody,
    nowSeconds: overrides.nowSeconds ?? NOW,
    toleranceSeconds: overrides.toleranceSeconds ?? TOLERANCE,
  });
}

describe('webhookSignature', () => {
  it('parses v1 signature headers', () => {
    expect(parseSignatureHeader('v1=abc')).toBe('abc');
    expect(parseSignatureHeader(undefined)).toBeNull();
  });

  it('accepts a valid signature', () => {
    expect(verify()).toEqual({ valid: true });
  });

  it('rejects a signature from the wrong secret', () => {
    const timestamp = String(NOW);
    const signature = `v1=${computeWebhookSignature(OTHER_SECRET, timestamp, RAW_BODY)}`;
    expect(
      verify({ signatureHeader: signature }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('rejects a tampered body', () => {
    const timestamp = String(NOW);
    const signature = `v1=${computeWebhookSignature(SECRET, timestamp, RAW_BODY)}`;
    expect(
      verify({
        signatureHeader: signature,
        rawBody: RAW_BODY.replace('true', 'fals'),
      }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('rejects a missing header', () => {
    expect(verify({ signatureHeader: undefined })).toEqual({
      valid: false,
      reason: 'MISSING_HEADER',
    });
  });

  it('rejects a malformed header', () => {
    expect(verify({ signatureHeader: 'not-a-signature' })).toEqual({
      valid: false,
      reason: 'MALFORMED_HEADER',
    });
  });

  it('rejects a non-hex signature', () => {
    expect(
      verify({ signatureHeader: `v1=${'g'.repeat(64)}` }),
    ).toEqual({ valid: false, reason: 'MALFORMED_HEADER' });
  });

  it('rejects a wrong-length signature', () => {
    expect(
      verify({ signatureHeader: `v1=${'ab'.repeat(16)}` }),
    ).toEqual({ valid: false, reason: 'MALFORMED_HEADER' });
  });

  it('rejects a timestamp that is too old', () => {
    expect(verify({ timestampHeader: String(NOW - TOLERANCE - 1) })).toEqual({
      valid: false,
      reason: 'TIMESTAMP_OUT_OF_TOLERANCE',
    });
  });

  it('rejects a timestamp that is too far in the future', () => {
    expect(verify({ timestampHeader: String(NOW + TOLERANCE + 1) })).toEqual({
      valid: false,
      reason: 'TIMESTAMP_OUT_OF_TOLERANCE',
    });
  });

  it('accepts a timestamp exactly at the tolerance boundary', () => {
    expect(verify({ timestampHeader: String(NOW - TOLERANCE) })).toEqual({
      valid: true,
    });
    expect(verify({ timestampHeader: String(NOW + TOLERANCE) })).toEqual({
      valid: true,
    });
  });

  it('fails when the signature was computed over different JSON whitespace', () => {
    const compact = '{"id":"evt_1","type":"t","data":{}}';
    const spaced = '{ "id": "evt_1", "type": "t", "data": {} }';
    const timestamp = String(NOW);
    const signature = `v1=${computeWebhookSignature(SECRET, timestamp, compact)}`;
    expect(
      verify({
        signatureHeader: signature,
        timestampHeader: timestamp,
        rawBody: spaced,
      }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' });
  });
});
