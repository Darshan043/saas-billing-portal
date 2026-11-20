import express, { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { webhookRateLimit } from '../../middleware/rateLimit';
import * as controller from './webhooks.controller';

export const webhooksRouter = Router();

webhooksRouter.post(
  '/payments',
  webhookRateLimit,
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(controller.receivePayments),
);
