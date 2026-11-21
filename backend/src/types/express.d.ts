import type { MembershipRole, UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type RequestOrganization = {
  id: string;
  name: string;
  membershipRole: MembershipRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      organization?: RequestOrganization;
    }
  }
}

export {};
