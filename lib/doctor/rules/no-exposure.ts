// Rule 6. An experiment only counts identities that were exposed. Reading the flag with getValue,
// hasFeature, getAllFlags or useFlags records no exposure, so conversions from those users aren't counted.
// It's a heuristic ("possible"): we can't always tell which flag is the experiment flag.

import { exposureCalls, flagsmithCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import { readFlagJson } from '../flag-json';
import { replaceRangePatch } from '../patch';
import type { Rule } from '../rule';
import type { Issue, Patch } from '../types';

export const rule: Rule = {
  id: 'no-exposure',
  needs: ['code'],
  check({ input, code }) {
    // No conversions in the code: it isn't running an experiment here, so plain reads are fine.
    if (flagsmithCalls(code, 'trackEvent').length === 0) return [];
    const exposed = new Set(exposureCalls(code).map((call) => call.firstString).filter(Boolean));

    // If the flag JSON names the experiment flag, only that flag matters. Otherwise, if some flag already
    // records exposures, other plain reads are probably ordinary flags, so stay quiet.
    const flagReading = input.flagJson ? readFlagJson(input.flagJson) : undefined;
    const experimentFlag = flagReading?.ok ? flagReading.flagName : null;
    if (!experimentFlag && exposed.size > 0) return [];

    const issues: Issue[] = [];
    for (const read of code.flagReads) {
      if (experimentFlag && read.flag !== experimentFlag) continue;
      if (exposed.has(read.flag)) continue;
      let patch: Patch | undefined;
      const call = code.calls.find((candidate) => candidate.start === read.start && candidate.receiver);
      if (call && (read.via === 'getValue' || read.via === 'hasFeature')) {
        const field = read.via === 'getValue' ? 'value' : 'enabled';
        patch = replaceRangePatch(input.code, read.start, read.end, `${call.receiver}.getExperimentFlag('${read.flag}')?.${field}`);
      }
      issues.push({
        ruleId: 'no-exposure',
        confidence: 'possible',
        source: 'code',
        line: read.line,
        column: read.column,
        message: `If "${read.flag}" is the experiment flag, reading it with ${read.via} records no exposure, so conversions aren't counted; use ${read.runtime === 'node' ? 'getExperimentFlag(flag, identity)' : read.via === 'useFlags' ? 'useExperiment' : 'getExperimentFlag'}.`,
        docsUrl: DOCS.runExperiment,
        patch,
      });
    }
    return issues;
  },
};
