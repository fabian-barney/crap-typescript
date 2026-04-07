export function outer(value: number): number {
  const inner = () => {
    if (value > 0) {
      return 1;
    }
    return 0;
  };

  return inner();
}
