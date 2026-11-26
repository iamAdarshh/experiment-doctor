// Turns pasted JS/TS into a small list of "facts" the rules read: Flagsmith calls, SDK configs and plain
// flag reads. Rules never walk the AST themselves, so each rule stays short and easy to explain.
//
// Parser: @babel/parser (https://babeljs.io/docs/babel-parser), with the `typescript` and `jsx` plugins.
// Options used: `errorRecovery` (collect syntax errors instead of throwing on the first one),
// `startLine` / `startIndex` / `startColumn` (so positions in a multi-file paste are positions in the whole box).

import { parse } from '@babel/parser';
import type * as t from '@babel/types';
import type { ParseError } from './types';

/** Position of something in the pasted code box. Lines and columns are 1-based; start/end are string offsets. */
export type Pos = { line: number; column: number; start: number; end: number };

/** Whether a Flagsmith client runs in the browser (`@flagsmith/flagsmith`) or on a server (`@flagsmith/nodejs`). */
export type Runtime = 'browser' | 'node';

/** The statement a call sits in, so a patch can insert a new line after it. */
export type StatementInfo = Pos & { endLine: number; scopeId: number };

export type CallFact = Pos & {
  /** Method or function name, for example `trackEvent`. */
  name: string;
  /** The object it is called on, for example `flagsmith` in `flagsmith.trackEvent()`. Undefined for bare calls. */
  receiver?: string;
  /** True when the receiver looks like a Flagsmith client (see isFlagsmithReceiver). */
  onFlagsmith: boolean;
  args: t.Node[];
  /** The first argument when it is a plain string or a top-level string constant, for example the event name. */
  firstString?: string;
  /** The string literal that holds `firstString`: the argument itself, or the constant's value when the argument
   *  is a constant (`const EVENT = 'purchase'`). Rules point at it and patch it. */
  firstStringNode?: t.Node;
  /** Start offset of the enclosing function, or -1 at the top level. Used to compare order inside one function. */
  scopeId: number;
  /** Which pasted file (`// @file` section) the call is in, counting from 0. */
  file: number;
  statement?: StatementInfo;
  /** True when an `await` is allowed where the call is (async function, or top level of a module). */
  canAwait: boolean;
  /** Runtime of the client this call goes to, when it can be told. */
  runtime?: Runtime;
};

export type PropFact = Pos & {
  value: t.Node;
  /** Set when the value is a literal `true` / `false`. */
  bool?: boolean;
  /** Set when the value is a plain string. */
  str?: string;
};

/** An SDK options object: `flagsmith.init({...})`, `new Flagsmith({...})` or `<FlagsmithProvider options={{...}}>`. */
export type ConfigFact = Pos & {
  runtime: Runtime;
  /** False when the options are a variable we could not resolve, or contain `...spread`. Rules then can't be sure. */
  readable: boolean;
  object?: t.ObjectExpression;
  props: Map<string, PropFact>;
  statement?: StatementInfo;
  /** The client variable, for example `flagsmith`, when known. */
  receiver?: string;
};

/** A flag read that does not record an exposure, for example `flagsmith.getValue('x')`. */
export type FlagReadFact = Pos & {
  flag: string;
  /** The argument as written when it is a constant, for example `FLAG_NAME`, so a patch can keep using it. */
  flagConstant?: string;
  /** How it was read, for the message: getValue, hasFeature, getAllFlags, useFlags, getFeatureValue... */
  via: string;
  runtime?: Runtime;
};

export type CodeFacts = {
  calls: CallFact[];
  configs: ConfigFact[];
  flagReads: FlagReadFact[];
  /** True when anything Flagsmith-related was found. */
  usesFlagsmith: boolean;
  /** True when the code looks like a long-running server or a request handler (affects no-flush confidence). */
  looksLikeServer: boolean;
};

export type CodeAnalysis =
  | { ok: true; facts: CodeFacts }
  | { ok: false; reason: string; parseErrors: ParseError[] };

const FILE_MARKER = /^\/\/ @file (.+)$/;

/** A slice of the code box. Several files can be pasted at once, each starting with `// @file <path>`. */
export type Segment = { path: string | null; text: string; startIndex: number; startLine: number };

