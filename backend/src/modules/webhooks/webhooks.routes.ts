import express, { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import * as controller from './webhooks.controller';

export const webhooksRouter = Router();

webhooksRouter.post(
  '/payments',
  express.raw({ type: '*/*', limit: '100kb' }),
  asyncHandler(controller.receivePayments),
);
