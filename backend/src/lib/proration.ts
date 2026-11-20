export type ProrateUpgradeInput = {
  oldAmount: number;
  newAmount: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
};

export type ProrateUpgradeResult = {
  totalMs: number;
  remainingMs: number;
  remainingDays: number;
  creditAmount: number;
  newPeriodAmount: number;
  chargeAmount: number;
};

function roundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) {
    throw new Error('Cannot divide by zero');
  }
  const negative = numerator < 0n !== denominator < 0n;
  const num = numerator < 0n ? -numerator : numerator;
  const den = denominator < 0n ? -denominator : denominator;
  const quotient = num / den;
  const remainder = num % den;
  const rounded =
    remainder * 2n >= den ? quotient + 1n : quotient;
  const asNumber = Number(negative ? -rounded : rounded);
  return asNumber;
}

export function prorateUpgrade(
  input: ProrateUpgradeInput,
): ProrateUpgradeResult {
  const totalMs = input.periodEnd.getTime() - input.periodStart.getTime();
  if (totalMs <= 0 || input.periodEnd.getTime() <= input.periodStart.getTime()) {
    throw new Error('Invalid billing period');
  }
  const rawRemaining = input.periodEnd.getTime() - input.now.getTime();
  const remainingMs = Math.min(totalMs, Math.max(0, rawRemaining));
  const remainingDays = Math.ceil(remainingMs / 86_400_000);
  const creditAmount = roundHalfUp(
    BigInt(input.oldAmount) * BigInt(remainingMs),
    BigInt(totalMs),
  );
  const newPeriodAmount = roundHalfUp(
    BigInt(input.newAmount) * BigInt(remainingMs),
    BigInt(totalMs),
  );
  const chargeAmount = Math.max(0, newPeriodAmount - creditAmount);
  return {
    totalMs,
    remainingMs,
    remainingDays,
    creditAmount,
    newPeriodAmount,
    chargeAmount,
  };
}

export function extendPeriodAfterPause(input: {
  currentPeriodEnd: Date;
  pausedAt: Date;
  resumedAt: Date;
}): Date {
  const pausedMs = input.resumedAt.getTime() - input.pausedAt.getTime();
  if (pausedMs <= 0) {
    return new Date(input.currentPeriodEnd.getTime());
  }
  return new Date(input.currentPeriodEnd.getTime() + pausedMs);
}
