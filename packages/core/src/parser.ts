import { readFile } from "node:fs/promises";
import ts from "typescript";

import { resolveScriptKind } from "./utils";
import type { MethodDescriptor } from "./types";

export async function parseFileMethods(filePath: string): Promise<MethodDescriptor[]> {
  const sourceText = await readFile(filePath, "utf8");
  const scriptKind = resolveScriptKind(filePath) === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const methods: MethodDescriptor[] = [];

  const visit = (node: ts.Node): void => {
    const descriptor = toMethodDescriptor(node, sourceFile);
    if (descriptor) {
      methods.push(descriptor);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return methods;
}

function toMethodDescriptor(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (ts.isFunctionDeclaration(node)) {
    if (!node.body || !node.name) {
      return null;
    }
    return buildMethodDescriptor(node.name.text, findContainerName(node), node, sourceFile);
  }

  if (ts.isMethodDeclaration(node)) {
    if (!node.body || ts.isConstructorDeclaration(node)) {
      return null;
    }
    return buildMethodDescriptor(propertyName(node.name), findContainerName(node), node, sourceFile);
  }

  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const assignedName = findAssignedFunctionName(node);
    if (!assignedName) {
      return null;
    }
    return buildMethodDescriptor(assignedName.name, assignedName.containerName, node, sourceFile);
  }

  return null;
}

function buildMethodDescriptor(
  functionName: string,
  containerName: string | null,
  node: ts.FunctionLikeDeclarationBase,
  sourceFile: ts.SourceFile
): MethodDescriptor {
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const bodyNode = node.body ?? node;
  const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(bodyNode.end - 1, bodyNode.getStart(sourceFile))).line + 1;
  return {
    functionName,
    containerName,
    displayName: containerName ? `${containerName}.${functionName}` : functionName,
    startLine,
    endLine,
    complexity: countCyclomaticComplexity(node)
  };
}

function findAssignedFunctionName(
  node: ts.FunctionExpression | ts.ArrowFunction
): { name: string; containerName: string | null } | null {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return {
      name: parent.name.text,
      containerName: findContainerName(parent)
    };
  }
  if (ts.isPropertyAssignment(parent)) {
    return {
      name: propertyName(parent.name),
      containerName: inferObjectContainerName(parent.parent)
    };
  }
  if (ts.isPropertyDeclaration(parent)) {
    return {
      name: propertyName(parent.name),
      containerName: findContainerName(parent)
    };
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node) {
    return {
      name: assignmentName(parent.left),
      containerName: null
    };
  }
  return null;
}

function findContainerName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if ((ts.isClassDeclaration(current) || ts.isClassExpression(current)) && current.name) {
      return current.name.text;
    }
    if (ts.isObjectLiteralExpression(current)) {
      const inferred = inferObjectContainerName(current);
      if (inferred) {
        return inferred;
      }
    }
    current = current.parent;
  }
  return null;
}

function inferObjectContainerName(node: ts.ObjectLiteralExpression): string | null {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return propertyName(parent.name);
  }
  if (ts.isPropertyDeclaration(parent)) {
    return propertyName(parent.name);
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return assignmentName(parent.left);
  }
  return null;
}

function assignmentName(node: ts.Node): string {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return node.getText();
  }
  return "<assigned>";
}

function propertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function countCyclomaticComplexity(node: ts.FunctionLikeDeclarationBase): number {
  let complexity = 1;

  const visit = (current: ts.Node): void => {
    if (current !== node && isNestedBoundary(current)) {
      return;
    }

    if (
      ts.isIfStatement(current) ||
      ts.isForStatement(current) ||
      ts.isForInStatement(current) ||
      ts.isForOfStatement(current) ||
      ts.isWhileStatement(current) ||
      ts.isDoStatement(current) ||
      ts.isCatchClause(current) ||
      ts.isConditionalExpression(current)
    ) {
      complexity += 1;
    } else if (ts.isCaseClause(current)) {
      complexity += 1;
    } else if (ts.isBinaryExpression(current)) {
      const kind = current.operatorToken.kind;
      if (
        kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        complexity += 1;
      }
    }

    ts.forEachChild(current, visit);
  };

  if (node.body) {
    visit(node.body);
  }
  return complexity;
}

function isNestedBoundary(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node);
}

