// Demo Shop: a one-page shop driven entirely by flags from self-hosted Flagsmith, using the official Node SDK.
//
//   make demo        (or: npm run demo)   → http://localhost:3030
//   http://localhost:3030/?env=Production  shows what Production serves
//
// It uses remote evaluation, so a flag toggled in FlagLens (or the dashboard) shows up on the next page load.
// The page reloads itself every 3 seconds for the demo video.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Flagsmith } from '@flagsmith/nodejs';

const here = dirname(fileURLToPath(import.meta.url));

/** Loads examples/demo-shop/.env, falling back to the repo-root .env. Both are written by `make seed`. */
function loadEnv() {
  for (const file of [join(here, '.env'), join(here, '..', '..', '.env')]) {
    if (!existsSync(file)) continue;
    const vars = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
      if (m) vars[m[1]] = m[2];
    }
    return { ...vars, ...process.env };
  }
  return { ...process.env };
}

const env = loadEnv();
const API_URL = (env.FLAGSMITH_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
const PORT = Number(env.DEMO_PORT || 3030);
const DEFAULT_ENV = env.DEMO_ENVIRONMENT || 'Development';

const envKeys = Object.fromEntries(
  Object.entries(env)
    .filter(([k]) => k.startsWith('FLAGSMITH_ENV_KEY_'))
    .map(([k, v]) => [k.slice('FLAGSMITH_ENV_KEY_'.length), v]),
);
if (Object.keys(envKeys).length === 0) {
  console.error('No FLAGSMITH_ENV_KEY_* variables found. Start Flagsmith and seed it first:\n  make up && make seed');
  process.exit(1);
}

// One SDK client per environment, created on first use. Client-side environment keys are public by design.
const clients = new Map();
function clientFor(envName) {
  const key = envKeys[envName.toUpperCase()];
  if (!key) return undefined;
  if (!clients.has(key)) {
    clients.set(
      key,
      new Flagsmith({
        environmentKey: key,
        apiUrl: `${API_URL}/api/v1/`,
        requestTimeoutSeconds: 3,
        // If Flagsmith is unreachable, every flag falls back to "off / no value" instead of crashing the shop.
        defaultFlagHandler: () => ({ enabled: false, value: null, isDefault: true }),
      }),
    );
  }
  return clients.get(key);
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function render(envName, visitorId) {
  const flagsmith = clientFor(envName);
  // Identity flags, so each visitor gets a stable variant of checkout_button_color.
  const flags = await flagsmith.getIdentityFlags(visitorId, { plan: 'free' });

  if (flags.isFeatureEnabled('maintenance_mode')) {
    return maintenancePage(envName);
  }

  const banner = flags.getFeatureValue('banner_text');
  const newCheckout = flags.isFeatureEnabled('new_checkout');
  const buttonColor = flags.getFeatureValue('checkout_button_color') ?? 'blue';
  const rateLimit = flags.getFeatureValue('rate_limit_per_minute');
  const darkMode = flags.isFeatureEnabled('dark_mode');
  const legacySearch = flags.isFeatureEnabled('legacy_search'); // archived in Flagsmith

  const body = `
    ${banner ? `<div class="banner">${escapeHtml(banner)}</div>` : ''}
    <section class="product">
      <div class="photo">🎧</div>
      <div>
        <h2>Toggle Wars Headphones</h2>
        <p class="price">$129 <s>$179</s></p>
        <p>Noise-cancelling, 40-hour battery. Ships tomorrow.</p>
        ${legacySearch ? '<p class="legacy">Using legacy search</p>' : ''}
      </div>
    </section>
    <section class="checkout ${newCheckout ? 'new' : 'old'}">
      ${
        newCheckout
          ? `<h3>⚡ One-page checkout <span class="tag">new_checkout: ON</span></h3>
             <div class="row"><input placeholder="Email" disabled><input placeholder="Card number" disabled></div>`
          : `<h3>Checkout · step 1 of 3 <span class="tag off">new_checkout: OFF</span></h3>
             <ol><li>Shipping address</li><li>Delivery options</li><li>Payment</li></ol>`
      }
      <button class="buy" style="background:${escapeHtml(cssColor(buttonColor))}">Buy now</button>
      <p class="variant">checkout_button_color for this visitor: <b>${escapeHtml(buttonColor)}</b></p>
    </section>
    <footer>
      API rate limit: <b>${escapeHtml(rateLimit ?? 'default')}</b> requests/min ·
      flags from <b>self-hosted Flagsmith</b> at ${escapeHtml(API_URL)} · environment <b>${escapeHtml(envName)}</b> ·
      ${Object.keys(envKeys)
        .map((e) => `<a href="/?env=${encodeURIComponent(e)}">${escapeHtml(e.charAt(0) + e.slice(1).toLowerCase())}</a>`)
        .join(' · ')}
    </footer>`;
  return page(envName, body, darkMode);
}

function maintenancePage(envName) {
  return page(envName, '<section class="maintenance"><h2>🛠 Back soon</h2><p>The shop is in maintenance mode.</p></section>', false);
}

function cssColor(value) {
  const named = { blue: '#2563eb', green: '#16a34a', orange: '#ea580c', purple: '#7c3aed' };
  return named[value] ?? (/^#[0-9a-f]{3,8}$/i.test(value) ? value : named.blue);
}

function page(envName, body, dark) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<title>Demo Shop · ${escapeHtml(envName)}</title>
<style>
  :root { --bg:#f8fafc; --fg:#0f172a; --card:#fff; --muted:#64748b; }
  body.dark { --bg:#0b1020; --fg:#e2e8f0; --card:#151b2e; --muted:#94a3b8; }
  body { margin:0; font:16px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  header { padding:16px 32px; display:flex; justify-content:space-between; align-items:center; }
  header h1 { margin:0; font-size:22px; } .env { color:var(--muted); }
  main { max-width:760px; margin:0 auto; padding:0 24px 40px; }
  .banner { background:#fde047; color:#1f2937; text-align:center; padding:10px; font-weight:600; border-radius:10px; margin-bottom:20px; }
  section { background:var(--card); border-radius:14px; padding:22px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .product { display:flex; gap:22px; align-items:center; } .photo { font-size:72px; }
  .price { font-size:22px; font-weight:700; } .price s { color:var(--muted); font-weight:400; font-size:16px; }
  .tag { font-size:12px; background:#16a34a; color:#fff; padding:2px 8px; border-radius:99px; vertical-align:middle; }
  .tag.off { background:#64748b; }
  .checkout.new { border:2px solid #16a34a; } .row { display:flex; gap:10px; } input { flex:1; padding:8px; }
  .buy { margin-top:14px; color:#fff; border:0; padding:12px 28px; font-size:17px; border-radius:10px; }
  .variant, footer, .legacy { color:var(--muted); font-size:14px; } footer a { color:inherit; }
  .maintenance { text-align:center; padding:60px; }
</style></head>
<body class="${dark ? 'dark' : ''}"><header><h1>🛒 Demo Shop</h1><span class="env">env: ${escapeHtml(envName)}</span></header>
<main>${body}</main></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/') {
    res.writeHead(404).end('Not found');
    return;
  }
  const requested = url.searchParams.get('env') || DEFAULT_ENV;
  const envName = Object.keys(envKeys).find((k) => k === requested.toUpperCase()) ? requested : DEFAULT_ENV;
  const visitorId = /visitor=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? `visitor-${randomUUID().slice(0, 8)}`;
  try {
    const html = await render(envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase(), visitorId);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': `visitor=${visitorId}; Path=/; SameSite=Lax` });
    res.end(html);
  } catch (e) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', Refresh: '3' });
    res.end(`Flagsmith is unreachable at ${API_URL} (${e.message}). Is it running? Try: make up`);
  }
});

server.listen(PORT, () => {
  console.log(`Demo Shop running at http://localhost:${PORT}  (flags from ${API_URL}, environment ${DEFAULT_ENV})`);
  console.log(`Other environments: ${Object.keys(envKeys).map((e) => `http://localhost:${PORT}/?env=${e.charAt(0) + e.slice(1).toLowerCase()}`).join('  ')}`);
});
