import type { Response } from 'express';
import { env } from '../config/env';
import { durationToMs } from './jwt';

function cookieOptions() {
  // In production we need cross‑site cookies, so use SameSite=None and Secure=true.
  // In development (or any non‑production NODE_ENV) we keep the previous lax behaviour.
  const isProd = env.NODE_ENV === 'production';
  const sameSite: 'none' | 'lax' = isProd ? 'none' : 'lax';
  return {
    httpOnly: true,
    sameSite,
    path: '/',
    secure: isProd,
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
