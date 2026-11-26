import type { RuleId, Severity } from "../types.ts";

export interface RuleInfo {
  id: RuleId;
  title: string;
  severity: Severity;
  why: string;
  explain: string;
  example: string;
}

const EVENT_RULE =
  "The event name is case-sensitive and must exactly match the metric's configured event name. Unmatched events are silently ignored.";
const IDENTITY_RULE =
  "Users must be identified. Exposures and conversion events are joined per identity, so use the same identifier for flags and events.";
const LABEL_RULE =
  "Every variation of the flag has a label. Exposures are attributed by label, so a variation without one is not counted.";

export const RULES: Record<RuleId, RuleInfo> = {
  ED001: {
    id: "ED001",
    title: "Conversion event removed or renamed",
    severity: "error",
    why: EVENT_RULE,
    explain:
      "A running experiment's metric event is sent somewhere in the base branch but nowhere in this PR. If the PR sends a near match (case, _ / - / camelCase, or a small typo), ExpDrift names it and suggests restoring the exact metric event name.",
    example: "trackEvent('checkout_completed') -> trackEvent('checkoutCompleted')",
  },
  ED002: {
    id: "ED002",
    title: "Metric event never sent",
    severity: "warning",
    why: EVENT_RULE,
    explain:
      "A running experiment's metric event is sent from no call site in this PR's code, and the PR touches files that call trackEvent. Typical cause: a new tracking call with a typo.",
    example: "metric event 'signup_done', code sends trackEvent('signup_dne')",
  },
  ED003: {
    id: "ED003",
    title: "Exposure removed",
    severity: "error",
    why: "Only getExperimentFlag / useExperiment / trackExposureEvent record exposures. getIdentityFlags or getAllFlags alone record nothing, so the experiment stops collecting data.",
    explain:
      "A running experiment's flag lost every exposure call (getExperimentFlag, useExperiment, trackExposureEvent, get_experiment_flag) between the base branch and this PR.",
    example: "getExperimentFlag('checkout_button', id) -> getIdentityFlags(id).getFeatureValue('checkout_button')",
  },
  ED004: {
    id: "ED004",
    title: "Flag key drift",
    severity: "error",
    why: "An exposure for a flag name that is not in a running experiment records nothing for that experiment.",
    explain:
      "The PR calls getExperimentFlag (or useExperiment) with a name that matches no running experiment's flag but is a near match to one, for example after renaming a constant.",
    example: "getExperimentFlag('checkout-button') while the experiment flag is 'checkout_button'",
  },
  ED005: {
    id: "ED005",
    title: "Identity mismatch between exposure and conversion",
    severity: "error",
    why: IDENTITY_RULE,
    explain:
      "For a running experiment, the identifier used at the exposure call and at its metric's conversion calls differ in this PR but matched in the base branch. Reported as certain when both identifiers are resolved, otherwise as likely.",
    example: "getExperimentFlag('checkout_button', user.id) + trackEvent('checkout_completed', { identifier: user.email })",
  },
  ED006: {
    id: "ED006",
    title: "Missing identifier on a conversion",
    severity: "error",
    why: "Exposures without an identity are skipped. The SDKs skip events silently rather than throw.",
    explain:
      "The PR adds a server-side trackEvent for a metric event without `identifier`, or a browser module that tracks the event before calling identify().",
    example: "flagsmith.trackEvent('checkout_completed') on the server, with no { identifier }",
  },
  ED007: {
    id: "ED007",
    title: "Unknown variation value",
    severity: "error",
    why: `${LABEL_RULE} Control's key is the reserved value \`control\`.`,
    explain:
      "Code compares an experiment flag's value or variant to a string that matches neither `control`, the control value, nor any variation key or value. That branch never runs for real users.",
    example: "if (flag.variant === 'buynow') while the variation key is 'buy_now'",
  },
  ED008: {
    id: "ED008",
    title: "Variation without a key (Flagsmith config)",
    severity: "warning",
    why: LABEL_RULE,
    explain:
      "A running experiment's flag has a variation with no key, so it records no exposures. ExpDrift never changes Flagsmith. A human has to fix this in the Flagsmith dashboard; variations are locked while the experiment runs, so pause or complete it first.",
    example: "multivariate option id 12 has key = null",
  },
  ED009: {
    id: "ED009",
    title: "Reserved event name",
    severity: "error",
    why: "Event names starting with `$` are reserved for Flagsmith. The Node SDK throws on them.",
    explain: "A metric event or a tracked event name starts with `$`.",
    example: "trackEvent('$purchase')",
  },
};
