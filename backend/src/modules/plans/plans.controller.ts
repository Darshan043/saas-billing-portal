import type { Request, Response } from 'express';
import type { CreatePlanInput, UpdatePlanInput } from './plans.schemas';
import {
  createPlan,
  getAdminPlan,
  listAdminPlans,
  listPublicPlans,
  updatePlan,
} from './plans.service';

export async function listPublic(_req: Request, res: Response): Promise<void> {
  const plans = await listPublicPlans();
  res.status(200).json({ plans });
}

export async function listAdmin(_req: Request, res: Response): Promise<void> {
  const plans = await listAdminPlans();
  res.status(200).json({ plans });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const plan = await getAdminPlan(req.params.id);
  res.status(200).json({ plan });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreatePlanInput;
  const plan = await createPlan(body);
  res.status(201).json({ plan });
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdatePlanInput;
  const plan = await updatePlan(req.params.id, body);
  res.status(200).json({ plan });
}
