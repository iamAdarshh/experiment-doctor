// Reads the live experiment results from the Flagsmith Admin API. Server only: it uses
// FLAGSMITH_ADMIN_TOKEN, which must never reach the browser (the `server-only` import makes a client
// import fail the build). Endpoints from docs/04-flagsmith-experimentation-reference.md:
//   POST api/v1/environments/<env key>/experiments/<id>/results/refresh/   (at most once every 5 minutes)
//   GET  api/v1/environments/<env key>/experiments/<id>/results/
import 'server-only';

const DEFAULT_ADMIN_API = 'https://api.flagsmith.com/api/v1/';

export type ResultsResponse =
  | { status: 'ok'; experimentId: string; fetchedAt: string; results: unknown }
  | { status: 'not-configured'; missing: string[] }
  | { status: 'error'; message: string };

export async function fetchExperimentResults(): Promise<ResultsResponse> {
  const token = process.env.FLAGSMITH_ADMIN_TOKEN;
  const environmentKey = process.env.FLAGSMITH_ENV_KEY;
  const experimentId = process.env.FLAGSMITH_EXPERIMENT_ID;
  const missing = [
    !token && 'FLAGSMITH_ADMIN_TOKEN',
    !environmentKey && 'FLAGSMITH_ENV_KEY',
    !experimentId && 'FLAGSMITH_EXPERIMENT_ID',
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) return { status: 'not-configured', missing };

  const base = process.env.FLAGSMITH_ADMIN_API_URL ?? DEFAULT_ADMIN_API;
  const resultsUrl = `${base}environments/${encodeURIComponent(environmentKey!)}/experiments/${encodeURIComponent(experimentId!)}/results/`;
  const headers = { Authorization: `Api-Key ${token}`, Accept: 'application/json' };

  try {
    // Ask Flagsmith to recompute. It allows this once per 5 minutes; a "too soon" answer is fine to ignore,
    // because we then read the last computed results. Our callers cache for 5 minutes too.
    await fetch(`${resultsUrl}refresh/`, { method: 'POST', headers, cache: 'no-store' }).catch(() => undefined);
    const response = await fetch(resultsUrl, { headers, cache: 'no-store' });
    if (!response.ok) return { status: 'error', message: `Flagsmith answered ${response.status}.` };
    // The results endpoint returns aggregate numbers only (per-variation counts, lift, intervals).
    return { status: 'ok', experimentId: experimentId!, fetchedAt: new Date().toISOString(), results: await response.json() };
  } catch {
    return { status: 'error', message: 'Could not reach Flagsmith.' };
  }
}
