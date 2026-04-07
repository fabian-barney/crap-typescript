export class Example {
  private current = 0;

  get value(): number {
    if (this.current > 0) {
      return 1;
    }
    return 0;
  }

  set value(flag: boolean) {
    if (flag) {
      this.current = 1;
      return;
    }
    this.current = 0;
  }
}
