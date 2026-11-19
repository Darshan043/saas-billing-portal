import { env } from '../config/env';
import { asyncHandler } from '../lib/asyncHandler';
import { clearAuthCookie } from '../lib/authCookie';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (!token) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }

  let payload: { sub: string; role: string };
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    clearAuthCookie(res);
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user || !user.isActive) {
    clearAuthCookie(res);
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  next();
});
