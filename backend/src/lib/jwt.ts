import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errors';

export type AccessTokenPayload = {
  sub: string;
  role: string;
};

export function signAccessToken(user: {
  id: string;
  role: string;
}): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.role !== 'string'
    ) {
      throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
    }
    return { sub: decoded.sub, role: decoded.role };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
}

export function durationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return amount * multipliers[unit];
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber * 1000;
  }

  return 7 * 86_400_000;
}
