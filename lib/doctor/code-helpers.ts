// Small questions several rules ask about the parsed code, kept in one place so the rules agree.

import type { CallFact, CodeFacts, ConfigFact, Runtime } from './parse';
import { indentAt, insertLineBeforePatch, replaceRangePatch } from './patch';
import type { Patch } from './types';

/** Calls that only work when events are turned on (`enableEvents: true`). */
const EXPERIMENT_METHODS = new Set(['getExperimentFlag', 'trackEvent', 'trackExposureEvent', 'useExperiment']);

export function experimentCalls(facts: CodeFacts): CallFact[] {
  return facts.calls.filter((call) => call.onFlagsmith && EXPERIMENT_METHODS.has(call.name));
}

export function flagsmithCalls(facts: CodeFacts, name: string): CallFact[] {
  return facts.calls.filter((call) => call.onFlagsmith && call.name === name);
}

/** Calls that record an exposure: `getExperimentFlag`, `useExperiment`, `trackExposureEvent`. */
export function exposureCalls(facts: CodeFacts): CallFact[] {
  return facts.calls.filter(
    (call) => call.onFlagsmith && (call.name === 'getExperimentFlag' || call.name === 'useExperiment' || call.name === 'trackExposureEvent'),
  );
}

/**
 * Which runtime a call belongs to. Known from the client it is called on when possible; otherwise from the
 * configs in the paste; otherwise from the call shape (the Node SDK's getExperimentFlag takes the identity
 * as a second argument). Defaults to browser.
 */
export function runtimeOf(facts: CodeFacts, call: CallFact): Runtime {
  if (call.runtime) return call.runtime;
  const hasNode = facts.configs.some((config) => config.runtime === 'node');
  const hasBrowser = facts.configs.some((config) => config.runtime === 'browser');
  if (hasNode && !hasBrowser) return 'node';
  if (hasBrowser) return 'browser';
  const nodeShaped = facts.calls.some((other) => other.onFlagsmith && other.name === 'getExperimentFlag' && other.args.length >= 2);
  return nodeShaped ? 'node' : 'browser';
}

export type ConfigState =
  | 'ok'
  | 'unknown'
  | 'missing-events'
  | 'events-false'
  | 'analytics-without-events'
  | 'processor-without-events';

/**
 * How a config stands on `enableEvents`. Rule events-disabled reports 'missing-events' and 'events-false';
 * rule analytics-vs-events reports the two mix-ups. Each config gets at most one of the two rules, so their
 * patches never both add `enableEvents`.
 */
export function classifyConfig(config: ConfigFact, usesEvents: boolean): ConfigState {
  const enableEvents = config.props.get('enableEvents');
  if (enableEvents?.bool === true) return 'ok';
  if (!config.readable) return 'unknown';
  if (enableEvents && enableEvents.bool === undefined) return 'unknown'; // a variable: we can't know its value
  // Passing eventProcessorConfig without enableEvents makes init throw (JS SDK types and docs), events used or not.
  if (config.props.has('eventProcessorConfig')) return 'processor-without-events';
  if (!usesEvents) return 'ok';
  if (config.props.get('enableAnalytics')?.bool === true) return 'analytics-without-events';
  return enableEvents?.bool === false ? 'events-false' : 'missing-events';
}

/** A patch that sets `enableEvents: true` in the config: flips `false`, or adds the property. */
export function enableEventsPatch(code: string, config: ConfigFact): Patch | undefined {
  const existing = config.props.get('enableEvents');
  if (existing && existing.bool === false) {
    return replaceRangePatch(code, existing.value.start ?? 0, existing.value.end ?? 0, 'true');
  }
  return addPropertyPatch(code, config, 'enableEvents: true');
}

/**
 * Adds `propertyText` to the config's object literal. On a multi-line object whose first property has its
 * own line, the new property gets its own line above it; otherwise it is added after the last property.
 */
export function addPropertyPatch(code: string, config: ConfigFact, propertyText: string): Patch | undefined {
  const object = config.object;
  if (!object || object.start == null || object.end == null) return undefined;
  const properties = object.properties;
  if (properties.length === 0) {
    return replaceRangePatch(code, object.start, object.end, `{ ${propertyText} }`);
  }
  const first = properties[0]!;
  const last = properties[properties.length - 1]!;
  const objectLine = object.loc?.start.line ?? 0;
  const firstLine = first.loc?.start.line ?? 0;
  if (firstLine > objectLine && first.start != null) {
    return insertLineBeforePatch(code, first.start, `${indentAt(code, first.start)}${propertyText},`);
  }
  if (last.end == null) return undefined;
  return replaceRangePatch(code, last.end, last.end, `, ${propertyText}`);
}
