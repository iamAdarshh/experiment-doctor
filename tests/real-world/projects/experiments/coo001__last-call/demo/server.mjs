// "Trailmix", the patient: a tiny trip-planning page with two running Flagsmith experiments.
// No framework. GET / renders by variation, POST /api/event records a conversion,
// GET /verdict shows the latest Last Call verdicts from .lastcall/verdicts (no login, no keys).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Flagsmith } from '@flagsmith/nodejs';
import { loadEnv } from '../src/env.mjs';
import { inviteButton } from './components/invite-button.mjs';
import { pricingHeadline } from './components/pricing-headline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = loadEnv();
const live = !!cfg.envKey;
// Without an environment key the page still renders: every experiment falls back to control.
const flags = live
  ? new Flagsmith({ environmentKey: cfg.envKey, enableEvents: true })
  : { getExperimentFlag: async () => ({ value: 'control', variant: 'control' }), trackEvent() {}, flushEvents: async () => {}, close: async () => {} };
const EVENTS = new Set(['invite_sent', 'plan_selected']);

const css = `:root{color-scheme:light dark;--bg:#f6f4ef;--ink:#1c1b18;--mute:#6b675e;--card:#fff;--line:#e2ded3;--acc:#1f6f54}
@media(prefers-color-scheme:dark){:root{--bg:#141412;--ink:#eeeae0;--mute:#9a958a;--card:#1d1c19;--line:#2e2c27;--acc:#5fc39c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 20px 80px}h1{font-size:34px;line-height:1.15;margin:0 0 8px;letter-spacing:-.02em}h2{font-size:22px;margin:0 0 12px}
p.lead{color:var(--mute);margin:0 0 28px;max-width:56ch}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px}.tag{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mute);display:block;margin-bottom:14px}
button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:11px 16px;background:var(--acc);color:#fff;cursor:pointer}button[disabled]{opacity:.6;cursor:default}
footer{margin-top:28px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mute)}a{color:var(--acc)}
table{border-collapse:collapse;width:100%;font-size:14px;margin:12px 0}th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.verdict{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 9px;border-radius:999px;border:1px solid var(--line)}.SHIP{color:var(--acc);border-color:var(--acc)}.STOP{color:#c0392b;border-color:#c0392b}
ul{padding-left:18px;margin:8px 0}li{margin:3px 0}.note{color:var(--mute);font-size:14px}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function home(userId) {
  const [invite, pricing] = await Promise.all([inviteButton(flags, userId), pricingHeadline(flags, userId)]);
  return page('Trailmix', `<h1>Plan the trip in one place.</h1><p class="lead">Trailmix keeps the route, the bookings and who owes whom in one shared page. This is the demo app that Last Call works on.</p>
<div class="grid"><section class="card"><span class="tag">experiment: invite_cta</span><h2>Bring the group in</h2>${invite}</section>
<section class="card"><span class="tag">experiment: pricing_headline</span>${pricing}</section></div>
<footer>visitor ${esc(userId)} · ${live ? 'live Flagsmith flags' : 'offline: no environment key, showing control'} · <a href="/verdict">latest verdicts</a> · <a href="/?new=1">new visitor</a></footer>
<script>document.querySelectorAll('button[data-event]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;await fetch('/api/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:b.dataset.event})});b.textContent='Recorded: '+b.dataset.event}))</script>`);
}

function verdictPage() {
  const dir = path.join(root, '.lastcall', 'verdicts');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const cards = files.map((f) => {
    const { input, verdict, plain } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const pc = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
    const rows = Object.entries(input.arms).map(([k, a]) => { const i = input.inference[k]; return `<tr><td><code>${esc(k)}</code></td><td>${a.n}</td><td>${a.conversions}</td><td>${((a.conversions / a.n) * 100).toFixed(1)}%</td><td>${i ? pc(i.lift) : 'baseline'}</td><td>${i ? `${pc(i.ciLow)} to ${pc(i.ciHigh)}` : '-'}</td><td>${i ? `${(i.chanceToWin * 100).toFixed(1)}%` : '-'}</td></tr>`; }).join('');
    return `<section class="card"><span class="tag">flag ${esc(input.experiment.flag)} · experiment #${input.experiment.id} · results as of ${esc(input.asOf || '-')}</span>
<h2>${esc(input.experiment.name)} <span class="verdict ${verdict.decision}">${verdict.decision.replace('_', ' ')}${verdict.winner ? ' ' + esc(verdict.winner) : ''}</span></h2>
<p>${esc(verdict.reason)}</p>${plain ? `<p class="note">In plain words (LLM): ${esc(plain)}</p>` : ''}
<table><tr><th>Variation</th><th>Identities</th><th>Converted</th><th>Rate</th><th>Lift</th><th>95% credible interval</th><th>Chance to beat control</th></tr>${rows}</table>
<ul>${verdict.checks.map((c) => `<li>${c.pass ? 'PASS' : 'FAIL'} · ${esc(c.name)}: ${esc(c.detail)}</li>`).join('')}</ul>
${input.simulatedTraffic ? '<p class="note">Traffic is simulated. The events are real Flagsmith events; the users are not real people.</p>' : ''}</section>`;
  }).join('');
  return page('Last Call verdicts', `<h1>Last Call verdicts</h1><p class="lead">Lift, credible interval and chance to beat control come from Flagsmith's results API. The decision is a fixed rule applied to them.</p><div class="grid" style="grid-template-columns:1fr">${cards || '<p>No verdicts yet. Run <code>last-call review</code>.</p>'}</div><footer><a href="/">back to the demo app</a></footer>`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const cookie = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
    let userId = cookie.tm_uid;
    if (!userId || url.searchParams.has('new')) userId = `web-${crypto.randomBytes(5).toString('hex')}`;
    const headers = { 'set-cookie': `tm_uid=${userId}; Path=/; Max-Age=2592000; SameSite=Lax` };
    if (url.pathname === '/') { res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' }); return res.end(await home(userId)); }
    if (url.pathname === '/verdict') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(verdictPage()); }
    if (url.pathname === '/api/event' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      const { event } = JSON.parse(raw || '{}');
      if (!EVENTS.has(event)) { res.writeHead(400); return res.end('unknown event'); }
      flags.trackEvent(event, { identifier: userId }); await flags.flushEvents();
      res.writeHead(204, headers); return res.end();
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { res.writeHead(500); res.end('error'); console.error(e.message); }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, () => console.log(`Trailmix demo on http://localhost:${port}  (${live ? 'live flags' : 'offline'})`));
process.on('SIGTERM', async () => { await flags.close(); server.close(() => process.exit(0)); });
