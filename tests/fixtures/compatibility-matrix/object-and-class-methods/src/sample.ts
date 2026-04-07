export class Example {
  value(flag: boolean): number {
    if (flag) {
      return 1;
    }
    return 0;
  }
}

export const helper = {
  score(value: number): number {
    switch (value) {
      case 1:
        return 1;
      default:
        return 0;
    }
  }
};