export function splitSegments(code: string): Segment[] {
  const lines = code.split('\n');
  const segments: Segment[] = [];
  let current: { path: string | null; lines: string[]; startIndex: number; startLine: number } = {
    path: null,
    lines: [],
    startIndex: 0,
    startLine: 1,
  };
  let offset = 0;
  lines.forEach((line, index) => {
    const marker = FILE_MARKER.exec(line);
    if (marker && index > 0) {
      segments.push({ path: current.path, text: current.lines.join('\n'), startIndex: current.startIndex, startLine: current.startLine });
      current = { path: marker[1]!.trim(), lines: [line], startIndex: offset, startLine: index + 1 };
    } else {
      if (marker) current.path = marker[1]!.trim();
      current.lines.push(line);
    }
    offset += line.length + 1;
  });
  segments.push({ path: current.path, text: current.lines.join('\n'), startIndex: current.startIndex, startLine: current.startLine });
  return segments;
}

/**
 * The doctor reads JS/TS with a real parser. Other languages are recognised so we can say so honestly
 * ("not checked") instead of reporting a false all-clear.
 */
export function detectOtherLanguage(code: string): string | null {
  // Python: `from flagsmith import Flagsmith`, a bare `import flagsmith` line, or a `def f(...):` line.
  // (A JS line like `import flagsmith from '...'` must not match, so the bare import has to end the line.)
  if (
    /^\s*from\s+flagsmith(\.\w+)*\s+import\s/m.test(code) ||
    /^\s*import\s+flagsmith\s*$/m.test(code) ||
    /^\s*def\s+\w+\(.*\)\s*(->.*)?:\s*$/m.test(code)
  ) {
    return 'Python';
  }
  if (/^\s*package\s+\w+\s*$/m.test(code) && /^\s*func\s/m.test(code)) return 'Go';
  if (/^\s*import\s+com\.flagsmith\./m.test(code) || /\bpublic\s+(static\s+)?(class|void)\s/.test(code)) return 'Java';
  return null;
}

const FLAGSMITH_PACKAGE = /flagsmith/i;
const EVENT_METHODS = new Set(['getExperimentFlag', 'trackEvent', 'trackExposureEvent', 'flushEvents']);
/** Methods no other common SDK has (trackEvent and identify are shared with analytics tools, so they don't count). */
const FLAGSMITH_ONLY_METHODS = new Set(['getExperimentFlag', 'trackExposureEvent']);

/** `window.flagsmith`, `globalThis.flagsmith` or `self.flagsmith`. */
function isGlobalFlagsmith(node: t.Node): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    ['window', 'globalThis', 'self'].includes(node.object.name) &&
    node.property.type === 'Identifier' &&
    node.property.name === 'flagsmith'
  );
}

