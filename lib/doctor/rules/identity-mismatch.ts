// Rule 8. Exposure and conversion must use the same identity, or the conversion lands on a user who was
// never exposed and isn't counted. We compare the identity expressions as written; different text may
// still mean the same value, so this is "possible".

import type * as t from '@babel/types';
import { experimentCalls, runtimeOf } from '../code-helpers';
import { DOCS } from '../docs-links';
import { objectProp } from '../parse';
import type { Rule } from '../rule';
import type { Issue } from '../types';

type IdentityUse = { text: string; where: string; line: number; column: number };

function sourceText(code: string, node: t.Node): string {
  return code.slice(node.start ?? 0, node.end ?? 0).replace(/\s+/g, '');
}

export const rule: Rule = {
  id: 'identity-mismatch',
  needs: ['code'],
  check({ input, code }) {
    if (experimentCalls(code).length === 0) return [];
    const uses: IdentityUse[] = [];
    for (const call of code.calls) {
      if (!call.onFlagsmith) continue;
      let identity: t.Node | undefined;
      if (call.name === 'identify') identity = call.args[0];
      else if (call.name === 'getExperimentFlag' && runtimeOf(code, call) === 'node') identity = call.args[1];
      else if (call.name === 'trackEvent' || call.name === 'trackExposureEvent') identity = objectProp(call.args[1], 'identifier');
      if (!identity) continue;
      uses.push({ text: sourceText(input.code, identity), where: `${call.name}()`, line: call.line, column: call.column });
    }
    const first = uses[0];
    if (!first) return [];
    const issues: Issue[] = [];
    const reported = new Set<string>([first.text]);
    for (const use of uses) {
      if (reported.has(use.text)) continue;
      reported.add(use.text);
      issues.push({
        ruleId: 'identity-mismatch',
        confidence: 'possible',
        source: 'code',
        line: use.line,
        column: use.column,
        message: `${use.where} uses the identity ${use.text}, but ${first.where} on line ${first.line} uses ${first.text}; if they differ, conversions aren't counted.`,
        docsUrl: DOCS.runExperiment,
      });
    }
    return issues;
  },
};
