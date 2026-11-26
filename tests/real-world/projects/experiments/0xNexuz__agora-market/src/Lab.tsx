import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import { useRef, useState } from 'react';
import { ADD_TO_CART, ENV_KEY, FLAG, ORDER_STARTED, SIM_ENV_KEY, VARIANTS } from './config';
import { DELIVERY, PRODUCTS } from './data';

/** A simulated order is one random piece from the catalogue plus delivery. */
const orderValue = () => PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)].price + DELIVERY;
const separate = Boolean(SIM_ENV_KEY) && SIM_ENV_KEY !== ENV_KEY;

type Tally = { shown: number; ordered: number };
type Tallies = { cart: Tally; whatsapp: Tally; skipped: number; errors: number };

const empty = (): Tallies => ({
  cart: { shown: 0, ordered: 0 },
  whatsapp: { shown: 0, ordered: 0 },
  skipped: 0,
  errors: 0,
});

const pct = (t: Tally) => (t.shown ? ((t.ordered / t.shown) * 100).toFixed(1) + '%' : '–');

/**
 * Traffic lab: every simulated shopper is a fresh Flagsmith identity that gets
 * the experiment flag (recording an exposure) and then maybe orders, using the
 * behaviour assumptions set on this page. Assumptions in, data out: the lab
 * proves the pipeline works, it does not prove which flow is better.
 */
