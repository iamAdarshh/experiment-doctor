// Rule 1. Experiment calls need `enableEvents: true` in the SDK options. Without it, getExperimentFlag
// degrades to a plain flag read and trackEvent / trackExposureEvent do nothing (JS SDK types:
// "No-op when events are disabled"). Nothing throws, so events just never arrive.

import { classifyConfig, enableEventsPatch, experimentCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import type { Rule } from '../rule';
import type { Issue } from '../types';

export const rule: Rule = {
  id: 'events-disabled',
  needs: ['code'],
  check({ input, code }) {
    if (experimentCalls(code).length === 0) return [];
    if (code.configs.length === 0) {
      return { notChecked: 'The code uses experiment events, but no Flagsmith init or options were found. Paste the file that creates the client.' };
    }
    const issues: Issue[] = [];
    let readableConfigs = 0;
    for (const config of code.configs) {
      const state = classifyConfig(config, true);
      if (state !== 'unknown') readableConfigs += 1;
      if (state !== 'missing-events' && state !== 'events-false') continue;
      issues.push({
        ruleId: 'events-disabled',
        confidence: 'certain',
        source: 'code',
        line: config.line,
        column: config.column,
        message:
          state === 'events-false'
            ? 'enableEvents is set to false, so exposures and conversions are never sent. Set it to true.'
            : 'The Flagsmith options lack enableEvents: true, so exposures and conversions are silently dropped.',
        docsUrl: DOCS.runExperiment,
        patch: enableEventsPatch(input.code, config),
      });
    }
    if (readableConfigs === 0) {
      return { notChecked: 'The Flagsmith options are built from a variable or a spread we could not read.' };
    }
    return issues;
  },
};
