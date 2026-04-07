export const trim = (value: string) => value.trim();

export function declarationsOnly(): void {
  type Local = { value: string };
  interface Shape { value: string }
}