export function Lab() {
  const [shoppers, setShoppers] = useState(300);
  const [addRate, setAddRate] = useState(35);
  const [checkoutRate, setCheckoutRate] = useState(50);
  const [whatsappRate, setWhatsappRate] = useState(20);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [tallies, setTallies] = useState<Tallies>(empty);
  const stop = useRef(false);
  const [check, setCheck] = useState<null | { n: number; whatsapp: number; control: number; enrolled: number }>(null);
  const [checking, setChecking] = useState(false);

  /**
   * Rollout check: ask Flagsmith what 20 brand-new shoppers would get. No events
   * are sent. After a winner is rolled out, every one of them gets that value.
   */
  const checkRollout = async () => {
    setChecking(true);
    const r = { n: 20, whatsapp: 0, control: 0, enrolled: 0 };
    const runId = Date.now().toString(36);
    await Promise.all(
      Array.from({ length: r.n }, async (_, i) => {
        const fs = createFlagsmithInstance();
        try {
          await fs.init({ environmentID: SIM_ENV_KEY, identity: `check_${runId}_${i}`, cacheFlags: false });
          const flag = fs.getAllFlags()[FLAG];
          if (flag?.experiment?.inExperiment) r.enrolled++;
          if (flag?.value === VARIANTS.whatsapp) r.whatsapp++;
          else r.control++;
        } catch (err) {
          console.error('[agora lab]', err);
        }
      }),
    );
    setCheck(r);
    setChecking(false);
  };

  const runOne = async (runId: string, i: number, t: Tallies) => {
    const fs = createFlagsmithInstance();
    try {
      await fs.init({
        environmentID: SIM_ENV_KEY,
        identity: `sim_${runId}_${i}`,
        enableEvents: true,
        cacheFlags: false,
      });
      const flag = fs.getExperimentFlag(FLAG);
      if (!flag?.experiment?.inExperiment) {
        t.skipped++;
        return;
      }
      if (flag.value === VARIANTS.whatsapp) {
        t.whatsapp.shown++;
        if (Math.random() < whatsappRate / 100) {
          fs.trackEvent(ORDER_STARTED, { value: orderValue() });
          t.whatsapp.ordered++;
        }
      } else {
        t.cart.shown++;
        if (Math.random() < addRate / 100) {
          fs.trackEvent(ADD_TO_CART);
          if (Math.random() < checkoutRate / 100) {
            fs.trackEvent(ORDER_STARTED, { value: orderValue() });
            t.cart.ordered++;
          }
        }
      }
    } catch (err) {
      console.error('[agora lab]', err);
      t.errors++;
    } finally {
      await fs.close(5000);
    }
  };

  const run = async () => {
    if (!SIM_ENV_KEY) return;
    stop.current = false;
    setRunning(true);
    setDone(0);
    const t = empty();
    setTallies({ ...t });
    const runId = Date.now().toString(36);
    const workers = 6;
    let next = 0;
    let finished = 0;

    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (!stop.current && next < shoppers) {
          const i = next++;
          await runOne(runId, i, t);
          finished++;
          setDone(finished);
          setTallies({ ...t, cart: { ...t.cart }, whatsapp: { ...t.whatsapp } });
        }
      }),
    );
    setRunning(false);
  };

  const expectedCart = ((addRate / 100) * (checkoutRate / 100) * 100).toFixed(1);

  return (
    <div className="page lab">
      <header className="shopbar">
        <a className="logo" href="/">
          Agora Market
        </a>
        <span className="shopbar-note">Traffic lab · simulated shoppers</span>
      </header>

      <main className="lab-main">
        <h1>Traffic lab</h1>
        <p className="lab-lead">
          Sends simulated shoppers through the live Flagsmith experiment. Each one is a new identity that gets the{' '}
          <code>{FLAG}</code> flag (an exposure) and may fire <code>{ORDER_STARTED}</code>. The rates below are{' '}
          <strong>assumptions you set</strong>, so the lab shows the experiment working end to end. Real shoppers on
          the store page are what tell you which flow wins.
        </p>

        {!SIM_ENV_KEY && <p className="dev-note">Set VITE_FLAGSMITH_ENV_KEY first: the lab has nowhere to send traffic.</p>}
        {SIM_ENV_KEY && (
          <p className="dev-note">
            {separate
              ? 'Lab traffic goes to the Development environment in Flagsmith. Real shoppers on the store page go to Production, so the two never mix.'
              : 'Warning: the lab is sending to the same Flagsmith environment as real shoppers, so simulated and real data will mix.'}
          </p>
        )}

        <div className="lab-grid">
          <label>
            Shoppers to simulate
            <input type="number" min={10} max={2000} value={shoppers} onChange={(e) => setShoppers(+e.target.value)} />
          </label>
          <label>
            Cart flow: add to cart {addRate}%
            <input type="range" min={0} max={100} value={addRate} onChange={(e) => setAddRate(+e.target.value)} />
          </label>
          <label>
            Cart flow: then pay with Paystack {checkoutRate}%
            <input
              type="range"
              min={0}
              max={100}
              value={checkoutRate}
              onChange={(e) => setCheckoutRate(+e.target.value)}
            />
          </label>
          <label>
            WhatsApp flow: tap Order on WhatsApp {whatsappRate}%
            <input
              type="range"
              min={0}
              max={100}
              value={whatsappRate}
              onChange={(e) => setWhatsappRate(+e.target.value)}
            />
          </label>
        </div>
        <p className="lab-hint">
          With these settings the cart flow converts about {expectedCart}% and the WhatsApp flow about {whatsappRate}%.
        </p>

        <div className="lab-actions">
          <button className="btn btn-primary" disabled={running || !SIM_ENV_KEY} onClick={run}>
            {running ? `Running… ${done}/${shoppers}` : `Send ${shoppers} shoppers`}
          </button>
          {running && (
            <button className="btn btn-quiet" onClick={() => (stop.current = true)}>
              Stop
            </button>
          )}
        </div>

        <table className="lab-table">
          <thead>
            <tr>
              <th>Variation</th>
              <th>Shown</th>
              <th>Orders started</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cart + Paystack (control)</td>
              <td>{tallies.cart.shown}</td>
              <td>{tallies.cart.ordered}</td>
              <td>{pct(tallies.cart)}</td>
            </tr>
            <tr>
              <td>Order on WhatsApp</td>
              <td>{tallies.whatsapp.shown}</td>
              <td>{tallies.whatsapp.ordered}</td>
              <td>{pct(tallies.whatsapp)}</td>
            </tr>
          </tbody>
        </table>
        <p className="lab-hint">
          Not enrolled: {tallies.skipped} · errors: {tallies.errors}. These counts are this browser's tally; the
          Flagsmith experiment page is the source of truth and shows the win probability a minute or so later.
        </p>

        <h2 className="lab-h2">Rollout check</h2>
        <p className="lab-lead">
          Asks Flagsmith what 20 brand-new shoppers would get from <code>{FLAG}</code> right now, without sending any
          events. While the experiment runs the answer is a mix. After a winner is rolled out, all 20 get it.
        </p>
        <div className="lab-actions">
          <button className="btn btn-quiet" disabled={checking || !SIM_ENV_KEY} onClick={checkRollout}>
            {checking ? 'Checking…' : 'Check 20 new shoppers'}
          </button>
        </div>
        {check && (
          <p className="lab-result" role="status">
            {check.whatsapp} of {check.n} got <code>whatsapp</code>, {check.control} got <code>control</code>.{' '}
            {check.enrolled} of {check.n} are in a running experiment.
          </p>
        )}
      </main>
    </div>
  );
}
