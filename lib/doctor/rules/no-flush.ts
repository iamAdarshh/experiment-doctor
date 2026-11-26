// Rule 4. Events are sent in batches every 10 seconds; anything still buffered when the page closes or
// the process exits is lost. Browser code should flush on `pagehide`; server code should flush before
// the response or exit (`flushEvents()` or `close()`).

import { experimentCalls, runtimeOf } from '../code-helpers';
import { DOCS } from '../docs-links';
import type { CallFact, CodeFacts, ConfigFact } from '../parse';
import { indentAt, insertLineAfterPatch } from '../patch';
import type { Rule } from '../rule';
import type { Patch } from '../types';

function hasFlush(code: CodeFacts): boolean {
  // `flushEvents` is Flagsmith's own name, so it counts on any receiver, including `client()?.flushEvents()`.
  // `close` is a common name, so it only counts on a known Flagsmith client.
  return code.calls.some((call) => call.name === 'flushEvents' || (call.onFlagsmith && call.name === 'close'));
}

/** Browser: add a pagehide listener right after the `init(...)` statement. */
function browserPatch(text: string, init: ConfigFact | undefined): Patch | undefined {
  if (!init?.statement || !init.receiver) return undefined;
  const indent = indentAt(text, init.statement.start);
  // statement.end - 1 is the statement's last character, so the new line goes after its last line.
  return insertLineAfterPatch(text, init.statement.end - 1, `${indent}window.addEventListener('pagehide', () => { void ${init.receiver}.flushEvents(); });`);
}

/** Server: flush right after the last event call, when that call is a statement of its own function. */
function serverPatch(text: string, last: CallFact | undefined): Patch | undefined {
  const statement = last?.statement;
  if (!last || !statement || !last.receiver || statement.scopeId !== last.scopeId) return undefined;
  const indent = indentAt(text, statement.start);
  const flush = last.canAwait ? `await ${last.receiver}.flushEvents();` : `void ${last.receiver}.flushEvents();`;
  return insertLineAfterPatch(text, statement.end - 1, `${indent}${flush}`);
}

export const rule: Rule = {
  id: 'no-flush',
  needs: ['code'],
  check({ input, code }) {
    const calls = experimentCalls(code);
    if (calls.length === 0 || hasFlush(code)) return [];
    const isServer = calls.some((call) => runtimeOf(code, call) === 'node');
    const sendsEvents = calls.filter((call) => call.name !== 'useExperiment');
    const first = calls[0]!;
    if (isServer) {
      // A one-off script loses its last batch for sure. A long-running server or request handler may flush
      // later on its own timer, so there we can only say "possible".
      return [
        {
          ruleId: 'no-flush',
          confidence: code.looksLikeServer ? 'possible' : 'certain',
          source: 'code',
          line: first.line,
          column: first.column,
          message: 'Events are never flushed: call flushEvents() before the response is sent, or close() before the process exits.',
          docsUrl: DOCS.runExperiment,
          patch: serverPatch(input.code, sendsEvents[sendsEvents.length - 1]),
        },
      ];
    }
    const init = code.configs.find((config) => config.runtime === 'browser' && config.receiver);
    return [
      {
        ruleId: 'no-flush',
        confidence: 'possible',
        source: 'code',
        line: first.line,
        column: first.column,
        message: 'Events are never flushed: the last batch is lost when the tab closes. Call flushEvents() on pagehide.',
        docsUrl: DOCS.javascriptSdk,
        patch: browserPatch(input.code, init),
      },
    ];
  },
};
