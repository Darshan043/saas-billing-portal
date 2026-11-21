import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { rejectRawCredentials } from './lib/tokens';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { dashboardHtml } from './modules/dashboard/dashboard.html';
import { customersRouter } from './modules/customers/customers.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { simRouter } from './modules/sim/sim.routes';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes';
import { healthRouter } from './routes/health';

export const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    rejectRawCredentials(req.body, 'body');
  }
  next();
});

app.use(healthRouter);
app.use('/v1/customers', customersRouter);
app.use('/v1/payments', paymentsRouter);
app.use('/v1/subscriptions', subscriptionsRouter);
app.use('/v1/invoices', invoicesRouter);
app.use('/sim', simRouter);

app.get('/', (_req, res) => {
  res.type('html').send(dashboardHtml());
});

app.use(notFound);
app.use(errorHandler);
