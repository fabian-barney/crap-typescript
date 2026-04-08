export function finalize(values: string[]): string[]
{
  if (values.length === 0) {
    return ["default"];
  }
  return values;
}
