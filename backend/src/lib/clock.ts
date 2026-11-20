let nowFn = (): Date => new Date();

export function now(): Date {
  return nowFn();
}

export function setNow(fn: () => Date): void {
  nowFn = fn;
}

export function resetNow(): void {
  nowFn = () => new Date();
}
