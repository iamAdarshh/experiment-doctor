// Shared types for the doctor engine. The UI (components/) is built against Issue and DoctorResult,
// so change these only with both teammates agreeing. Spec: docs/06-doctor-rules-spec.md.

/** What the user pastes. Only `code` is required; checks that need a missing box report "not checked". */
export type DoctorInput = {
  /** Pasted source. Several files can be pasted at once: start each with a line `// @file path/name.ts`. */
  code: string;
  /** package.json, requirements.txt, pyproject.toml, go.mod, pom.xml or build.gradle. */
  dependencies?: string;
  /** Metric names exactly as created in Flagsmith (case-sensitive). One per entry. */
  metricNames?: string[];
  /** Output of `flagsmith feature get <flag> --json`. */
  flagJson?: string;
};

/** The same input after normalization (LF line endings, no BOM, no trailing spaces, trimmed metric names). */
export type NormalizedInput = {
  code: string;
  dependencies: string | null;
  metricNames: string[] | null;
  flagJson: string | null;
};

/** Rule ids, in the fixed order issues are sorted by. Append new rules at the end; never reorder. */
export const RULE_ORDER = [
  'events-disabled',
  'event-metric-mismatch',
  'variation-key',
  'no-flush',
  'sdk-too-old',
  'no-exposure',
  'no-identity',
  'identity-mismatch',
  'conversion-before-exposure',
  'selfhosted-events-url',
  'analytics-vs-events',
] as const;

export type RuleId = (typeof RULE_ORDER)[number];

/** 'certain' = exact match on documented behaviour; 'possible' = heuristic. Only 'certain' blocks a clean result. */
export type Confidence = 'certain' | 'possible';

/** Which input box an issue (and its patch) refers to. */
export type InputBox = 'code' | 'dependencies' | 'metricNames' | 'flagJson';

/**
 * A fix. Text patches replace the first occurrence of `before` with `after` in the box named by
 * `Issue.source`. Command patches are shell commands (for Flagsmith config that lives outside the code).
 * Patches are always fixed templates filled with parsed values, never generated text.
 */
export type Patch = { before: string; after: string } | { command: string };

export type Issue = {
  ruleId: RuleId;
  confidence: Confidence;
  source: InputBox;
  /** 1-based line in the box named by `source`, when the issue points at a place. */
  line?: number;
  /** 1-based column. */
  column?: number;
  /** One plain sentence. */
  message: string;
  /** The Flagsmith docs page that describes the problem. */
  docsUrl: string;
  patch?: Patch;
};

export type NotChecked = { ruleId: RuleId; reason: string };

export type ParseError = { source: InputBox; line: number; message: string };

export type DoctorResult = {
  engineVersion: string;
  /** Sorted by RULE_ORDER, then line, column, message. */
  issues: Issue[];
  /** Checks that could not run. A clean result with entries here is not a full all-clear. */
  notChecked: NotChecked[];
  parseErrors: ParseError[];
};
