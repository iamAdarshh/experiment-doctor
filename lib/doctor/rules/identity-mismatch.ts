// Rule 8. Exposure and conversion must use the same identity, or the conversion lands on a user who was
// never exposed and isn't counted. We compare the identity expressions as written; different text may
// still mean the same value, so this is "possible".
//
// Only an exposure and a conversion in the SAME function are compared. Across functions and files the same
// value usually goes by different names (`userId` here, `id` there), and comparing those flagged correct code
// in ~1 in 3 real projects we ran the doctor on (26 Nov 2026). Inside one function, two different identities
// for the exposure and the conversion is a real smell.

import type * as t from '@babel/types';
import { experimentCalls, runtimeOf } from '../code-helpers';
import { DOCS } from '../docs-links';
import { objectProp } from '../parse';
import type { Rule } from '../rule';
import type { Issue } from '../types';

type IdentityUse = { text: string; where: string; line: number; column: number; side: 'exposure' | 'conversion'; scope: string };

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
      let side: IdentityUse['side'] = 'exposure';
      if (call.name === 'identify') identity = call.args[0];
      else if (call.name === 'getExperimentFlag' && runtimeOf(code, call) === 'node') identity = call.args[1];
      else if (call.name === 'trackExposureEvent') identity = objectProp(call.args[1], 'identifier');
      else if (call.name === 'trackEvent') {
        identity = objectProp(call.args[1], 'identifier');
        side = 'conversion';
      }
      if (!identity) continue;
      // Top-level code of different files must not share a scope, so the file is part of the key.
      const scope = `${call.file}:${call.scopeId}`;
      uses.push({ text: sourceText(input.code, identity), where: `${call.name}()`, line: call.line, column: call.column, side, scope });
    }

    const issues: Issue[] = [];
    const reported = new Set<string>();
    for (const conversion of uses.filter((use) => use.side === 'conversion')) {
      const exposures = uses.filter((use) => use.side === 'exposure' && use.scope === conversion.scope);
      if (exposures.length === 0 || exposures.some((use) => use.text === conversion.text)) continue;
      const exposure = exposures[0]!;
      const key = `${conversion.scope}|${conversion.text}`;
      if (reported.has(key)) continue;
      reported.add(key);
      issues.push({
        ruleId: 'identity-mismatch',
        confidence: 'possible',
        source: 'code',
        line: conversion.line,
        column: conversion.column,
        message: `${conversion.where} uses the identity ${conversion.text}, but ${exposure.where} in the same function uses ${exposure.text}; if they differ, conversions aren't counted.`,
        docsUrl: DOCS.runExperiment,
      });
    }
    return issues;
  },
};
