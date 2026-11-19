import bcrypt from 'bcryptjs';

const COST = 10;

// Compared when a login email is unknown so the response time stays similar.
const DUMMY_HASH = bcrypt.hashSync('__timing_dummy__', COST);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export async function verifyDummyPassword(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
