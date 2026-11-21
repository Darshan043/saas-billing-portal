import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { getPlansDiagnostic } from './diagnostic.controller';

export const adminDiagnosticRouter = Router();

adminDiagnosticRouter.get(
  '/plans',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(getPlansDiagnostic),
);

