// All rules, keyed by id. The engine runs them in RULE_ORDER (types.ts), not in the order listed here.
import type { Rule } from '../rule';
import type { RuleId } from '../types';
import { rule as analyticsVsEvents } from './analytics-vs-events';
import { rule as conversionBeforeExposure } from './conversion-before-exposure';
import { rule as eventMetricMismatch } from './event-metric-mismatch';
import { rule as eventsDisabled } from './events-disabled';
import { rule as identityMismatch } from './identity-mismatch';
import { rule as noExposure } from './no-exposure';
import { rule as noFlush } from './no-flush';
import { rule as noIdentity } from './no-identity';
import { rule as sdkTooOld } from './sdk-too-old';
import { rule as selfhostedEventsUrl } from './selfhosted-events-url';
import { rule as variationKey } from './variation-key';

export const RULES: Record<RuleId, Rule> = {
  'events-disabled': eventsDisabled,
  'event-metric-mismatch': eventMetricMismatch,
  'variation-key': variationKey,
  'no-flush': noFlush,
  'sdk-too-old': sdkTooOld,
  'no-exposure': noExposure,
  'no-identity': noIdentity,
  'identity-mismatch': identityMismatch,
  'conversion-before-exposure': conversionBeforeExposure,
  'selfhosted-events-url': selfhostedEventsUrl,
  'analytics-vs-events': analyticsVsEvents,
};
