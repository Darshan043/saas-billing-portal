import type { Request, Response } from 'express';
import { clearAuthCookie, setAuthCookie } from '../../lib/authCookie';
import { AppError } from '../../lib/errors';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { getCurrentUser, loginUser, registerUser } from './auth.service';

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterInput;
  const { user, token } = await registerUser(body);
  setAuthCookie(res, token);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const { user, token } = await loginUser(body);
  setAuthCookie(res, token);
  res.status(200).json({ user });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearAuthCookie(res);
  res.status(200).json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  try {
    const user = await getCurrentUser(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) {
      clearAuthCookie(res);
    }
    throw err;
  }
}

export async function pingCustomer(req: Request, res: Response): Promise<void> {
  res.status(200).json({ ok: true, role: req.user?.role });
}
