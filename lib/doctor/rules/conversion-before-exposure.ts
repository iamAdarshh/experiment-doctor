// Rule 9. Conversions only count after the identity's first exposure. If, inside one function,
// trackEvent runs before the experiment flag is read, that conversion can come too early.
// We compare source order within the same function only, so it's a heuristic ("possible").

import { exposureCalls, flagsmithCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import type { Rule } from '../rule';
import type { Issue } from '../types';

export const rule: Rule = {
  id: 'conversion-before-exposure',
  needs: ['code'],
  check({ code }) {
    const exposures = exposureCalls(code);
    const issues: Issue[] = [];
    for (const conversion of flagsmithCalls(code, 'trackEvent')) {
      // Same function in the same pasted file: the top level of two files (scopeId -1 in both) is not one scope.
      const sameScope = exposures.filter((exposure) => exposure.file === conversion.file && exposure.scopeId === conversion.scopeId);
      const laterExposure = sameScope.find((exposure) => exposure.start > conversion.start);
      const earlierExposure = sameScope.find((exposure) => exposure.start < conversion.start);
      if (!laterExposure || earlierExposure) continue;
      issues.push({
        ruleId: 'conversion-before-exposure',
        confidence: 'possible',
        source: 'code',
        line: conversion.line,
        column: conversion.column,
        message: `trackEvent runs before the experiment flag is read on line ${laterExposure.line}; conversions before the first exposure aren't counted.`,
        docsUrl: DOCS.runExperiment,
      });
    }
    return issues;
  },
};
