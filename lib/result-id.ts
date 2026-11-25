// The result ID shown under every result: SHA-256 of the normalized input plus ENGINE_VERSION. The same ID
// always means the same output, so a bug report with an ID can be reproduced. Web Crypto is async, which is
// why this lives outside the (synchronous, pure) engine. Docs: https://developer.mozilla.org/docs/Web/API/SubtleCrypto/digest

import { ENGINE_VERSION, normalizeInput, type DoctorInput } from './doctor';

export async function resultId(input: DoctorInput): Promise<string> {
  const normalized = normalizeInput(input);
  // An array, not an object, so the serialization never depends on key order.
  const canonical = JSON.stringify([normalized.code, normalized.dependencies, normalized.metricNames, normalized.flagJson, ENGINE_VERSION]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}
