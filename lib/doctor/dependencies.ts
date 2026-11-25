// Reads Flagsmith SDK versions out of a pasted dependency file with plain regular expressions.
// Supported: package.json, requirements.txt / pyproject.toml, go.mod, pom.xml, build.gradle(.kts).

export type Ecosystem = 'npm' | 'python' | 'go' | 'maven';

export type DependencyEntry = {
  ecosystem: Ecosystem;
  /** Package name as written, e.g. `@flagsmith/flagsmith`. */
  name: string;
  /** The version text as written, e.g. `^12.3.0`, `==6.2.0`, `v5.2.0`. */
  spec: string;
  /** Offsets of `spec` in the dependency box, so a patch can replace exactly that text. */
  specStart: number;
  specEnd: number;
  line: number;
};

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function collect(text: string, pattern: RegExp, ecosystem: Ecosystem, entries: DependencyEntry[], nameOf?: (match: RegExpExecArray) => string) {
  for (const match of text.matchAll(pattern)) {
    const groups = match.groups ?? {};
    const spec = groups.spec;
    if (spec === undefined || match.index === undefined) continue;
    const specStart = match.index + match[0].lastIndexOf(spec);
    entries.push({
      ecosystem,
      name: nameOf ? nameOf(match as RegExpExecArray) : (groups.name ?? ''),
      spec,
      specStart,
      specEnd: specStart + spec.length,
      line: lineAt(text, specStart),
    });
  }
}

export function readDependencies(text: string): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  // package.json: "@flagsmith/flagsmith": "^12.3.0" (also the old "flagsmith" and "flagsmith-nodejs" packages)
  collect(text, /"(?<name>@flagsmith\/flagsmith|@flagsmith\/nodejs|flagsmith-nodejs|flagsmith)"\s*:\s*"(?<spec>[^"]*)"/g, 'npm', entries);
  // requirements.txt: flagsmith==6.2.0 / flagsmith>=5.0 ; pyproject: flagsmith = "^6.2.0" or "flagsmith>=6.2"
  collect(text, /^(?<name>flagsmith)\s*(?<spec>(?:==|>=|~=|<=|<|>)\s*[\d.]+)/gm, 'python', entries);
  collect(text, /^(?<name>flagsmith)\s*=\s*"(?<spec>[^"]*)"/gm, 'python', entries);
  collect(text, /"(?<name>flagsmith)(?<spec>(?:==|>=|~=|<=|<|>)\s*[\d.]+)[^"]*"/g, 'python', entries);
  // go.mod: github.com/Flagsmith/flagsmith-go-client/v5 v5.2.0
  collect(text, /(?<name>github\.com\/Flagsmith\/flagsmith-go-client(?:\/v\d+)?)\s+(?<spec>v[\d.]+[^\s]*)/g, 'go', entries);
  // pom.xml: <artifactId>flagsmith-java-client</artifactId> <version>8.1.0</version>
  collect(text, /<artifactId>(?<name>flagsmith-java-client)<\/artifactId>\s*<version>(?<spec>[^<]+)<\/version>/g, 'maven', entries);
  // build.gradle: com.flagsmith:flagsmith-java-client:8.1.0
  collect(text, /com\.flagsmith:(?<name>flagsmith-java-client):(?<spec>[\w.\-]+)/g, 'maven', entries);
  return entries.sort((a, b) => a.specStart - b.specStart);
}

/** [major, minor, patch] from the first x.y.z (or x.y, or x) in the text; undefined if there is none. */
export function parseVersion(text: string): [number, number, number] | undefined {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

export type VersionVerdict = 'ok' | 'too-old' | 'may-be-too-old' | 'unknown';

/**
 * Compares a version spec with the minimum. An exact or capped version below the minimum is 'too-old'.
 * A range that starts below the minimum but allows it (`^12.3.0`, `>=6.0`) is 'may-be-too-old': the lockfile decides.
 */
export function judgeSpec(spec: string, minimum: [number, number, number]): VersionVerdict {
  const trimmed = spec.trim();
  const base = parseVersion(trimmed);
  if (!base || trimmed === '*' || trimmed === 'latest') return 'unknown';
  if (compareVersions(base, minimum) >= 0) return 'ok';
  const operator = /^(\^|~=|~|>=|>|==|=|<=|<|v)?/.exec(trimmed)?.[1] ?? '';
  if (operator === '>=' || operator === '>') return 'may-be-too-old';
  if (operator === '^') {
    // ^12.3.0 allows anything below 13.0.0
    return base[0] === minimum[0] ? 'may-be-too-old' : 'too-old';
  }
  if (operator === '~') {
    // ~12.3.0 allows anything below 12.4.0
    return base[0] === minimum[0] && base[1] === minimum[1] ? 'may-be-too-old' : 'too-old';
  }
  if (operator === '~=') {
    // ~=6.2.0 allows below 6.3.0; ~=6.2 allows below 7.0
    const parts = trimmed.replace('~=', '').trim().split('.').length;
    if (parts <= 2) return base[0] === minimum[0] ? 'may-be-too-old' : 'too-old';
    return base[0] === minimum[0] && base[1] === minimum[1] ? 'may-be-too-old' : 'too-old';
  }
  return 'too-old';
}

/** The spec with its version number swapped for the minimum, keeping the operator (`^12.3.0` -> `^12.4.0`). */
export function bumpSpec(spec: string, minimum: [number, number, number]): string {
  const minimumText = minimum.join('.');
  return spec.replace(/\d+(?:\.\d+){0,2}/, minimumText);
}
