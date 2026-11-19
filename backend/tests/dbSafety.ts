export const TEST_DATABASE_NAME = 'billinghub_test';

export function databaseNameFromUrl(connectionString: string): string {
  const parsed = new URL(connectionString);
  return parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
}

export function assertTestDatabase(connectionString: string | undefined): void {
  if (!connectionString) {
    throw new Error(
      'Refusing to run tests: DATABASE_URL / TEST_DATABASE_URL is not set',
    );
  }

  const name = databaseNameFromUrl(connectionString);
  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run tests: expected database "${TEST_DATABASE_NAME}" but DATABASE_URL points at "${name}"`,
    );
  }
}
