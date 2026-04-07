declare const logged: MethodDecorator;

export class Example {
  @logged
  value(flag: boolean): number {
    if (flag) {
      return 1;
    }
    return 0;
  }
}
