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
import { webhooksRouter } from './modules/webhooks/webhooks.routes';
import { healthRouter } from './routes/health';

export const app = express();

app.use(helmet());
app.use(cookieParser());
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  }),
);

// Raw-body webhook receiver. Must stay before express.json().
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
app.use('/admin/plans', adminPlansRouter);
app.use('/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);
