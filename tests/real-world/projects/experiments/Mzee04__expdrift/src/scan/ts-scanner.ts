import ts from "typescript";
import type { CallSite, Sdk } from "../types.ts";
import type { ExpDriftConfig } from "../config.ts";

export type ExportTable = Map<string, Map<string, string>>;

const NODE_SDK = ["@flagsmith/nodejs", "flagsmith-nodejs"];
const BROWSER_SDK = ["flagsmith", "@flagsmith/flagsmith", "flagsmith/react", "@flagsmith/flagsmith/react", "flagsmith/isomorphic"];

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(m|c)?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
}

function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  for (;;) {
    if (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur) || ts.isAwaitExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isTypeAssertionExpression(cur)) cur = cur.expression;
    else return cur;
  }
}

function literalText(e: ts.Expression): string | null {
  const u = unwrap(e);
  if (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u)) return u.text;
  return null;
}

/** A literal on the other side of a flag comparison, with its JS type (strings, numbers, booleans). */
function compareLiteral(e: ts.Expression): { text: string; type: "string" | "number" | "boolean" } | null {
  const u = unwrap(e);
  const str = literalText(u);
  if (str !== null) return { text: str, type: "string" };
  if (ts.isNumericLiteral(u)) return { text: String(Number(u.text)), type: "number" };
  if (ts.isPrefixUnaryExpression(u) && u.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(u.operand)) return { text: String(-Number(u.operand.text)), type: "number" };
  if (u.kind === ts.SyntaxKind.TrueKeyword) return { text: "true", type: "boolean" };
  if (u.kind === ts.SyntaxKind.FalseKeyword) return { text: "false", type: "boolean" };
  return null;
}

/**
 * Collects exported string constants (and `as const` object members) of one file.
 * Supported: `export const X = "..."`, `export const MAP = { k: "..." } as const`, and a later
 * `export { X }` / `export { X as Y }`, `export default { k: "..." }` (as `default.k`), and CommonJS
 * `module.exports = { k: "..." }` / `exports.k = "..."`. Not supported: values built at runtime,
 * re-exports from other modules (`export * from`), and `let`/`var` bindings.
 */
export function collectConstants(sf: ts.SourceFile): { all: Map<string, string>; exported: Map<string, string> } {
  const all = new Map<string, string>();
  const exported = new Map<string, string>();
  const visitObject = (prefix: string, obj: ts.ObjectLiteralExpression, isExported: boolean) => {
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      if (!key) continue;
      const init = unwrap(p.initializer);
      const lit = literalText(init);
      const name = prefix ? `${prefix}.${key}` : key;
      if (lit !== null) {
        all.set(name, lit);
        if (isExported) exported.set(name, lit);
      } else if (ts.isObjectLiteralExpression(init)) visitObject(name, init, isExported);
    }
  };
  const exportLater: [string, string][] = [];
  for (const stmt of sf.statements) {
    // export { X } / export { X as Y }
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) exportLater.push([(el.propertyName ?? el.name).text, el.name.text]);
      continue;
    }
    // export default { ... }
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const init = unwrap(stmt.expression);
      if (ts.isObjectLiteralExpression(init)) visitObject("default", init, true);
      continue;
    }
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = stmt.expression.left;
      const right = unwrap(stmt.expression.right);
      const lt = left.getText(sf).replace(/\s+/g, "");
      // module.exports = { ... }
      if (lt === "module.exports" && ts.isObjectLiteralExpression(right)) {
        for (const p of right.properties) {
          if (ts.isShorthandPropertyAssignment(p)) exportLater.push([p.name.text, p.name.text]);
        }
        visitObject("", right, true);
      }
      // exports.k = "..." / module.exports.k = "..."
      const m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/.exec(lt);
      if (m) {
        const lit = literalText(right);
        if (lit !== null) {
          all.set(m[1]!, lit);
          exported.set(m[1]!, lit);
        } else if (ts.isObjectLiteralExpression(right)) visitObject(m[1]!, right, true);
      }
      continue;
    }
    if (!ts.isVariableStatement(stmt)) continue;
    if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) continue;
    const isExported = !!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      const lit = literalText(init);
      if (lit !== null) {
        all.set(d.name.text, lit);
        if (isExported) exported.set(d.name.text, lit);
      } else if (ts.isObjectLiteralExpression(init)) visitObject(d.name.text, init, isExported);
    }
  }
  for (const [local, as] of exportLater) {
    for (const [k, v] of all) {
      if (k === local) exported.set(as, v);
      else if (k.startsWith(local + ".")) exported.set(as + k.slice(local.length), v);
    }
  }
  return { all, exported };
}

