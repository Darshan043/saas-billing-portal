function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency);
  const factor = 10 ** digits;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amountMinor / factor);
  } catch {
    return `${currency} ${(amountMinor / factor).toFixed(digits)}`;
  }
}

export function minorToMajorInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export function parseMajorToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const fractionPadded = `${fraction}00`.slice(0, 2);
  return Number(whole) * 100 + Number(fractionPadded);
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
