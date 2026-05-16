import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ParseError, parseFileMethods } from "../src/parser";
import { createTempDir, disposeTempDir } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("parseFileMethods", () => {
  it("extracts named function-like bodies and counts complexity from the TypeScript AST", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sample.ts");
    await writeFile(
      filePath,
      `class Example {
  value(flagA: boolean, flagB: boolean): number {
    if (flagA && flagB) {
      return 1;
    }
    return 0;
  }

  callback(): number {
    const inner = () => {
      if (true) {
        return 1;
      }
      return 0;
    };
    return inner();
  }
}

const helper = {
  score(value: number): number {
    switch (value) {
      case 1:
        return 1;
      default:
        return 0;
    }
  }
};

const arrow = (items: number[]) => {
  for (const item of items) {
    if (item > 0) {
      return item;
    }
  }
  return 0;
};
`,
      "utf8"
    );

    const methods = await parseFileMethods(filePath);
    expect(methods).toMatchObject([
      {
        functionName: "value",
        containerName: "Example",
        displayName: "Example.value",
        startLine: 2,
        endLine: 7,
        complexity: 3,
        bodySpan: {
          startLine: 2,
          endLine: 7
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      },
      {
        functionName: "callback",
        containerName: "Example",
        displayName: "Example.callback",
        startLine: 9,
        endLine: 17,
        complexity: 1,
        bodySpan: {
          startLine: 9,
          endLine: 17
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: false
      },
      {
        functionName: "inner",
        containerName: "Example",
        displayName: "Example.inner",
        startLine: 10,
        endLine: 15,
        complexity: 2,
        bodySpan: {
          startLine: 10,
          endLine: 15
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      },
      {
        functionName: "score",
        containerName: "helper",
        displayName: "helper.score",
        startLine: 21,
        endLine: 28,
        complexity: 2,
        bodySpan: {
          startLine: 21,
          endLine: 28
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      },
      {
        functionName: "arrow",
        containerName: null,
        displayName: "arrow",
        startLine: 31,
        endLine: 38,
        complexity: 3,
        bodySpan: {
          startLine: 31,
          endLine: 38
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      }
    ]);
  });

  it("extracts constructor bodies and excludes nested functions from constructor complexity", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "constructor.ts");
    await writeFile(
      filePath,
      `class Example {
  constructor(flag: boolean) {
    const inner = () => {
      if (flag) {
        return 1;
      }
      return 0;
    };
    if (flag) {
      this.value = inner();
    }
  }

  value = 0;
}
`,
      "utf8"
    );

    const methods = await parseFileMethods(filePath);
    const byName = new Map(methods.map((method) => [method.displayName, method]));

    expect(methods.map((method) => method.displayName)).toEqual([
      "Example.constructor",
      "Example.inner"
    ]);
    expect(byName.get("Example.constructor")).toMatchObject({
      functionName: "constructor",
      containerName: "Example",
      startLine: 2,
      endLine: 12,
      complexity: 2,
      bodySpan: {
        startLine: 2,
        endLine: 12
      },
      expectsStatementCoverage: true,
      expectsBranchCoverage: true
    });
    expect(byName.get("Example.inner")).toMatchObject({
      functionName: "inner",
      containerName: "Example",
      complexity: 2
    });
  });

  it("ignores declaration files", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sample.d.ts");
    await writeFile(filePath, "export declare function missing(): void;", "utf8");

    expect(await parseFileMethods(filePath)).toEqual([]);
  });

  it("fails on parse diagnostics instead of returning partial methods", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "broken.ts");
    await writeFile(
      filePath,
      `export function partial(flag: boolean): number {
  if (flag) {
    return 1;
}
`,
      "utf8"
    );

    await expect(parseFileMethods(filePath)).rejects.toThrow(ParseError);
    await expect(parseFileMethods(filePath)).rejects.toThrow(
      new RegExp(`Unable to parse TypeScript source .*broken\\.ts: line \\d+, column \\d+:`)
    );
  });

  it("includes anonymous default-exported function declarations", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "defaultExport.ts");
    await writeFile(
      filePath,
      `export default function () {
  if (true) {
    return 1;
  }
  return 0;
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toMatchObject([
      {
        functionName: "default",
        containerName: null,
        displayName: "default",
        startLine: 1,
        endLine: 6,
        complexity: 2,
        bodySpan: {
          startLine: 1,
          endLine: 6
        },
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      }
    ]);
  });

  it("treats expression-bodied functions as having attributable statements and ignores type-only declarations", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "expression.ts");
    await writeFile(
      filePath,
      `export const trim = (value: string) => value.trim();

export function declarationsOnly(): void {
  type Local = { value: string };
  interface Shape { value: string }
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toMatchObject([
      {
        functionName: "trim",
        expectsStatementCoverage: true
      },
      {
        functionName: "declarationsOnly",
        expectsStatementCoverage: false
      }
    ]);
  });

  it("keeps statement coverage expected for runtime declarations and only treats empty or type-only bodies as structural N/A", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "declarations.ts");
    await writeFile(
      filePath,
      `export function empty(): void {}

export function typeOnly(): void {
  type Local = { value: string };
  interface Shape { value: string }
}

export function functionDeclOnly(): void {
  function inner() {}
}

export function classDeclOnly(): void {
  class Local {}
}

export function enumDeclOnly(): void {
  enum LocalEnum { A }
}
`,
      "utf8"
    );

    const methods = await parseFileMethods(filePath);
    const byName = new Map(methods.map((method) => [method.displayName, method]));

    expect(byName.get("empty")?.expectsStatementCoverage).toBe(false);
    expect(byName.get("typeOnly")?.expectsStatementCoverage).toBe(false);
    expect(byName.get("functionDeclOnly")?.expectsStatementCoverage).toBe(true);
    expect(byName.get("classDeclOnly")?.expectsStatementCoverage).toBe(true);
    expect(byName.get("enumDeclOnly")?.expectsStatementCoverage).toBe(true);
  });

  it("supports accessors, decorated methods, computed property names, and additional property-assigned forms", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "shapes.ts");
    await writeFile(
      filePath,
      `const renderKey = "render";
declare const logged: MethodDecorator;

class Example {
  get value(): number {
    if (true) {
      return 1;
    }
    return 0;
  }

  set value(flag: boolean) {
    if (flag) {
      return;
    }
  }

  @logged
  [renderKey](flag: boolean): number {
    return flag ? 1 : 0;
  }

  handler = (flag: boolean): number => flag ? 1 : 0;
}

const helper = {
  [renderKey](value: string): string {
    return value.trim();
  }
};

const registry: Record<string, (value: string) => string> = {};
registry.trim = (value: string) => value.trim();
registry["upper"] = function (value: string): string {
  return value ? value.toUpperCase() : value;
};
`,
      "utf8"
    );

    const methods = await parseFileMethods(filePath);
    const byName = new Map(methods.map((method) => [method.displayName, method]));

    expect(methods.map((method) => method.displayName)).toEqual([
      "Example.get value",
      "Example.set value",
      "Example[renderKey]",
      "Example.handler",
      "helper[renderKey]",
      "registry.trim",
      "registry[\"upper\"]"
    ]);
    expect(byName.get("Example.get value")).toMatchObject({
      functionName: "get value",
      containerName: "Example",
      complexity: 2,
      expectsStatementCoverage: true,
      expectsBranchCoverage: true
    });
    expect(byName.get("Example.set value")).toMatchObject({
      functionName: "set value",
      containerName: "Example",
      complexity: 2,
      expectsStatementCoverage: true,
      expectsBranchCoverage: true
    });
    expect(byName.get("Example[renderKey]")).toMatchObject({
      functionName: "[renderKey]",
      containerName: "Example",
      complexity: 2
    });
    expect(byName.get("Example.handler")).toMatchObject({
      functionName: "handler",
      containerName: "Example",
      complexity: 2
    });
    expect(byName.get("helper[renderKey]")).toMatchObject({
      functionName: "[renderKey]",
      containerName: "helper",
      complexity: 1
    });
    expect(byName.get("registry.trim")).toMatchObject({
      functionName: "trim",
      containerName: "registry",
      complexity: 1
    });
    expect(byName.get("registry[\"upper\"]")).toMatchObject({
      functionName: "[\"upper\"]",
      containerName: "registry",
      complexity: 2
    });
  });

  it("parses TSX-adjacent generic arrow functions", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "component.tsx");
    await writeFile(
      filePath,
      `export const RenderValue = <T,>({ value }: { value: T | null }) =>
  value ? <span>{String(value)}</span> : <span>empty</span>;
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toMatchObject([
      {
        functionName: "RenderValue",
        containerName: null,
        displayName: "RenderValue",
        complexity: 2,
        expectsStatementCoverage: true,
        expectsBranchCoverage: true
      }
    ]);
  });

  it("ignores ambient and namespace-only declaration containers", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "ambient.ts");
    await writeFile(
      filePath,
      `declare namespace Contracts {
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
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toEqual([]);
  });

  it("preserves private member names for methods and accessors", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "private-members.ts");
    await writeFile(
      filePath,
      `class Example {
  get #value(): number {
    return 1;
  }

  #render(): number {
    return 1;
  }
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toMatchObject([
      {
        functionName: "get #value",
        displayName: "Example.get #value"
      },
      {
        functionName: "#render",
        displayName: "Example.#render"
      }
    ]);
  });

  it("infers container names for nested object literals and assignment targets", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "containers.ts");
    await writeFile(
      filePath,
      `const registry: Record<string, unknown> = {};

registry.render = {
  nested(value: string): string {
    return value.trim();
  }
};

const root = {
  child: {
    leaf(value: number): number {
      return value + 1;
    }
  }
};

class Example {
  helper = {
    format(value: string): string {
      return value.toUpperCase();
    }
  };
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toMatchObject([
      {
        displayName: "registry.render.nested"
      },
      {
        displayName: "root.child.leaf"
      },
      {
        displayName: "Example.helper.format"
      }
    ]);
  });

  it("handles identifier, property, element, fallback, and unowned object-literal assignment targets", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "assignment-targets.ts");
    await writeFile(
      filePath,
      `let direct: ((value: string) => string) | undefined;
const registry: Record<string, unknown> = {};

direct = function (value: string): string {
  return value.trim();
};

registry.format = function (value: string): string {
  return value.toUpperCase();
};

registry["upper"] = function (value: string): string {
  return value ? value.toUpperCase() : value;
};

(registry as Record<string, unknown>) = function (value: string): string {
  return value;
};

export function createHandlers() {
  return {
    returned(value: number): number {
      return value + 1;
    }
  };
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayName: "direct"
      }),
      expect.objectContaining({
        displayName: "registry.format"
      }),
      expect.objectContaining({
        displayName: "registry[\"upper\"]"
      }),
      expect.objectContaining({
        displayName: "<assigned>"
      }),
      expect.objectContaining({
        displayName: "returned"
      })
    ]));
  });
});
