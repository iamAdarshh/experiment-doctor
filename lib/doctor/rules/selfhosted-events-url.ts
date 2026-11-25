// Rule 10. Self-hosted Flagsmith needs the events URL set, and the SDK appends `v1/events` itself
// (docs/04: "SDKs append v1/events themselves"). Two mistakes: a URL that already ends in /v1/events
// (events go to .../v1/events/v1/events), or a custom API URL with no eventsApiUrl (events go to Flagsmith Cloud).

import { addPropertyPatch, experimentCalls } from '../code-helpers';
import { DOCS } from '../docs-links';
import type { ConfigFact } from '../parse';
import { replaceRangePatch } from '../patch';
import type { Rule } from '../rule';
import type { Issue } from '../types';

function eventsApiUrlProp(config: ConfigFact) {
  const processor = config.props.get('eventProcessorConfig')?.value;
  if (!processor || processor.type !== 'ObjectExpression') return undefined;
  for (const prop of processor.properties) {
    if (prop.type === 'ObjectProperty' && !prop.computed && prop.key.type === 'Identifier' && prop.key.name === 'eventsApiUrl') {
      return prop.value;
    }
  }
  return undefined;
}

export const rule: Rule = {
  id: 'selfhosted-events-url',
  needs: ['code'],
  check({ input, code }) {
    if (code.configs.length === 0) return { notChecked: 'No Flagsmith init or options were found in the code.' };
    const usesEvents = experimentCalls(code).length > 0;
    const issues: Issue[] = [];
    for (const config of code.configs) {
      if (!config.readable) continue;
      const urlNode = eventsApiUrlProp(config);
      if (urlNode?.type === 'StringLiteral' && /\/v1\/events\/?$/.test(urlNode.value)) {
        const fixed = urlNode.value.replace(/v1\/events\/?$/, '');
        const quote = input.code[urlNode.start ?? 0] ?? "'";
        issues.push({
          ruleId: 'selfhosted-events-url',
          confidence: 'certain',
          source: 'code',
          line: urlNode.loc?.start.line,
          column: (urlNode.loc?.start.column ?? 0) + 1,
          message: `eventsApiUrl ends with /v1/events, but the SDK adds that itself; use "${fixed}".`,
          docsUrl: DOCS.selfHosting,
          patch: replaceRangePatch(input.code, urlNode.start ?? 0, urlNode.end ?? 0, `${quote}${fixed}${quote}`),
        });
        continue;
      }
      const api = config.props.get(config.runtime === 'node' ? 'apiUrl' : 'api') ?? config.props.get('api') ?? config.props.get('apiUrl');
      const isSelfHosted = api?.str !== undefined && !/^https:\/\/([\w-]+\.)*flagsmith\.com\//.test(api.str);
      if (!usesEvents || !isSelfHosted || urlNode) continue;
      // Flagsmith DB mode: the events URL is the API URL ending in /api/ (docs/04).
      const base = /^(.*\/api\/)v1\/?$/.exec(api.str ?? '')?.[1];
      issues.push({
        ruleId: 'selfhosted-events-url',
        confidence: 'certain',
        source: 'code',
        line: api.line,
        column: api.column,
        message: `A self-hosted API URL is set but eventProcessorConfig.eventsApiUrl is not, so events go to Flagsmith Cloud instead of ${api.str}.`,
        docsUrl: DOCS.selfHosting,
        patch:
          base && !config.props.has('eventProcessorConfig')
            ? addPropertyPatch(input.code, config, `eventProcessorConfig: { eventsApiUrl: '${base}' }`)
            : undefined,
      });
    }
    return issues;
  },
};
