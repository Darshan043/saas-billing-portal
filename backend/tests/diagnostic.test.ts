import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';

// Global control variable for auth behavior
let authBehaviour: 'pass' | 'unauth' | 'nonAdmin' = 'pass';

// Mock authenticate middleware
vi.mock('../src/middleware/authenticate', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    if (authBehaviour === 'unauth') {
      // Simulate AppError for unauthorized
      const err = { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
      return next(err as any);
    }
    req.user = {
      id: 'test',
      email: 'test@example.com',
      name: 'Test',
      role: authBehaviour === 'nonAdmin' ? 'CUSTOMER' : 'ADMIN',
    } as any;
    next();
  },
}));

// Mock requireRole middleware
vi.mock('../src/middleware/requireRole', () => ({
  requireRole: (..._args: any[]) => (req: Request, _res: Response, next: NextFunction) => {
    if (authBehaviour === 'nonAdmin') {
      const err = { statusCode: 403, code: 'FORBIDDEN', message: 'You do not have access to this resource' };
      return next(err as any);
    }
    next();
  },
}));

// Import the router after mocks are set up
const { adminDiagnosticRouter } = require('../src/modules/admin/diagnostic.routes');

// Mock Prisma plan data
const mockPlans = [
  {
    name: 'PlanA',
    isActive: true,
    sortOrder: 1,
    prices: [
      { interval: 'MONTH', currency: 'USD', amount: 0, isActive: true, retiredAt: null },
      { interval: 'YEAR', currency: 'USD', amount: 0, isActive: true, retiredAt: null },
    ],
  },
  {
    name: 'PlanB',
    isActive: false,
    sortOrder: 2,
    prices: [
      { interval: 'MONTH', currency: 'USD', amount: 1999, isActive: false, retiredAt: new Date() },
    ],
  },
];

beforeAll(() => {
  vi.spyOn(prisma.plan, 'findMany').mockResolvedValue(mockPlans as any);
});

// Helper to build app with given auth behaviour
function buildApp(behaviour: 'pass' | 'unauth' | 'nonAdmin') {
  authBehaviour = behaviour;
  const app = express();
  app.use('/admin/diagnostic', adminDiagnosticRouter);
  // error handler similar to main app
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: { code: err.code ?? 'UNKNOWN', message: err.message } });
  });
  return app;
}

describe('admin diagnostic endpoint', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp('unauth');
    const res = await request(app).get('/admin/diagnostic/plans');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non‑admin authenticated users', async () => {
    const app = buildApp('nonAdmin');
    const res = await request(app).get('/admin/diagnostic/plans');
    expect(res.status).toBe(403);
  });

  it('returns diagnostic data for admin user', async () => {
    const app = buildApp('pass');
    const res = await request(app).get('/admin/diagnostic/plans');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalPlans: 2,
      plans: expect.arrayContaining([
        expect.objectContaining({ name: 'PlanA', isActive: true, priceCount: 2 }),
        expect.objectContaining({ name: 'PlanB', isActive: false, priceCount: 1 }),
      ]),
    });
  });
});
