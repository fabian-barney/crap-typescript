declare namespace Contracts {
  interface Shape {
    value: string;
  }

  function build(): string;
}

declare module "pkg" {
  export function load(): void;
}

namespace TypesOnly {
  export interface Config {
    enabled: boolean;
  }

  export type Alias = string;
}
