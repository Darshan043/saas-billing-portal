import { describe, expect, it } from 'vitest';
import { extendPeriodAfterPause, prorateUpgrade } from '../src/lib/proration';

describe('prorateUpgrade', () => {
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-02-01T00:00:00.000Z');
  // 31 days = 2_678_400_000 ms

  it('charges the unused remainder mid-period (half-up integers)', () => {
    const now = new Date('2026-01-16T00:00:00.000Z');
    // remainingMs = 16 days = 1_382_400_000
    // credit = round(900 * 1_382_400_000 / 2_678_400_000) = 465
    // newPeriod = round(2900 * 1_382_400_000 / 2_678_400_000) = 1497
    const result = prorateUpgrade({
      oldAmount: 900,
      newAmount: 2900,
      periodStart,
      periodEnd,
      now,
    });
    expect(result.totalMs).toBe(2_678_400_000);
    expect(result.remainingMs).toBe(1_382_400_000);
    expect(result.remainingDays).toBe(16);
    expect(result.creditAmount).toBe(465);
    expect(result.newPeriodAmount).toBe(1497);
    expect(result.chargeAmount).toBe(1032);
    expect(result.newPeriodAmount - result.creditAmount).toBe(
      result.chargeAmount,
    );
  });

  it('charges the full difference at the first instant', () => {
    const result = prorateUpgrade({
      oldAmount: 900,
      newAmount: 2900,
      periodStart,
      periodEnd,
      now: periodStart,
    });
    expect(result.remainingMs).toBe(result.totalMs);
    expect(result.remainingDays).toBe(31);
    expect(result.creditAmount).toBe(900);
    expect(result.newPeriodAmount).toBe(2900);
    expect(result.chargeAmount).toBe(2000);
  });

  it('charges nothing at the last instant', () => {
    const result = prorateUpgrade({
      oldAmount: 900,
      newAmount: 2900,
      periodStart,
      periodEnd,
      now: periodEnd,
    });
    expect(result.remainingMs).toBe(0);
    expect(result.remainingDays).toBe(0);
    expect(result.creditAmount).toBe(0);
    expect(result.newPeriodAmount).toBe(0);
    expect(result.chargeAmount).toBe(0);
  });

  it('rounds half up', () => {
    const result = prorateUpgrade({
      oldAmount: 1,
      newAmount: 1,
      periodStart: new Date(0),
      periodEnd: new Date(2),
      now: new Date(1),
    });
    // 1 * 1 / 2 = 0.5 -> 1
    expect(result.creditAmount).toBe(1);
    expect(result.newPeriodAmount).toBe(1);
    expect(result.chargeAmount).toBe(0);
  });

  it('uses BigInt so large amounts do not overflow Number math', () => {
    const yearStart = new Date('2026-01-01T00:00:00.000Z');
    const yearEnd = new Date('2027-01-01T00:00:00.000Z');
    const now = new Date('2026-07-02T00:00:00.000Z');
    const oldAmount = 10_000_000_000;
    const newAmount = 20_000_000_000;
    const result = prorateUpgrade({
      oldAmount,
      newAmount,
      periodStart: yearStart,
      periodEnd: yearEnd,
      now,
    });
    const total = BigInt(yearEnd.getTime() - yearStart.getTime());
    const remaining = BigInt(yearEnd.getTime() - now.getTime());
    const expectedCredit = Number((BigInt(oldAmount) * remaining) / total);
    const remainder = (BigInt(oldAmount) * remaining) % total;
    const credit =
      remainder * 2n >= total ? expectedCredit + 1 : expectedCredit;
    expect(oldAmount * result.remainingMs).toBeGreaterThan(
      Number.MAX_SAFE_INTEGER,
    );
    expect(result.creditAmount).toBe(credit);
    expect(result.chargeAmount).toBeGreaterThan(0);
    expect(result.newPeriodAmount - result.creditAmount).toBe(
      result.chargeAmount,
    );
  });

  it('clamps now before periodStart to the full period', () => {
    const result = prorateUpgrade({
      oldAmount: 900,
      newAmount: 2900,
      periodStart,
      periodEnd,
      now: new Date('2025-12-01T00:00:00.000Z'),
    });
    expect(result.remainingMs).toBe(result.totalMs);
    expect(result.chargeAmount).toBe(2000);
  });

  it('throws on invalid periods', () => {
    expect(() =>
      prorateUpgrade({
        oldAmount: 900,
        newAmount: 2900,
        periodStart,
        periodEnd: periodStart,
        now: periodStart,
      }),
    ).toThrow('Invalid billing period');
  });

  it('never returns a negative charge', () => {
    const result = prorateUpgrade({
      oldAmount: 9900,
      newAmount: 900,
      periodStart,
      periodEnd,
      now: new Date('2026-01-16T00:00:00.000Z'),
    });
    expect(result.chargeAmount).toBe(0);
  });
});

describe('extendPeriodAfterPause', () => {
  const currentPeriodEnd = new Date('2026-02-01T00:00:00.000Z');

  it('adds the paused duration', () => {
    const pausedAt = new Date('2026-01-10T00:00:00.000Z');
    const resumedAt = new Date('2026-01-12T12:00:00.000Z');
    const next = extendPeriodAfterPause({
      currentPeriodEnd,
      pausedAt,
      resumedAt,
    });
    expect(next.toISOString()).toBe('2026-02-03T12:00:00.000Z');
  });

  it('does not change the end when pause length is zero', () => {
    const pausedAt = new Date('2026-01-10T00:00:00.000Z');
    const next = extendPeriodAfterPause({
      currentPeriodEnd,
      pausedAt,
      resumedAt: pausedAt,
    });
    expect(next.toISOString()).toBe(currentPeriodEnd.toISOString());
  });

  it('does not shorten the period if resumedAt is before pausedAt', () => {
    const next = extendPeriodAfterPause({
      currentPeriodEnd,
      pausedAt: new Date('2026-01-12T00:00:00.000Z'),
      resumedAt: new Date('2026-01-10T00:00:00.000Z'),
    });
    expect(next.toISOString()).toBe(currentPeriodEnd.toISOString());
  });
});
