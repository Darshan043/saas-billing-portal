function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en-US', {
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
  const major = amountMinor / factor;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
      .format(major)
      .replace(/\u00A0/g, ' ');
  } catch {
    return `${currency} ${major.toFixed(digits)}`;
  }
}
