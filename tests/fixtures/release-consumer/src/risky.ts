export function risky(flagA: boolean, flagB: boolean): number {
  if ((flagA && flagB) || flagA) {
    return 1;
  }
  return 0;
}
