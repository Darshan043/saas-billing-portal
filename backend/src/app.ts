import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { organizationsRouter } from './modules/organizations/organizations.routes';
import {
  adminPlansRouter,
  publicPlansRouter,
} from './modules/plans/plans.routes';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes';
import { webhooksRouter } from './modules/webhooks/webhooks.routes';
import { healthRouter } from './routes/health';

export const app = express();

app.use(helmet());
app.use(cookieParser());

const corsMiddleware = cors({
  origin: env.FRONTEND_ORIGIN,
  credentials: true,
});
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks')) {
    next();
    return;
  }
  corsMiddleware(req, res, next);
});

// Raw-body webhook receiver. Must stay before express.json() so HMAC
// verification uses the exact request bytes, not re-serialized JSON.
app.use('/webhooks', webhooksRouter);

app.use(express.json({ limit: '100kb' }));
app.use(
  pinoHttp({
    logger,
    // Never log request bodies (they may contain passwords).
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(healthRouter);
app.use('/auth', authRouter);
app.use('/orgs', organizationsRouter);
app.use('/plans', publicPlansRouter);
app.use('/subscriptions', subscriptionsRouter);
app.use('/admin/plans', adminPlansRouter);
app.use('/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);
