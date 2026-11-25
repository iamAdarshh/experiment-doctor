// GET /api/results: the live experiment numbers for the public results page.
// Cached for 5 minutes by the CDN (s-maxage=300 below), which matches Flagsmith's refresh limit.
// Returns aggregates only, never visitor data.
import { NextResponse } from 'next/server';
import { fetchExperimentResults } from '@/lib/server/experiment-results';

export async function GET() {
  const results = await fetchExperimentResults();
  const status = results.status === 'ok' ? 200 : results.status === 'not-configured' ? 503 : 502;
  return NextResponse.json(results, {
    status,
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  });
}
