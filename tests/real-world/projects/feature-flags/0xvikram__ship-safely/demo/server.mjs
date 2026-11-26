// A tiny checkout service for the ship-safely demo.
// GET /checkout?user=<id>&cart=<cents> → { total, path }. The "new-checkout" flag picks the pricing path per user.
// BUG=1 plants a real defect in the new path (it throws for carts over $50), so a health gate can catch it.
import http from 'node:http'
import { Flagsmith } from 'flagsmith-nodejs'

const key = process.env.FLAGSMITH_SERVER_KEY
if (!key) { console.error('Set FLAGSMITH_SERVER_KEY (a server-side key: flagsmith environment key create <env>)'); process.exit(1) }
const flagsmith = new Flagsmith({ environmentKey: key, enableLocalEvaluation: false })
const FLAG = 'new-checkout'
const BUG = process.env.BUG === '1'

const oldTotal = (cart) => Math.round(cart * 1.18) // tax only
const newTotal = (cart) => {                         // tax + a free-shipping threshold
  if (BUG && cart > 5000) throw new Error('shipping table missing a tier')
  return Math.round(cart * 1.18) + (cart >= 5000 ? 0 : 499)
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname !== '/checkout') { res.writeHead(404).end(); return }
  const user = url.searchParams.get('user') || 'anon'
  const cart = Number(url.searchParams.get('cart') || 0)
  try {
    const flags = await flagsmith.getIdentityFlags(user)
    const onNew = flags.isFeatureEnabled(FLAG)
    const total = onNew ? newTotal(cart) : oldTotal(cart)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ total, path: onNew ? 'new' : 'old' }))
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e.message) }))
  }
}).listen(Number(process.env.PORT || 4321), () => console.log(`checkout on :${process.env.PORT || 4321}${BUG ? ' (BUG=1)' : ''}`))
