// Rule 7. Events from unidentified users are skipped (docs: "Unidentified users are skipped").
// Browser: call identify() (or pass `identity` in the options) before experiment calls.
// Node: there is no identify(); pass the identity on each call (trackEvent's `identifier` option).

import type * as t from '@babel/types';
import { experimentCalls, flagsmithCalls, runtimeOf } from '../code-helpers';
import { DOCS } from '../docs-links';
import { hasSpread, objectProp } from '../parse';
import type { Rule } from '../rule';
import type { Issue } from '../types';

function passesIdentifier(options: t.Node | undefined): 'yes' | 'no' | 'unknown' {
  if (!options) return 'no';
  if (options.type !== 'ObjectExpression' || hasSpread(options)) return 'unknown';
  return objectProp(options, 'identifier') ? 'yes' : 'no';
}

export const rule: Rule = {
  id: 'no-identity',
  needs: ['code'],
  check({ code }) {
    const calls = experimentCalls(code);
    if (calls.length === 0) return [];
    const issues: Issue[] = [];

    // Server side: each trackEvent needs an identifier.
    for (const call of flagsmithCalls(code, 'trackEvent')) {
      if (runtimeOf(code, call) !== 'node') continue;
      if (passesIdentifier(call.args[1]) !== 'no') continue;
      issues.push({
        ruleId: 'no-identity',
        confidence: 'certain',
        source: 'code',
        line: call.line,
        column: call.column,
        message: 'This server-side trackEvent has no identifier, so the event is skipped. Pass { identifier: <user id> }.',
        docsUrl: DOCS.runExperiment,
      });
    }

    // Browser side: some identify() call, or `identity` in the options, or an identifier on every call.
    const browserCalls = calls.filter((call) => runtimeOf(code, call) === 'browser');
    if (browserCalls.length === 0) return issues;
    const identified =
      flagsmithCalls(code, 'identify').length > 0 ||
      code.configs.some((config) => config.props.has('identity') || config.props.has('evaluationContext') || !config.readable) ||
      browserCalls.every((call) => call.name !== 'getExperimentFlag' && call.name !== 'useExperiment' && passesIdentifier(call.args[1]) === 'yes');
    if (identified) return issues;

    const first = browserCalls[0]!;
    const sawSetup = code.configs.some((config) => config.runtime === 'browser');
    issues.push({
      ruleId: 'no-identity',
      // If we can see the client setup and there is no identity anywhere, we're sure. If the setup isn't in the
      // paste, identify() may be called in another file.
      confidence: sawSetup ? 'certain' : 'possible',
      source: 'code',
      line: first.line,
      column: first.column,
      message: sawSetup
        ? 'No identify() call before experiment calls, so this visitor\'s exposures and events are skipped.'
        : 'No identify() call in the pasted code; if none runs elsewhere before experiment calls, events are skipped.',
      docsUrl: DOCS.runExperiment,
    });
    return issues;
  },
};
