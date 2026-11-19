const MINOR_UNITS_PER_MAJOR = 100;

export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amountMinor / MINOR_UNITS_PER_MAJOR);
  } catch {
    return `${currency} ${(amountMinor / MINOR_UNITS_PER_MAJOR).toFixed(2)}`;
  }
}

export function minorToMajorInput(amountMinor: number): string {
  return (amountMinor / MINOR_UNITS_PER_MAJOR).toFixed(2);
}

export function parseMajorToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const fractionPadded = `${fraction}00`.slice(0, 2);
  return Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fractionPadded);
}

export function yearlySavingsPercent(
  monthlyAmount: number,
  yearlyAmount: number,
): number | null {
  const annualMonthly = monthlyAmount * 12;
  if (annualMonthly <= 0 || yearlyAmount >= annualMonthly) {
    return null;
  }
  return Math.round(((annualMonthly - yearlyAmount) / annualMonthly) * 100);
}
