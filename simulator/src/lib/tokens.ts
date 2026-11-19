import { TokenKind } from '@prisma/client';
import { AppError } from './errors';

export const TEST_TOKENS = {
  tok_sim_visa_ok: TokenKind.VISA_OK,
  tok_sim_declined: TokenKind.DECLINED,
  tok_sim_insufficient_funds: TokenKind.INSUFFICIENT_FUNDS,
} as const;

export type TestToken = keyof typeof TEST_TOKENS;

const TOKEN_LABEL: Record<TokenKind, string> = {
  VISA_OK: 'SIM visa (ok)',
  DECLINED: 'SIM visa (declined)',
  INSUFFICIENT_FUNDS: 'SIM visa (insufficient funds)',
};

export function tokenKindFromValue(token: string): TokenKind {
  const kind = TEST_TOKENS[token as TestToken];
  if (!kind) {
    throw AppError.badRequest(
      'UNKNOWN_TOKEN',
      'Unknown simulator token. Use tok_sim_visa_ok, tok_sim_declined, or tok_sim_insufficient_funds',
    );
  }
  return kind;
}

export function labelForTokenKind(kind: TokenKind): string {
  return TOKEN_LABEL[kind];
}

export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{13,19}$/.test(digits);
}

export function looksLikeCvv(value: string): boolean {
  return /^\d{3,4}$/.test(value.trim());
}

const FORBIDDEN_KEYS = new Set([
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'cvv2',
  'securitycode',
  'security_code',
  'expiry',
  'exp_month',
  'exp_year',
  'pin',
  'iban',
  'accountnumber',
  'account_number',
]);

export function rejectRawCredentials(value: unknown, path = 'body'): void {
  if (typeof value === 'string') {
    if (looksLikeCardNumber(value)) {
      throw AppError.badRequest(
        'RAW_CREDENTIALS_REJECTED',
        'Raw card numbers are not accepted. Use a simulator test token.',
        [{ field: path, message: 'Looks like a card number' }],
      );
    }
    if (path.toLowerCase().includes('cvv') || path.toLowerCase().includes('cvc')) {
      if (looksLikeCvv(value)) {
        throw AppError.badRequest(
          'RAW_CREDENTIALS_REJECTED',
          'CVV/CVC values are not accepted.',
          [{ field: path, message: 'Looks like a CVV' }],
        );
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectRawCredentials(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const field = `${path}.${key}`;
      if (FORBIDDEN_KEYS.has(key.toLowerCase().replace(/[\s-]/g, ''))) {
        throw AppError.badRequest(
          'RAW_CREDENTIALS_REJECTED',
          'Raw payment credentials are not accepted.',
          [{ field, message: 'Forbidden credential field' }],
        );
      }
      rejectRawCredentials(nested, field);
    }
  }
}
