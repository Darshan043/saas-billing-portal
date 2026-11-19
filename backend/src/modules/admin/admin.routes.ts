import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';

export const adminRouter = Router();

adminRouter.get(
  '/ping',
  authenticate,
  requireRole('ADMIN'),
  (req, res) => {
    res.status(200).json({ ok: true, role: req.user?.role });
  },
);
