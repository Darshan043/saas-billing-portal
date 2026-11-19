import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required. Run tests inside Docker: docker compose exec backend npm run test',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
assertTestDatabase(process.env.DATABASE_URL);

async function ensureTestDatabase(): Promise<void> {
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';

  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const found = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DATABASE_NAME],
    );
    if (found.rowCount === 0) {
      await pool.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await pool.end();
  }
}

await ensureTestDatabase();

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
