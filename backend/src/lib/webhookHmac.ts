import crypto from 'node:crypto';

export function signPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export function signaturesMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function parseSignatureHeader(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed.startsWith('v1=')) {
    return trimmed.slice(3);
  }
  return trimmed;
}

export function isTimestampFresh(
  timestampHeader: string,
  nowSeconds: number,
  toleranceSeconds: number,
): boolean {
  if (!/^\d+$/.test(timestampHeader)) {
    return false;
  }
  const timestamp = Number(timestampHeader);
  return Math.abs(nowSeconds - timestamp) <= toleranceSeconds;
}
