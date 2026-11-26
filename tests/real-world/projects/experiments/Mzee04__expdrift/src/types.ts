export type Severity = "error" | "warning";
export type Confidence = "certain" | "likely";
export type RuleId =
  | "ED001"
  | "ED002"
  | "ED003"
  | "ED004"
  | "ED005"
  | "ED006"
  | "ED007"
  | "ED008"
  | "ED009";

export interface Variation {
  id: number;
  key: string | null;
  value: string | number | boolean | null;
}

export interface MetricRef {
  id: number;
  name: string;
  /** Exact, case-sensitive event name from the metric definition, or null when the definition shape is unknown. */
  event: string | null;
  definitionUnknown: boolean;
}

export interface RunningExperiment {
  id: number;
  name: string;
  status: string;
  hypothesis?: string | null;
  startedAt?: string | null;
  flag: {
    id: number;
    name: string;
    controlValue: string | number | boolean | null;
    variations: Variation[];
  };
  metrics: MetricRef[];
  exposures?: number | null;
  dashboardUrl?: string | null;
}

export interface ExperimentSnapshot {
  fetchedAt: string;
  source: string;
  experiments: RunningExperiment[];
  warnings: string[];
  /** Reasons the snapshot is not complete (variations or metric definitions that could not be read). Empty = complete. */
  incomplete?: string[];
}

export type CallKind = "exposure" | "track" | "identify" | "compare";
export type Sdk = "node" | "browser" | "react" | "python" | "wrapper";

export interface CallSite {
  kind: CallKind;
  /** The SDK method name as written, e.g. getExperimentFlag, trackEvent, useExperiment. */
  method: string;
  sdk: Sdk;
  /** Resolved string literal (flag name for exposures, event name for track, compared value for compare). */
  name: string | null;
  /** Source text of the name expression when it could not be resolved. */
  nameExpr?: string;
  dynamic: boolean;
  /** Identifier expression (after resolving simple aliases) used for identity. */
  identifier?: string | null;
  identifierResolved?: boolean;
  /** True when the call passes an identifier (Node trackEvent opts.identifier, getExperimentFlag 2nd arg). */
  hasIdentifier?: boolean;
  /** For compare call sites: the flag the compared variable came from. */
  flag?: string | null;
  /** For compare call sites: value | variant. */
  property?: string;
  /** For compare call sites: the JS/Python type of the compared literal. */
  literalType?: "string" | "number" | "boolean";
  /** For compare call sites: true for === / !== (and Python ==), false for loose == / !=. */
  strict?: boolean;
  file: string;
  line: number;
  column: number;
  /** The literal span for safe replacement suggestions (1-based line, 0-based columns within that line). */
  literal?: { line: number; startCol: number; endCol: number; quote: string } | undefined;
  lineText: string;
  /** For browser track calls: whether identify() appears earlier in the same module. */
  identifiedBefore?: boolean;
}

export interface ScanResult {
  files: string[];
  calls: CallSite[];
}

export interface Finding {
  rule: RuleId;
  severity: Severity;
  confidence: Confidence;
  experiment: { id: number; name: string; flag: string } | null;
  file: string | null;
  line: number | null;
  message: string;
  why: string;
  suggestion?: Suggestion | undefined;
  /** Source line the finding points at (used to tell new occurrences from legacy ones). */
  lineText?: string | undefined;
  /** Stable key used to diff base vs head; excludes line numbers. */
  key: string;
}

export interface Suggestion {
  file: string;
  line: number;
  original: string;
  replacement: string;
}

/**
 * - clean: every running experiment was read in full and the PR introduces no drift.
 * - drift: the PR introduces at least one finding.
 * - incomplete: no drift found, but some Flagsmith data could not be read (variations, metric definitions, request cap).
 * - unavailable: Flagsmith was down (network, timeout, 5xx). Misconfiguration (401/403/404) is an error, never this.
 */
export type AnalysisStatus = "clean" | "drift" | "incomplete" | "unavailable";

export interface Report {
  status: AnalysisStatus;
  findings: Finding[];
  unverifiable: CallSite[];
  experiments: RunningExperiment[];
  warnings: string[];
  /** Why the result is incomplete (empty when complete). */
  incompleteReasons: string[];
  /** Findings hidden by `ignore:` entries in the BASE branch's .expdrift.yml. */
  suppressed: { count: number; rules: string[] };
  checkedAt: string;
  /** Kept for compatibility: true when status is "unavailable". */
  apiError: boolean;
}
