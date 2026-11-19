import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

// ALL later billing queries (subscriptions, invoices, payments, usage)
// must filter by req.organization.id and never trust an organization id
// coming from the client.
export const requireOrganization = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }

  const membership = await prisma.membership.findUnique({
    where: { userId: req.user.id },
    include: { organization: true },
  });

  if (!membership) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }

  req.organization = {
    id: membership.organization.id,
    name: membership.organization.name,
    membershipRole: membership.role,
  };
  next();
});
