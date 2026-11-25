// Rule 3. A variation without a key isn't counted in an experiment, and `control` is reserved
// for the flag's own value. Checked from `flagsmith feature get <flag> --json` output.

import { DOCS } from '../docs-links';
import { readFlagJson } from '../flag-json';
import type { Rule } from '../rule';
import type { Issue } from '../types';

/** A key made from the variation's value: lower case, letters/digits/underscores. Falls back to variant_<n>. */
function suggestKey(value: string, index: number, taken: Set<string>): string {
  const fromValue = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const candidate = fromValue && fromValue !== 'control' && !taken.has(fromValue) ? fromValue : `variant_${index + 1}`;
  taken.add(candidate);
  return candidate;
}

/** Quotes a value for a shell command when it has anything beyond safe characters. */
function shellWord(value: string): string {
  return /^[\w.\-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export const rule: Rule = {
  id: 'variation-key',
  needs: ['flagJson'],
  check({ input }) {
    const reading = readFlagJson(input.flagJson ?? '');
    if (!reading.ok) return { notChecked: reading.reason };
    const flag = reading.flagName ?? '<flag_name>';
    if (reading.variations.length === 0) {
      return [
        {
          ruleId: 'variation-key',
          confidence: 'certain',
          source: 'flagJson',
          message: `The flag "${flag}" has no variations, so an experiment has nothing to compare with control.`,
          docsUrl: DOCS.createExperiment,
          patch: { command: `flagsmith feature variant add ${shellWord(flag)} --value <value> --key <key> --weight 0` },
        },
      ];
    }
    const taken = new Set(reading.variations.map((variation) => variation.key).filter((key): key is string => key !== null));
    const issues: Issue[] = [];
    for (const variation of reading.variations) {
      if (variation.key !== null && variation.key !== 'control') continue;
      const newKey = suggestKey(variation.value, variation.index, taken);
      issues.push({
        ruleId: 'variation-key',
        confidence: 'certain',
        source: 'flagJson',
        message:
          variation.key === null
            ? `Variation ${variation.index + 1} ("${variation.value}") has no key, so it isn't counted in experiments.`
            : `Variation ${variation.index + 1} uses the key "control", which is reserved for the flag's own value.`,
        docsUrl: DOCS.createExperiment,
        patch: {
          command: `flagsmith feature variant add ${shellWord(flag)} --value ${shellWord(variation.value)} --key ${newKey} --weight 0   # then remove the old variation in the dashboard`,
        },
      });
    }
    return issues;
  },
};
