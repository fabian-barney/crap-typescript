import { readFile } from "node:fs/promises";
import ts from "typescript";

import { resolveScriptKind } from "./utils.js";
import type { MethodDescriptor, SourceSpan } from "./types.js";

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.Diagnostic[];
};

export class ParseError extends Error {
  readonly diagnostics: readonly ts.Diagnostic[];

  constructor(filePath: string, diagnostics: readonly ts.Diagnostic[]) {
    super(`Unable to parse TypeScript source ${filePath}: ${diagnostics.map(formatDiagnostic).join("; ")}`);
    this.name = "ParseError";
    this.diagnostics = diagnostics;
  }
}

const COMPLEXITY_INCREMENT_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause
]);
const SHORT_CIRCUIT_KINDS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken
]);
const BRANCH_SYNTAX_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.SwitchStatement
]);
const NESTED_BOUNDARY_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression
]);

export async function parseFileMethods(filePath: string): Promise<MethodDescriptor[]> {
  const sourceText = await readFile(filePath, "utf8");
  const scriptKind = resolveScriptKind(filePath) === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  throwIfParseDiagnostics(sourceFile);
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

function throwIfParseDiagnostics(sourceFile: ts.SourceFile): void {
  const diagnostics = (sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new ParseError(sourceFile.fileName, diagnostics);
  }
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return `${formatDiagnosticLocation(diagnostic)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
}

function formatDiagnosticLocation(diagnostic: ts.Diagnostic): string {
  if (!diagnostic.file || diagnostic.start === undefined) {
    return "unknown location";
  }
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `line ${location.line + 1}, column ${location.character + 1}`;
}

function toMethodDescriptor(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  for (const builder of DESCRIPTOR_BUILDERS) {
    const descriptor = builder(node, sourceFile);
    if (descriptor) {
      return descriptor;
    }
  }

  return null;
}

type DescriptorBuilder = (node: ts.Node, sourceFile: ts.SourceFile) => MethodDescriptor | null;

const DESCRIPTOR_BUILDERS: DescriptorBuilder[] = [
  descriptorFromFunctionDeclaration,
  descriptorFromMethodDeclaration,
  descriptorFromConstructorDeclaration,
  descriptorFromAccessorDeclaration,
  descriptorFromAssignedFunction
];

function descriptorFromFunctionDeclaration(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (!ts.isFunctionDeclaration(node) || !node.body) {
    return null;
  }
  const functionName = node.name?.text ?? inferFunctionDeclarationName(node);
  if (!functionName) {
    return null;
  }
  return buildMethodDescriptor(functionName, findContainerName(node), node, node.body, sourceFile);
}

function descriptorFromMethodDeclaration(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (!ts.isMethodDeclaration(node) || !node.body) {
    return null;
  }
  return buildMethodDescriptor(propertyName(node.name), findContainerName(node), node, node.body, sourceFile);
}

function descriptorFromConstructorDeclaration(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (!ts.isConstructorDeclaration(node) || !node.body) {
    return null;
  }
  return buildMethodDescriptor("constructor", findContainerName(node), node, node.body, sourceFile);
}

function descriptorFromAccessorDeclaration(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (!(ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) || !node.body) {
    return null;
  }
  return buildMethodDescriptor(accessorName(node), findContainerName(node), node, node.body, sourceFile);
}

function descriptorFromAssignedFunction(node: ts.Node, sourceFile: ts.SourceFile): MethodDescriptor | null {
  if (!(ts.isFunctionExpression(node) || ts.isArrowFunction(node))) {
    return null;
  }
  const assignedName = findAssignedFunctionName(node);
  if (!assignedName) {
    return null;
  }
  return buildMethodDescriptor(assignedName.name, assignedName.containerName, node, node.body, sourceFile);
}

function inferFunctionDeclarationName(node: ts.FunctionDeclaration): string | null {
  if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
    return "default";
  }
  return null;
}

function buildMethodDescriptor(
  functionName: string,
  containerName: string | null,
  node: ts.FunctionLikeDeclaration,
  bodyNode: ts.ConciseBody,
  sourceFile: ts.SourceFile
): MethodDescriptor {
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(bodyNode.end - 1, bodyNode.getStart(sourceFile))).line + 1;
  return {
    functionName,
    containerName,
    displayName: toDisplayName(containerName, functionName),
    startLine,
    endLine,
    complexity: countCyclomaticComplexity(node),
    bodySpan: toSourceSpan(bodyNode, sourceFile),
    expectsStatementCoverage: hasAttributableStatements(bodyNode),
    expectsBranchCoverage: hasAttributableBranches(bodyNode)
  };
}

function findAssignedFunctionName(
  node: ts.FunctionExpression | ts.ArrowFunction
): { name: string; containerName: string | null } | null {
  const parent = node.parent;
  for (const resolver of ASSIGNED_FUNCTION_NAME_RESOLVERS) {
    const assignedName = resolver(parent, node);
    if (assignedName) {
      return assignedName;
    }
  }
  return null;
}

type AssignedFunctionNameResolver = (
  parent: ts.Node,
  node: ts.FunctionExpression | ts.ArrowFunction
) => { name: string; containerName: string | null } | null;

const ASSIGNED_FUNCTION_NAME_RESOLVERS: AssignedFunctionNameResolver[] = [
  assignedNameFromVariableDeclaration,
  assignedNameFromPropertyAssignment,
  assignedNameFromPropertyDeclaration,
  assignedNameFromBinaryExpression
];

function assignedNameFromVariableDeclaration(parent: ts.Node): { name: string; containerName: string | null } | null {
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return {
      name: parent.name.text,
      containerName: findContainerName(parent)
    };
  }
  return null;
}

function assignedNameFromPropertyAssignment(parent: ts.Node): { name: string; containerName: string | null } | null {
  if (ts.isPropertyAssignment(parent)) {
    return {
      name: propertyName(parent.name),
      containerName: inferObjectContainerName(parent.parent)
    };
  }
  return null;
}

function assignedNameFromPropertyDeclaration(parent: ts.Node): { name: string; containerName: string | null } | null {
  if (ts.isPropertyDeclaration(parent)) {
    return {
      name: propertyName(parent.name),
      containerName: findContainerName(parent)
    };
  }
  return null;
}

function assignedNameFromBinaryExpression(
  parent: ts.Node,
  node: ts.FunctionExpression | ts.ArrowFunction
): { name: string; containerName: string | null } | null {
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node) {
    return assignmentTarget(parent.left);
  }
  return null;
}

function findContainerName(node: ts.Node): string | null {
  return containerNameFromAncestors(node.parent);
}

function inferObjectContainerName(node: ts.ObjectLiteralExpression): string | null {
  return containerNameFromAncestors(node);
}

function containerNameFromAncestors(start: ts.Node | undefined): string | null {
  const segments: string[] = [];
  let current = start;
  while (current) {
    const segment = containerSegment(current);
    if (segment) {
      segments.unshift(segment.name);
      if (segment.anchored) {
        break;
      }
    }
    current = current.parent;
  }
  return segments.length > 0 ? segments.join(".") : null;
}

interface ContainerSegment {
  name: string;
  anchored: boolean;
}

function containerSegment(node: ts.Node): ContainerSegment | null {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
    return relativeContainerSegment(node.name.text);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return localObjectContainerName(node);
  }
  return null;
}

function localObjectContainerName(node: ts.ObjectLiteralExpression): ContainerSegment | null {
  for (const resolver of OBJECT_CONTAINER_RESOLVERS) {
    const segment = resolver(node.parent);
    if (segment) {
      return segment;
    }
  }
  return null;
}

function assignmentTarget(node: ts.Expression): { name: string; containerName: string | null } {
  for (const resolver of ASSIGNMENT_TARGET_RESOLVERS) {
    const target = resolver(node);
    if (target) {
      return target;
    }
  }
  return {
    name: "<assigned>",
    containerName: null
  };
}

type ObjectContainerResolver = (parent: ts.Node) => ContainerSegment | null;

const OBJECT_CONTAINER_RESOLVERS: ObjectContainerResolver[] = [
  containerFromVariableDeclaration,
  containerFromPropertyAssignment,
  containerFromPropertyDeclaration,
  containerFromBinaryAssignment
];

function containerFromVariableDeclaration(parent: ts.Node): ContainerSegment | null {
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return relativeContainerSegment(parent.name.text);
  }
  return null;
}

function containerFromPropertyAssignment(parent: ts.Node): ContainerSegment | null {
  if (ts.isPropertyAssignment(parent)) {
    return relativeContainerSegment(propertyName(parent.name));
  }
  return null;
}

function containerFromPropertyDeclaration(parent: ts.Node): ContainerSegment | null {
  if (ts.isPropertyDeclaration(parent)) {
    return relativeContainerSegment(propertyName(parent.name));
  }
  return null;
}

function containerFromBinaryAssignment(parent: ts.Node): ContainerSegment | null {
  if (!isAssignmentExpression(parent)) {
    return null;
  }
  const target = assignmentTarget(parent.left);
  return anchoredContainerSegment(toDisplayName(target.containerName, target.name));
}

function relativeContainerSegment(name: string): ContainerSegment {
  return { name, anchored: false };
}

function anchoredContainerSegment(name: string): ContainerSegment {
  return { name, anchored: true };
}

type AssignmentTargetResolver = (node: ts.Expression) => { name: string; containerName: string | null } | null;

const ASSIGNMENT_TARGET_RESOLVERS: AssignmentTargetResolver[] = [
  assignmentFromIdentifier,
  assignmentFromPropertyAccess,
  assignmentFromElementAccess
];

function assignmentFromIdentifier(node: ts.Expression): { name: string; containerName: string | null } | null {
  if (ts.isIdentifier(node)) {
    return {
      name: node.text,
      containerName: null
    };
  }
  return null;
}

function assignmentFromPropertyAccess(node: ts.Expression): { name: string; containerName: string | null } | null {
  if (ts.isPropertyAccessExpression(node)) {
    const containerName = dottedAccessName(node.expression);
    if (!containerName) {
      return null;
    }
    return {
      name: node.name.text,
      containerName
    };
  }
  return null;
}

function dottedAccessName(node: ts.Expression): string | null {
  const parts: string[] = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  const rootName = dottedAccessRootName(current);
  if (!rootName) {
    return null;
  }
  parts.unshift(rootName);
  return parts.join(".");
}

function dottedAccessRootName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  switch (node.kind) {
    case ts.SyntaxKind.ThisKeyword:
      return "this";
    case ts.SyntaxKind.SuperKeyword:
      return "super";
    default:
      return null;
  }
}

function assignmentFromElementAccess(node: ts.Expression): { name: string; containerName: string | null } | null {
  if (ts.isElementAccessExpression(node)) {
    return {
      name: `[${node.argumentExpression?.getText() ?? ""}]`,
      containerName: node.expression.getText()
    };
  }
  return null;
}

function accessorName(node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration): string {
  return `${ts.isGetAccessorDeclaration(node) ? "get" : "set"} ${propertyName(node.name)}`;
}

function toDisplayName(containerName: string | null, functionName: string): string {
  if (!containerName) {
    return functionName;
  }
  return functionName.startsWith("[")
    ? `${containerName}${functionName}`
    : `${containerName}.${functionName}`;
}

function propertyName(name: ts.PropertyName): string {
  if (ts.isPrivateIdentifier(name)) {
    return name.getText();
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function countCyclomaticComplexity(node: ts.FunctionLikeDeclaration): number {
  let complexity = 1;

  const visit = (current: ts.Node): void => {
    if (current !== node && isNestedBoundary(current)) {
      return;
    }
    complexity += complexityContribution(current);
    ts.forEachChild(current, visit);
  };

  if (node.body) {
    visit(node.body);
  }
  return complexity;
}

function toSourceSpan(node: ts.Node, sourceFile: ts.SourceFile): SourceSpan {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.end);
  return {
    startLine: start.line + 1,
    startColumn: start.character,
    endLine: end.line + 1,
    endColumn: end.character
  };
}

function hasAttributableStatements(body: ts.ConciseBody): boolean {
  return ts.isBlock(body)
    ? body.statements.some((statement) => !isProvablyNonExecutableDeclarationStatement(statement))
    : true;
}

function hasAttributableBranches(body: ts.ConciseBody): boolean {
  let found = false;

  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (current !== body && isNestedBoundary(current)) {
      return;
    }
    if (hasBranchSyntax(current)) {
      found = true;
      return;
    }

    ts.forEachChild(current, visit);
  };

  visit(body);
  return found;
}

function isNestedBoundary(node: ts.Node): boolean {
  return NESTED_BOUNDARY_KINDS.has(node.kind);
}

function isProvablyNonExecutableDeclarationStatement(statement: ts.Statement): boolean {
  return ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement);
}

function complexityContribution(node: ts.Node): number {
  if (COMPLEXITY_INCREMENT_KINDS.has(node.kind)) {
    return 1;
  }
  if (hasOwnOptionalChainToken(node)) {
    return 1;
  }
  if (!ts.isBinaryExpression(node)) {
    return 0;
  }
  return SHORT_CIRCUIT_KINDS.has(node.operatorToken.kind) ? 1 : 0;
}

function hasBranchSyntax(node: ts.Node): boolean {
  if (BRANCH_SYNTAX_KINDS.has(node.kind)) {
    return true;
  }
  if (hasOwnOptionalChainToken(node)) {
    return true;
  }
  return ts.isBinaryExpression(node) && SHORT_CIRCUIT_KINDS.has(node.operatorToken.kind);
}

function hasOwnOptionalChainToken(node: ts.Node): boolean {
  return (ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node) || ts.isCallChain(node)) &&
    node.questionDotToken !== undefined;
}

function isAssignmentExpression(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
}
