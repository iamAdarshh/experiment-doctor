// Rule 11. Two common mix-ups:
// - enableAnalytics: true is flag-usage analytics, not experiment events, so it does not turn events on.
// - eventProcessorConfig without enableEvents: init throws (JS SDK types: "passing it without enableEvents throws at init").

import { classifyConfig, enableEventsPatch, experimentCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import type { Rule } from '../rule';
import type { Issue } from '../types';

export const rule: Rule = {
  id: 'analytics-vs-events',
  needs: ['code'],
  check({ input, code }) {
    if (code.configs.length === 0) {
      return { notChecked: 'No Flagsmith init or options were found in the code.' };
    }
    const usesEvents = experimentCalls(code).length > 0;
    const issues: Issue[] = [];
    for (const config of code.configs) {
      const state = classifyConfig(config, usesEvents);
      if (state !== 'analytics-without-events' && state !== 'processor-without-events') continue;
      issues.push({
        ruleId: 'analytics-vs-events',
        confidence: 'certain',
        source: 'code',
        line: config.line,
        column: config.column,
        message:
          state === 'processor-without-events'
            ? 'eventProcessorConfig is set without enableEvents: true, which makes init throw.'
            : 'enableAnalytics only records flag usage; experiment events also need enableEvents: true.',
        docsUrl: DOCS.runExperiment,
        patch: enableEventsPatch(input.code, config),
      });
    }
    return issues;
  },
};
