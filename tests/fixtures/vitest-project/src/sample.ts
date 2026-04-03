export function safe(value: number): number {
  return value + 1;
}

export function risky(flagA: boolean, flagB: boolean): number {
  if ((flagA && flagB) || flagA) {
    return 1;
  }
  return 0;
}
