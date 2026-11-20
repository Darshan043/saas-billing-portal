import crypto from 'node:crypto';

export type SignatureFailureReason =
  | 'MISSING_HEADER'
  | 'MALFORMED_HEADER'
  | 'TIMESTAMP_OUT_OF_TOLERANCE'
  | 'SIGNATURE_MISMATCH';

export type SignatureVerifyResult =
  | { valid: true }
  | { valid: false; reason: SignatureFailureReason };

const HMAC_SHA256_HEX_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-f]+$/i;

export function parseSignatureHeader(
  header: string | undefined,
): string | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed.startsWith('v1=')) {
    return trimmed.slice(3);
  }
  return trimmed;
}

export function computeWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer | string,
): string {
  const bodyText = Buffer.isBuffer(rawBody)
    ? rawBody.toString('utf8')
    : rawBody;
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${bodyText}`)
    .digest('hex');
}

function isHexSha256(value: string): boolean {
  return (
    value.length === HMAC_SHA256_HEX_LENGTH && HEX_PATTERN.test(value)
  );
}

function signaturesMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function verifyWebhookSignature(input: {
  secret: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  rawBody: Buffer | string;
  nowSeconds: number;
  toleranceSeconds: number;
}): SignatureVerifyResult {
  if (!input.signatureHeader) {
    return { valid: false, reason: 'MISSING_HEADER' };
  }

  const provided = parseSignatureHeader(input.signatureHeader);
  if (!provided || !isHexSha256(provided)) {
    return { valid: false, reason: 'MALFORMED_HEADER' };
  }

  const timestampHeader = input.timestampHeader;
  if (!timestampHeader || !/^\d+$/.test(timestampHeader)) {
    return { valid: false, reason: 'MALFORMED_HEADER' };
  }

  const timestamp = Number(timestampHeader);
  if (Math.abs(input.nowSeconds - timestamp) > input.toleranceSeconds) {
    return { valid: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' };
  }

  const expected = computeWebhookSignature(
    input.secret,
    timestampHeader,
    input.rawBody,
  );
  if (!signaturesMatch(expected, provided.toLowerCase())) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH' };
  }

  return { valid: true };
}