export function analyzeCode(code: string): CodeAnalysis {
  const otherLanguage = detectOtherLanguage(code);
  if (otherLanguage) {
    return {
      ok: false,
      reason: `${otherLanguage} code was detected; code checks currently read JavaScript and TypeScript only.`,
      parseErrors: [],
    };
  }

  const parseErrors: ParseError[] = [];
  const programs: { program: t.Program; segment: Segment }[] = [];
  for (const segment of splitSegments(code)) {
    // A `#!/usr/bin/env node` line is only legal as the very first line, but in a multi-file paste it follows the
    // `// @file` marker. Turn `#!` into `//` (same length, so every position stays the same).
    const text = segment.text.replace(/^((?:\/\/ @file .*\n)?)#!/, '$1//');
    let attempt = parseSegment(text, segment, true);
    // `<any>window` (an old-style TypeScript cast) is valid in a .ts file but reads as JSX. When parsing with JSX
    // fails and the file is not known to be .tsx/.jsx, try again without JSX and keep that if it parses cleanly.
    if (attempt.errors.length > 0 && !/\.(tsx|jsx)$/.test(segment.path ?? '')) {
      const withoutJsx = parseSegment(text, segment, false);
      if (withoutJsx.errors.length === 0) attempt = withoutJsx;
    }
    // A half-understood file could hide a bug and give a false all-clear, so recovered errors still count.
    parseErrors.push(...attempt.errors);
    if (attempt.program) programs.push({ program: attempt.program, segment });
  }

  if (parseErrors.length > 0) {
    const first = parseErrors[0]!;
    return { ok: false, reason: `The code could not be parsed (line ${first.line}: ${first.message}).`, parseErrors };
  }

  const collector = new FactCollector();
  for (const { program } of programs) collector.collectProgram(program);
  return { ok: true, facts: collector.finish() };
}

/** Parses one pasted file. `decorators-legacy` covers Angular and NestJS (`@Component(...)`). */
function parseSegment(text: string, segment: Segment, jsx: boolean): { program?: t.Program; errors: ParseError[] } {
  try {
    const file = parse(text, {
      sourceType: 'module',
      plugins: jsx ? ['typescript', 'jsx', 'decorators-legacy'] : ['typescript', 'decorators-legacy'],
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      startLine: segment.startLine,
      startIndex: segment.startIndex,
      startColumn: 0,
    });
    // With errorRecovery, babel lists errors it recovered from.
    const recovered = (file as unknown as { errors?: { loc?: { line: number }; message: string }[] }).errors ?? [];
    const errors = recovered.map((error) => ({ source: 'code' as const, line: error.loc?.line ?? segment.startLine, message: cleanBabelMessage(error.message) }));
    return { program: file.program, errors };
  } catch (error) {
    const loc = (error as { loc?: { line: number } }).loc;
    return { errors: [{ source: 'code', line: loc?.line ?? segment.startLine, message: cleanBabelMessage((error as Error).message) }] };
  }
}

/** Babel messages end with "(line:column)"; we report the line separately. */
function cleanBabelMessage(message: string): string {
  return message.replace(/\s*\(\d+:\d+\)\s*$/, '');
}

function posOf(node: t.Node): Pos {
  return {
    line: node.loc?.start.line ?? 1,
    column: (node.loc?.start.column ?? 0) + 1,
    start: node.start ?? 0,
    end: node.end ?? 0,
  };
}

function isNode(value: unknown): value is t.Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function stringValue(node: t.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

/** `a.b.c` -> 'c'; `this.flagsmith` -> 'flagsmith'; `flagsmith` -> 'flagsmith'. */
function lastName(node: t.Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.type === 'TSNonNullExpression') return lastName(node.expression);
  return undefined;
}

function propertyKeyName(prop: t.ObjectProperty | t.ObjectMethod): string | undefined {
  if (prop.computed) return stringValue(prop.key);
  if (prop.key.type === 'Identifier') return prop.key.name;
  return stringValue(prop.key);
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

type WalkState = { scopeId: number; isAsync: boolean; statement?: StatementInfo };

/**
 * Walks every program once and records facts. Two passes: the first finds names bound to Flagsmith
 * (imports, `new Flagsmith()`, `useFlagsmith()`) and object variables; the second records calls.
 */
class FactCollector {
  private flagsmithNames = new Set<string>();
  /** Names imported or required from a Flagsmith package (`Flagsmith` from '@flagsmith/nodejs', ...). */
  private sdkImports = new Set<string>();
  /** Runtime of each client name, per pasted file: `${fileIndex}:${name}`. A browser file and a Node script can
   *  both call their client `flagsmith`, so a name's runtime in one file must not leak into another. */
  private fileRuntime = new Map<string, Runtime>();
  /** The same across files, for names imported from another pasted file. 'mixed' when files disagree. */
  private nameRuntime = new Map<string, Runtime | 'mixed'>();
  /** Index of the pasted file being read (both passes go file by file). */
  private fileIndex = 0;
  private objectVariables = new Map<string, t.Node>();
  private importedFlagsmith = false;
  private importedNodeSdk = false;
  private calls: CallFact[] = [];
  private configs: ConfigFact[] = [];
  private flagReads: FlagReadFact[] = [];
  /** Top-level `const NAME = 'text'` in any pasted file. null = declared more than once with different text. */
  private constStrings = new Map<string, t.Node | null>();
  private looksLikeServer = false;
  private programs: { program: t.Program; isModule: boolean }[] = [];

  collectProgram(program: t.Program) {
    const isModule = program.body.some(
      (statement) =>
        statement.type === 'ImportDeclaration' ||
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration',
    );
    this.fileIndex = this.programs.length;
    this.programs.push({ program, isModule });
    this.findStringConstants(program);
    this.findBindings(program);
  }

  // ---- pass 1: bindings -------------------------------------------------------------------------

  /**
   * Teams often keep flag and event names in constants: `const FLAG = 'checkout_button'`. Only top-level
   * `const` declarations count (they can't be reassigned or differ per call). A name declared twice with
   * different text is ambiguous and is not resolved.
   */
  private findStringConstants(program: t.Program) {
    for (const statement of program.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== 'Identifier' || !declarator.init) continue;
        let init: t.Node = declarator.init;
        if (init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression') init = init.expression;
        const text = stringValue(init);
        if (text === undefined) continue;
        const name = declarator.id.name;
        const known = this.constStrings.get(name);
        if (known === undefined) this.constStrings.set(name, init);
        else if (known !== null && stringValue(known) !== text) this.constStrings.set(name, null);
      }
    }
  }

  /** The string literal behind an argument: the literal itself, or a top-level constant's value. */
  private stringNode(node: t.Node | undefined | null): t.Node | undefined {
    if (!node) return undefined;
    if (stringValue(node) !== undefined) return node;
    if (node.type === 'Identifier') return this.constStrings.get(node.name) ?? undefined;
    return undefined;
  }

  private resolvedString(node: t.Node | undefined | null): string | undefined {
    return stringValue(this.stringNode(node));
  }

  finish(): CodeFacts {
    this.programs.forEach(({ program, isModule }, index) => {
      this.fileIndex = index;
      this.walk(program, { scopeId: -1, isAsync: isModule });
    });
    const usesFlagsmith =
      this.importedFlagsmith || this.configs.length > 0 || this.calls.some((call) => call.onFlagsmith);
    return {
      calls: this.calls,
      configs: this.configs,
      flagReads: this.flagReads,
      usesFlagsmith,
      looksLikeServer: this.looksLikeServer,
    };
  }

  private findBindings(root: t.Node) {
    this.visitAll(root, (node) => {
      if (node.type === 'ImportDeclaration' && FLAGSMITH_PACKAGE.test(node.source.value)) {
        this.importedFlagsmith = true;
        const isNodeSdk = /nodejs/.test(node.source.value);
        if (isNodeSdk) this.importedNodeSdk = true;
        for (const specifier of node.specifiers) {
          this.flagsmithNames.add(specifier.local.name);
          this.sdkImports.add(specifier.local.name);
          // The browser SDK (also `/isomorphic`, used in scripts) has the browser API: init, identify, no identity per call.
          this.setRuntime(specifier.local.name, isNodeSdk ? 'node' : 'browser');
        }
      }
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
        const name = node.id.name;
        const init = unwrapAwait(node.init);
        if (init.type === 'ObjectExpression' && !this.objectVariables.has(name)) this.objectVariables.set(name, init);
        // The SDK loaded with a <script> tag lives on `window.flagsmith`; teams often give it a short name.
        if (isGlobalFlagsmith(init)) {
          this.flagsmithNames.add(name);
          this.setRuntime(name, 'browser');
        }
        if (init.type === 'NewExpression' && this.isSdkClass(init.callee)) {
          this.flagsmithNames.add(name);
          this.setRuntime(name, 'node');
        }
        if (init.type === 'CallExpression') {
          const callee = lastName(init.callee) ?? '';
          if (callee === 'useFlagsmith' || callee === 'createFlagsmithInstance') {
            this.flagsmithNames.add(name);
            this.setRuntime(name, 'browser');
          }
          if (callee === 'require' && FLAGSMITH_PACKAGE.test(stringValue(init.arguments[0]) ?? '')) {
            this.importedFlagsmith = true;
            this.flagsmithNames.add(name);
            if (/nodejs/.test(stringValue(init.arguments[0]) ?? '')) {
              this.importedNodeSdk = true;
              this.setRuntime(name, 'node');
            }
          }
        }
      }
      if (node.type === 'CallExpression' && lastName(node.callee) === 'listen') this.looksLikeServer = true;
      // Only a Flagsmith client has these methods, so whatever they are called on is one (`client.getExperimentFlag()`).
      if (
        (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') &&
        (node.callee.type === 'MemberExpression' || node.callee.type === 'OptionalMemberExpression') &&
        node.callee.object.type === 'Identifier' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        FLAGSMITH_ONLY_METHODS.has(node.callee.property.name)
      ) {
        this.flagsmithNames.add(node.callee.object.name);
      }
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        /^(GET|POST|PUT|PATCH|DELETE|handler)$/.test(node.declaration.id?.name ?? '')
      ) {
        this.looksLikeServer = true;
      }
    });
  }

  /** A receiver counts as Flagsmith when bound to Flagsmith, or simply named like it (snippets often skip imports). */
  private isFlagsmithReceiver(name: string | undefined): boolean {
    if (!name) return false;
    return this.flagsmithNames.has(name) || /flagsmith/i.test(name);
  }

  private setRuntime(name: string, runtime: Runtime) {
    this.fileRuntime.set(`${this.fileIndex}:${name}`, runtime);
    const known = this.nameRuntime.get(name);
    this.nameRuntime.set(name, known === undefined || known === runtime ? runtime : 'mixed');
  }

  /** The runtime of a client name in the current file, else from the other files when they all agree. */
  private runtimeOf(receiver: string | undefined): Runtime | undefined {
    if (!receiver) return undefined;
    const inFile = this.fileRuntime.get(`${this.fileIndex}:${receiver}`);
    if (inFile) return inFile;
    const elsewhere = this.nameRuntime.get(receiver);
    return elsewhere === 'mixed' ? undefined : elsewhere;
  }

  // ---- pass 2: calls, configs and flag reads -----------------------------------------------------

  private walk(node: t.Node, state: WalkState) {
    let inner = state;
    if (FUNCTION_TYPES.has(node.type)) {
      inner = { scopeId: node.start ?? 0, isAsync: Boolean((node as t.Function).async), statement: undefined };
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') this.recordCall(node, inner);
    if (node.type === 'NewExpression') this.recordNew(node, inner);
    if (node.type === 'JSXOpeningElement') this.recordProvider(node, inner);
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') this.recordGetAllFlagsRead(node);

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key.endsWith('Comments') || key === 'extra') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        const isStatementList =
          (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') && key === 'body';
        const isCaseList = node.type === 'SwitchCase' && key === 'consequent';
        for (const child of value) {
          if (!isNode(child)) continue;
          if (isStatementList || isCaseList) {
            const statement: StatementInfo = {
              ...posOf(child),
              endLine: child.loc?.end.line ?? 1,
              scopeId: inner.scopeId,
            };
            this.walk(child, { ...inner, statement });
          } else {
            this.walk(child, inner);
          }
        }
      } else if (isNode(value)) {
        this.walk(value, inner);
      }
    }
  }

  private recordCall(node: t.CallExpression | t.OptionalCallExpression, state: WalkState) {
    const callee = node.callee;
    let name: string | undefined;
    let receiver: string | undefined;
    if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
      if (callee.computed || callee.property.type !== 'Identifier') return;
      name = callee.property.name;
      receiver = lastName(callee.object);
    } else if (callee.type === 'Identifier') {
      name = callee.name;
    } else {
      return;
    }

    const onFlagsmith =
      receiver !== undefined
        ? this.isFlagsmithReceiver(receiver)
        : name === 'useExperiment' || name === 'useFlags'
          ? this.importedFlagsmith || this.flagsmithNames.has(name)
          : false;

    // Flag reads that do not record an exposure.
    const firstArg = node.arguments[0] as t.Node | undefined;
    const flagNode = this.stringNode(firstArg);
    const flagArg = stringValue(flagNode);
    const flagConstant = firstArg?.type === 'Identifier' && flagArg !== undefined ? firstArg.name : undefined;
    if (onFlagsmith && flagArg && (name === 'getValue' || name === 'hasFeature')) {
      this.flagReads.push({ ...posOf(node), flag: flagArg, flagConstant, via: name, runtime: this.runtimeOf(receiver) });
    }
    if (flagArg && (name === 'getFeatureValue' || name === 'isFeatureEnabled' || name === 'getFlag') && (this.importedNodeSdk || this.importedFlagsmith || receiver === 'flags')) {
      this.flagReads.push({ ...posOf(node), flag: flagArg, flagConstant, via: name, runtime: 'node' });
    }
    if (onFlagsmith && name === 'useFlags' && node.arguments[0]?.type === 'ArrayExpression') {
      for (const element of node.arguments[0].elements) {
        const flag = this.resolvedString(element);
        const flagConstant = element?.type === 'Identifier' && flag !== undefined ? element.name : undefined;
        if (flag && element) this.flagReads.push({ ...posOf(element), flag, flagConstant, via: 'useFlags', runtime: 'browser' });
      }
    }

    // SDK configs from `<client>.init({...})`.
    if (name === 'init' && onFlagsmith) {
      this.addConfig(node.arguments[0] as t.Node | undefined, node, 'browser', state, receiver);
      if (receiver) this.setRuntime(receiver, 'browser');
    }

    const isInteresting = onFlagsmith || EVENT_METHODS.has(name) || name === 'useExperiment' || name === 'identify' || name === 'close';
    if (!isInteresting) return;

    this.calls.push({
      ...posOf(node),
      name,
      receiver,
      onFlagsmith,
      args: node.arguments as t.Node[],
      firstString: flagArg,
      firstStringNode: flagNode,
      scopeId: state.scopeId,
      file: this.fileIndex,
      statement: state.statement,
      canAwait: state.isAsync,
      runtime: this.runtimeOf(receiver) ?? (name === 'useExperiment' ? 'browser' : undefined),
    });
  }

  /**
   * `new X()` creates a Flagsmith SDK client when X is called `Flagsmith` (snippets often skip the import) or was
   * imported from a Flagsmith package. A team's own class such as `FlagsmithClient` (an Admin API wrapper) is not.
   */
  private isSdkClass(callee: t.Node): boolean {
    const name = lastName(callee) ?? '';
    return name === 'Flagsmith' || this.sdkImports.has(name);
  }

  private recordNew(node: t.NewExpression, state: WalkState) {
    if (!this.isSdkClass(node.callee)) return;
    this.addConfig(node.arguments[0] as t.Node | undefined, node, 'node', state, undefined);
  }

  /** `<FlagsmithProvider options={{ ... }}>` from @flagsmith/flagsmith/react. */
  private recordProvider(node: t.JSXOpeningElement, state: WalkState) {
    if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'FlagsmithProvider') return;
    for (const attribute of node.attributes) {
      if (attribute.type !== 'JSXAttribute' || attribute.name.name !== 'options') continue;
      const value = attribute.value;
      if (value?.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
        this.addConfig(value.expression, node, 'browser', state, undefined);
      }
    }
  }

  /** `flagsmith.getAllFlags().my_flag` or `flagsmith.getAllFlags()['my_flag']`. */
  private recordGetAllFlagsRead(node: t.MemberExpression | t.OptionalMemberExpression) {
    const object = node.object;
    if (object.type !== 'CallExpression' && object.type !== 'OptionalCallExpression') return;
    const callee = object.callee;
    if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || callee.property.name !== 'getAllFlags') return;
    if (!this.isFlagsmithReceiver(lastName(callee.object))) return;
    const flag = node.computed ? stringValue(node.property) : node.property.type === 'Identifier' ? node.property.name : undefined;
    if (flag) this.flagReads.push({ ...posOf(node), flag, via: 'getAllFlags', runtime: 'browser' });
  }

  private addConfig(arg: t.Node | undefined, at: t.Node, runtime: Runtime, state: WalkState, receiver: string | undefined) {
    let target = arg;
    if (target?.type === 'Identifier') target = this.objectVariables.get(target.name);
    if (target?.type === 'TSAsExpression' || target?.type === 'TSSatisfiesExpression') target = target.expression;

    const props = new Map<string, PropFact>();
    let readable = target?.type === 'ObjectExpression';
    if (target?.type === 'ObjectExpression') {
      for (const prop of target.properties) {
        if (prop.type === 'SpreadElement') {
          readable = false;
          continue;
        }
        const key = propertyKeyName(prop);
        if (!key) {
          readable = false;
          continue;
        }
        const value = prop.type === 'ObjectProperty' ? (prop.value as t.Node) : prop;
        props.set(key, {
          ...posOf(prop),
          value,
          bool: value.type === 'BooleanLiteral' ? value.value : undefined,
          str: stringValue(value),
        });
      }
    }

    this.configs.push({
      ...posOf(at),
      runtime,
      readable,
      object: target?.type === 'ObjectExpression' ? target : undefined,
      props,
      statement: state.statement,
      receiver,
    });
  }

  private visitAll(node: t.Node, visit: (node: t.Node) => void) {
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key.endsWith('Comments') || key === 'extra') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) this.visitAll(child, visit);
      } else if (isNode(value)) {
        this.visitAll(value, visit);
      }
    }
  }
}

function unwrapAwait(node: t.Node): t.Node {
  if (node.type === 'AwaitExpression') return node.argument;
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') return node.expression;
  return node;
}

/** Reads a property from an options object literal argument, e.g. `{ identifier: userId }`. */
export function objectProp(node: t.Node | undefined, key: string): t.Node | undefined {
  if (!node || node.type !== 'ObjectExpression') return undefined;
  for (const prop of node.properties) {
    if (prop.type === 'ObjectProperty' && propertyKeyName(prop) === key) return prop.value as t.Node;
  }
  return undefined;
}

export function hasSpread(node: t.Node | undefined): boolean {
  return node?.type === 'ObjectExpression' && node.properties.some((prop) => prop.type === 'SpreadElement');
}
