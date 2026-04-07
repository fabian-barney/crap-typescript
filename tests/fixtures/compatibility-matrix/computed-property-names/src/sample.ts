const renderKey = "render";
const formatKey = "format";

export class Example {
  [renderKey](flag: boolean): number {
    if (flag) {
      return 1;
    }
    return 0;
  }
}

export const helper = {
  [formatKey](value: string): string {
    return value.trim();
  }
};