function resolveImport(fromFile: string, spec: string, table: ExportTable): Map<string, string> | undefined {
  if (!spec.startsWith(".")) return undefined;
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const parts = (dir ? dir.split("/") : []).concat(spec.split("/"));
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  const base = stack.join("/").replace(/\.(js|mjs|cjs|jsx)$/, "");
  for (const cand of [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"].flatMap((e) => [base + e, `${base}/index${e}`])]) {
    const hit = table.get(cand);
    if (hit) return hit;
  }
  return undefined;
}

function exprText(e: ts.Expression, sf: ts.SourceFile): string {
  return e.getText(sf).replace(/\s+/g, "");
}

export function scanTsFile(file: string, text: string, cfg: ExpDriftConfig, table: ExportTable): CallSite[] {
  const sf = parse(file, text);
  const lines = text.split(/\r?\n/);
  const { all: consts } = collectConstants(sf);
  const aliases = new Map<string, string>(); // const id = user.id
  const flagVars = new Map<string, string | null>(); // const flag = getExperimentFlag('x')
  let sdkHint: Sdk | null = null;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      if (NODE_SDK.includes(spec)) sdkHint = "node";
      else if (BROWSER_SDK.includes(spec) && sdkHint !== "node") sdkHint = spec.endsWith("react") ? "react" : "browser";
      const defaultName = stmt.importClause?.name?.text;
      if (defaultName) {
        const exports = resolveImport(file, spec, table);
        for (const [k, v] of exports ?? []) if (k.startsWith("default.")) consts.set(defaultName + k.slice("default".length), v);
      }
      const named = stmt.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        const exports = resolveImport(file, spec, table);
        if (exports) {
          for (const el of named.elements) {
            const imported = (el.propertyName ?? el.name).text;
            for (const [k, v] of exports) {
              if (k === imported) consts.set(el.name.text, v);
              else if (k.startsWith(imported + ".")) consts.set(el.name.text + k.slice(imported.length), v);
            }
          }
        }
      }
    }
  }
  // CommonJS require hint
  if (!sdkHint) {
    if (NODE_SDK.some((s) => text.includes(`require("${s}")`) || text.includes(`require('${s}')`))) sdkHint = "node";
    else if (BROWSER_SDK.some((s) => text.includes(`require("${s}")`) || text.includes(`require('${s}')`))) sdkHint = "browser";
  }

  const resolveName = (e: ts.Expression): { name: string | null; dynamic: boolean; literalNode?: ts.Expression } => {
    const u = unwrap(e);
    const lit = literalText(u);
    if (lit !== null) return { name: lit, dynamic: false, literalNode: u };
    const t = exprText(u, sf);
    if (consts.has(t)) return { name: consts.get(t)!, dynamic: false };
    return { name: null, dynamic: true };
  };

  const resolveIdentity = (e: ts.Expression): { text: string; resolved: boolean } => {
    let u = unwrap(e);
    const seen = new Set<string>();
    while (ts.isIdentifier(u) && aliases.has(u.text) && !seen.has(u.text)) {
      seen.add(u.text);
      const target = aliases.get(u.text)!;
      return { text: target, resolved: !/^[A-Za-z_$][\w$]*$/.test(target) || target.includes(".") };
    }
    u = unwrap(u);
    const t = exprText(u, sf);
    if (ts.isIdentifier(u)) return { text: t, resolved: false };
    return { text: t, resolved: true };
  };

  const calleeInfo = (call: ts.CallExpression): { method: string; full: string } | null => {
    const c = call.expression;
    if (ts.isIdentifier(c)) return { method: c.text, full: c.text };
    if (ts.isPropertyAccessExpression(c)) return { method: c.name.text, full: exprText(c, sf) };
    return null;
  };

  const classify = (full: string, method: string): "exposure-flag" | "exposure-hook" | "exposure-track" | "track" | "identify" | null => {
    if (cfg.aliases.trackEvent.includes(full)) return "track";
    if (cfg.aliases.getExperimentFlag.includes(full)) return "exposure-flag";
    if (cfg.aliases.trackExposureEvent.includes(full)) return "exposure-track";
    if (cfg.aliases.identify.includes(full)) return "identify";
    switch (method) {
      case "getExperimentFlag":
        return "exposure-flag";
      case "useExperiment":
        return "exposure-hook";
      case "trackExposureEvent":
        return "exposure-track";
      case "trackEvent":
        return "track";
      case "identify":
        return full === "identify" || /flagsmith/i.test(full) ? "identify" : null;
      default:
        return null;
    }
  };

  const optIdentifier = (arg: ts.Expression | undefined): ts.Expression | undefined => {
    if (!arg) return undefined;
    const u = unwrap(arg);
    if (!ts.isObjectLiteralExpression(u)) return undefined;
    for (const p of u.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "identifier") return p.initializer;
      if (ts.isShorthandPropertyAssignment(p) && p.name.text === "identifier") return p.name;
    }
    return undefined;
  };

  const out: CallSite[] = [];
  let identifySeenAt = Number.POSITIVE_INFINITY;
  const pos = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf));
  const literalSpan = (n: ts.Expression | undefined) => {
    if (!n) return undefined;
    const s = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    const e = sf.getLineAndCharacterOfPosition(n.getEnd());
    if (s.line !== e.line) return undefined;
    return { line: s.line + 1, startCol: s.character, endCol: e.character, quote: text[n.getStart(sf)] ?? '"' };
  };

  const visit = (node: ts.Node) => {
    // aliases and flag variables
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isPropertyAccessExpression(init) || ts.isElementAccessExpression(init)) aliases.set(node.name.text, exprText(init, sf));
      else if (ts.isIdentifier(init) && init.text !== "undefined") aliases.set(node.name.text, aliases.get(init.text) ?? init.text);
      if (ts.isCallExpression(init)) {
        const info = calleeInfo(init);
        const kind = info && classify(info.full, info.method);
        if (kind === "exposure-flag" || kind === "exposure-hook") {
          flagVars.set(node.name.text, init.arguments[0] ? resolveName(init.arguments[0]).name : null);
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const info = calleeInfo(node);
      const kind = info && classify(info.full, info.method);
      if (info && kind) {
        const p = pos(node);
        const base = { file, line: p.line + 1, column: p.character + 1, method: info.method, lineText: lines[p.line] ?? "" };
        const isWrapper = [cfg.aliases.trackEvent, cfg.aliases.getExperimentFlag, cfg.aliases.trackExposureEvent, cfg.aliases.identify].some((l) => l.includes(info.full));
        if (kind === "identify") {
          const arg = node.arguments[0];
          if (arg) {
            const id = resolveIdentity(arg);
            identifySeenAt = Math.min(identifySeenAt, node.getStart(sf));
            out.push({ ...base, kind: "identify", sdk: isWrapper ? "wrapper" : (sdkHint ?? "browser"), name: null, dynamic: false, identifier: id.text, identifierResolved: id.resolved, hasIdentifier: true });
          }
        } else {
          const arg0 = node.arguments[0];
          const r = arg0 ? resolveName(arg0) : { name: null, dynamic: true };
          let identifierExpr: ts.Expression | undefined;
          let sdk: Sdk = isWrapper ? "wrapper" : (sdkHint ?? "browser");
          if (kind === "exposure-flag") {
            identifierExpr = node.arguments[1];
            if (!isWrapper) sdk = identifierExpr ? "node" : sdkHint === "node" ? "node" : "browser";
          } else if (kind === "exposure-hook") {
            sdk = "react";
          } else {
            identifierExpr = optIdentifier(node.arguments[1]);
          }
          const id = identifierExpr ? resolveIdentity(identifierExpr) : null;
          const site: CallSite = {
            ...base,
            kind: kind === "track" ? "track" : "exposure",
            sdk,
            name: r.name,
            dynamic: r.dynamic,
            identifier: id?.text ?? null,
            identifierResolved: id?.resolved ?? false,
            hasIdentifier: !!identifierExpr,
            literal: literalSpan(r.literalNode),
            identifiedBefore: identifySeenAt < node.getStart(sf),
          };
          if (r.dynamic && arg0) site.nameExpr = exprText(arg0, sf);
          out.push(site);
        }
      }
    }

    // comparisons: flag.value === 'x', flag.variant !== 'x'
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      const strictOp = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
      const looseOp = op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
      if (strictOp || looseOp) {
        for (const [a, b] of [[node.left, node.right], [node.right, node.left]] as const) {
          const cmp = compareTarget(a);
          const lit = compareLiteral(b);
          if (cmp && lit) {
            const p = pos(b);
            out.push({ kind: "compare", method: cmp.property, sdk: sdkHint ?? "browser", name: lit.text, literalType: lit.type, strict: strictOp, dynamic: false, flag: cmp.flag, property: cmp.property, file, line: p.line + 1, column: p.character + 1, lineText: lines[p.line] ?? "", literal: lit.type === "string" ? literalSpan(unwrap(b)) : undefined });
          }
        }
      }
    }
    if (ts.isSwitchStatement(node)) {
      const cmp = compareTarget(node.expression);
      if (cmp) {
        for (const clause of node.caseBlock.clauses) {
          if (!ts.isCaseClause(clause)) continue;
          const lit = compareLiteral(clause.expression);
          if (!lit) continue;
          const p = pos(clause.expression);
          // switch uses strict equality
          out.push({ kind: "compare", method: cmp.property, sdk: sdkHint ?? "browser", name: lit.text, literalType: lit.type, strict: true, dynamic: false, flag: cmp.flag, property: cmp.property, file, line: p.line + 1, column: p.character + 1, lineText: lines[p.line] ?? "", literal: lit.type === "string" ? literalSpan(unwrap(clause.expression)) : undefined });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  const compareTarget = (e: ts.Expression): { flag: string | null; property: string } | null => {
    const u = unwrap(e);
    if (ts.isPropertyAccessExpression(u) && (u.name.text === "value" || u.name.text === "variant")) {
      const obj = unwrap(u.expression);
      if (ts.isIdentifier(obj) && flagVars.has(obj.text)) return { flag: flagVars.get(obj.text) ?? null, property: u.name.text };
    }
    return null;
  };

  visit(sf);
  return out;
}
