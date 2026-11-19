import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { orgScope } from '../../lib/orgScope';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './organizations.schemas';
import {
  createOrganizationForUser,
  getOrganizationForUser,
  updateOrganization,
} from './organizations.service';

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  const body = req.body as CreateOrganizationInput;
  const organization = await createOrganizationForUser(req.user, body);
  res.status(201).json({ organization });
}

export async function current(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  const organization = await getOrganizationForUser(req.user.id);
  res.status(200).json({ organization });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  const { organizationId } = orgScope(req);
  const body = req.body as UpdateOrganizationInput;
  const organization = await updateOrganization(
    organizationId,
    req.organization.membershipRole,
    body,
  );
  res.status(200).json({ organization });
}
