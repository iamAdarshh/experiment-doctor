// Rule 2. A conversion only counts when its event name matches a metric name exactly, case-sensitive.
// A typo (`Rescan_Clean` vs `rescan_clean`) is skipped without an error.

import { flagsmithCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import { closest } from '../levenshtein';
import { replaceRangePatch } from '../patch';
import type { Rule } from '../rule';
import type { Issue } from '../types';

export const rule: Rule = {
  id: 'event-metric-mismatch',
  needs: ['code', 'metricNames'],
  check({ input, code }) {
    const metricNames = input.metricNames ?? [];
    const issues: Issue[] = [];
    for (const call of flagsmithCalls(code, 'trackEvent')) {
      const eventName = call.firstString;
      // The string itself: the argument, or the value of the constant it names (`const EVENT = 'Purchase'`),
      // so the issue and the patch point at the text that has to change.
      const nameNode = call.firstStringNode;
      // Names we can't read (other variables) are skipped; names starting with `$` are reserved by Flagsmith.
      if (eventName === undefined || !nameNode || eventName.startsWith('$')) continue;
      if (metricNames.includes(eventName)) continue;
      const suggestion = closest(eventName, metricNames);
      const quote = input.code[nameNode.start ?? 0] ?? "'";
      issues.push({
        ruleId: 'event-metric-mismatch',
        confidence: 'certain',
        source: 'code',
        line: nameNode.loc?.start.line,
        column: (nameNode.loc?.start.column ?? 0) + 1,
        message: `The event "${eventName}" matches no metric name (names are case-sensitive)${suggestion ? `; did you mean "${suggestion}"?` : '.'}`,
        docsUrl: DOCS.runExperiment,
        patch: suggestion
          ? replaceRangePatch(input.code, nameNode.start ?? 0, nameNode.end ?? 0, `${quote}${suggestion}${quote}`)
          : undefined,
      });
    }
    return issues;
  },
};
