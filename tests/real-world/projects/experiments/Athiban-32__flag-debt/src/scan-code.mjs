// Walks a source tree and records:
//   - every quoted string literal (so we can tell whether a Flagsmith flag name appears in code)
//   - every flag key passed directly to a Flagsmith / OpenFeature SDK call (so we can spot
//     keys the code asks for that do not exist in Flagsmith)
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.go', '.java', '.kt', '.rb', '.php', '.cs', '.swift', '.dart', '.rs', '.ex', '.exs',
];
export const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'target', '.turbo', '.cache',
];

// SDK methods across Flagsmith's SDKs (JS, React, Node, Python, Go, Java, .NET, Ruby, PHP,
// Flutter) and the OpenFeature client API. The first argument is the flag key.
export const DEFAULT_SDK_METHODS = [
  'hasFeature', 'getValue', 'getFlag', 'getExperimentFlag', 'trackExposureEvent',
  'isFeatureEnabled', 'getFeatureValue', 'getTrait',
  'is_feature_enabled', 'get_feature_value', 'get_flag', 'get_experiment_flag',
  'IsFeatureEnabled', 'GetFeatureValue', 'GetFlag',
  'getBooleanValue', 'getStringValue', 'getNumberValue', 'getObjectValue',
  'getBooleanDetails', 'getStringDetails', 'getNumberDetails', 'getObjectDetails',
  'useFlag', 'useExperiment',
];

const LITERAL = /(['"`])((?:\\.|(?!\1).){1,200}?)\1/g;
const MAX_FILE_BYTES = 1_000_000;

function sdkCallRegex(methods) {
  const names = methods.map((m) => m.replace(/[$]/g, '\\$')).join('|');
  // e.g. flagsmith.hasFeature('new_checkout') / client.get_feature_value("banner")
  return new RegExp(`\\b(?:${names})\\s*(?:<[^>]*>)?\\(\\s*(['"\`])([\\w.:-]+)\\1`, 'g');
}

async function* walk(dir, root, ignore, extensions) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ignore.includes(e.name)) continue;
      yield* walk(full, root, ignore, extensions);
    } else if (e.isFile() && extensions.includes(path.extname(e.name).toLowerCase())) {
      yield full;
    }
  }
}

/**
 * @returns {{ files: number, literals: Map<string, {file:string,line:number}[]>,
 *             sdkKeys: Map<string, {file:string,line:number,method:string}[]> }}
 */
// Calls whose first argument is a constant, e.g. isFeatureEnabled(Feature.NOW_FILE_MANAGEMENT)
// or flagsmith.hasFeature(FLAGS.pricing). Captures the owner and member names.
function constantCallRegex(methods) {
  const names = methods.map((m) => m.replace(/[$]/g, '\\$')).join('|');
  return new RegExp(`\\b(?:${names})\\s*(?:<[^>]*>)?\\(\\s*(?:[A-Za-z_$][\\w$]*\\.)*([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)\\s*[,)]`, 'g');
}
// A flag-name constant: MEMBER = "key" (TS enum, Python Enum/class) or member: "key" (JS object).
const CONST_DEF = /^\s*(?:export\s+)?(?:(?:const|let|var|readonly|public|static)\s+)*([A-Za-z_$][\w$]*)\s*[:=]\s*(['"])([\w.:-]+)\2\s*[,;]?\s*(?:(?:#|\/\/).*)?$/;
// Lines that open a container whose members can be such constants.
const OWNER_OPEN = /\b(?:enum|class|const|let|var|object|interface|type)\s+([A-Za-z_$][\w$]*)/;
const MEMBER_USE = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g;
const langOf = (file) => (/\.py$/.test(file) ? 'py' : /\.(go|java|kt|rb|php|cs|swift|dart|rs|exs?)$/.test(file) ? path.extname(file) : 'js');

export async function scanCode(root, opts = {}) {
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  const extensions = opts.extensions ?? DEFAULT_EXTENSIONS;
  const methods = opts.sdkMethods ?? DEFAULT_SDK_METHODS;
  const callRe = sdkCallRegex(methods);
  const constCallRe = constantCallRegex(methods);
  const extraRes = (opts.extraPatterns ?? []).map((p) => new RegExp(p, 'g'));
  const literals = new Map();
  const sdkKeys = new Map();
  const defs = new Map(); // "lang:Owner.MEMBER" -> { owner, member, value, file, line, lang }
  const memberUses = new Set(); // "lang:Owner.MEMBER" seen anywhere in code
  const constCalls = []; // unresolved constant-argument calls
  const push = (map, key, val) => (map.get(key) ?? map.set(key, []).get(key)).push(val);
  let files = 0;

  for await (const full of walk(root, root, ignore, extensions)) {
    const info = await stat(full);
    if (info.size > MAX_FILE_BYTES) continue;
    const text = await readFile(full, 'utf8');
    const file = path.relative(root, full).split(path.sep).join('/');
    const lang = langOf(file);
    files++;
    const lines = text.split(/\r?\n/);
    let owner = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const loc = { file, line: i + 1 };
      const opened = line.match(OWNER_OPEN);
      if (opened) owner = opened[1];
      else if (/^\S/.test(line) && !/^[})\]]/.test(line) && lang === 'py') owner = null; // dedent ends a Python class
      if (line.includes('.')) {
        for (const m of line.matchAll(MEMBER_USE)) memberUses.add(`${lang}:${m[1]}.${m[2]}`);
        for (const m of line.matchAll(constCallRe)) {
          const method = m[0].slice(0, m[0].indexOf('(')).replace(/<.*$/, '').trim();
          constCalls.push({ ...loc, lang, owner: m[1], member: m[2], method });
        }
      }
      if (!/['"`]/.test(line)) continue;
      const def = owner && line.match(CONST_DEF);
      if (def) defs.set(`${lang}:${owner}.${def[1]}`, { owner, member: def[1], value: def[3], lang, ...loc });
      for (const m of line.matchAll(LITERAL)) push(literals, m[2], loc);
      for (const m of line.matchAll(callRe)) {
        const method = m[0].slice(0, m[0].indexOf('(')).replace(/<.*$/, '').trim();
        push(sdkKeys, m[2], { ...loc, method });
      }
      for (const re of extraRes) {
        for (const m of line.matchAll(re)) {
          const key = m.groups?.key ?? m[1];
          if (key) push(sdkKeys, key, { ...loc, method: 'pattern' });
        }
      }
    }
  }

  // Resolve Owner.MEMBER arguments to the flag key they hold.
  const flagOwners = new Set();
  let resolvedCalls = 0;
  for (const c of constCalls) {
    const d = defs.get(`${c.lang}:${c.owner}.${c.member}`);
    if (!d) continue;
    resolvedCalls++;
    flagOwners.add(`${c.lang}:${c.owner}`);
    push(sdkKeys, d.value, { file: c.file, line: c.line, method: c.method, via: `${c.owner}.${c.member}` });
  }

  // Members of a flag-name enum/object that nothing in the code reads.
  const unreadConstants = [...defs.entries()]
    .filter(([id, d]) => flagOwners.has(`${d.lang}:${d.owner}`) && !memberUses.has(id))
    .map(([, d]) => ({ constant: `${d.owner}.${d.member}`, key: d.value, file: d.file, line: d.line }));

  return { files, literals, sdkKeys, unreadConstants, resolvedCalls };
}
