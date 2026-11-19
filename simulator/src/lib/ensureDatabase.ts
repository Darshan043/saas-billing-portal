import { execSync } from 'node:child_process';
import { Pool } from 'pg';

export async function ensureDatabase(connectionString: string): Promise<void> {
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Refusing to create database with unsafe name "${dbName}"`);
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const found = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (found.rowCount === 0) {
      await pool.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await pool.end();
  }
}

export function deployMigrations(connectionString: string): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionString },
  });
}
