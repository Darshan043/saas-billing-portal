import { Router } from 'express';
import { pool } from '../lib/db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const database = await checkDatabase();
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    database,
    time: new Date().toISOString(),
  });
});

async function checkDatabase(): Promise<'up' | 'down'> {
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('database check timed out')), 2000);
    });
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return 'up';
  } catch {
    return 'down';
  }
}
