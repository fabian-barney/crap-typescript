export class Example {
  handler = (flag: boolean): number => flag ? 1 : 0;
}

export const registry: Record<string, (value: string) => string> = {};
registry.trim = (value: string): string => value.trim();
registry["upper"] = function (value: string): string {
  if (value.length > 0) {
    return value.toUpperCase();
  }
  return value;
};
