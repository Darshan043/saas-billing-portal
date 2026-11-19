import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  login,
  logout,
  me,
  pingCustomer,
  register,
} from './auth.controller';
import { loginSchema, registerSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  asyncHandler(register),
);
authRouter.post(
  '/login',
  authRateLimit,
  validate(loginSchema),
  asyncHandler(login),
);
authRouter.post('/logout', asyncHandler(logout));
authRouter.get('/me', authenticate, asyncHandler(me));
authRouter.get('/ping-customer', authenticate, asyncHandler(pingCustomer));
