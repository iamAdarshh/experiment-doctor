// ENGINE_VERSION is sent as metadata on every Flagsmith event and is part of the result ID, so a change
// in rule output is visible in the experiment data.
// Bump the first part when rule output changes (minor for a new rule, patch for a fix).
// The parser version is part of it because a parser upgrade can change what the rules see.
// tests/engine/version.test.ts checks that BABEL_PARSER_VERSION matches the installed @babel/parser.
export const BABEL_PARSER_VERSION = '7.29.15';
export const ENGINE_VERSION = `0.1.2+babel.${BABEL_PARSER_VERSION}`;
