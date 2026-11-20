import type { BillingInterval } from '@prisma/client';

function lastUtcDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addCalendarMonths(start: Date, months: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const totalMonths = year * 12 + month + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const clampedDay = Math.min(day, lastUtcDayOfMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export function periodDates(
  interval: BillingInterval,
  start: Date = new Date(),
): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  const currentPeriodStart = new Date(start.getTime());
  const currentPeriodEnd =
    interval === 'YEAR'
      ? addCalendarMonths(start, 12)
      : addCalendarMonths(start, 1);
  return { currentPeriodStart, currentPeriodEnd };
}
