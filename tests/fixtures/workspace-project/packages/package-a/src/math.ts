export function add(a: number, b: number): number {
  return a + b;
}

export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}

