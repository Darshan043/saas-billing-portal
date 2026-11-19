import type { Response } from 'express';
import { env } from '../config/env';
import { durationToMs } from './jwt';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: env.NODE_ENV === 'production',
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: durationToMs(env.JWT_EXPIRES_IN),
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, cookieOptions());
}
