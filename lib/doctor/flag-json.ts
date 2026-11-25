// Reads variations out of `flagsmith feature get <flag> --json` output.
// The exact JSON shape of the CLI (v2, beta) isn't documented field by field, so this reader is tolerant:
// it looks for an array named `multivariate_options`, `variations` or `variants` anywhere in the JSON.
// TODO(team): check this against real CLI output from our org and add it as a fixture.

export type Variation = { key: string | null; value: string; index: number };

export type FlagJsonReading =
  | { ok: true; flagName: string | null; variations: Variation[] }
  | { ok: false; reason: string; line?: number };

const VARIATION_ARRAY_KEYS = ['multivariate_options', 'variations', 'variants'];
const VALUE_KEYS = ['string_value', 'value', 'integer_value', 'boolean_value', 'feature_state_value'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findVariationArray(value: unknown, depth: number): unknown[] | undefined {
  if (depth > 6 || !isObject(value)) return undefined;
  for (const key of VARIATION_ARRAY_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  // Look one level deeper in a fixed order (sorted keys), so the result never depends on key order.
  for (const key of Object.keys(value).sort()) {
    const found = findVariationArray(value[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findFlagName(json: Record<string, unknown>): string | null {
  if (typeof json.name === 'string') return json.name;
  const feature = json.feature;
  if (isObject(feature) && typeof feature.name === 'string') return feature.name;
  return null;
}

/** JSON.parse messages differ between engines; we only pass on the line when we can find it. */
function jsonErrorLine(text: string, error: unknown): number | undefined {
  const match = /position (\d+)/.exec(String((error as Error).message));
  if (!match) return undefined;
  const position = Number(match[1]);
  return text.slice(0, position).split('\n').length;
}

export function readFlagJson(text: string): FlagJsonReading {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'The flag JSON is not valid JSON.', line: jsonErrorLine(text, error) };
  }
  if (Array.isArray(json) && json.length === 1) json = json[0];
  if (!isObject(json)) return { ok: false, reason: 'The flag JSON is not an object.' };

  const array = findVariationArray(json, 0);
  if (!array) return { ok: false, reason: 'No variations list (multivariate_options) was found in the flag JSON.' };

  const variations: Variation[] = array.filter(isObject).map((item, index) => {
    const rawKey = item.key ?? item.variant_key;
    const key = typeof rawKey === 'string' && rawKey.trim() !== '' ? rawKey : null;
    let value = '';
    for (const valueKey of VALUE_KEYS) {
      const candidate = item[valueKey];
      if (candidate !== undefined && candidate !== null) {
        value = String(candidate);
        break;
      }
    }
    return { key, value, index };
  });
  return { ok: true, flagName: findFlagName(json), variations };
}
