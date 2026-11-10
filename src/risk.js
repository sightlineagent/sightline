/* The same risk model as sightline-agent.xyz: a score from 3 (safest) to 97 (riskiest), with the reasons behind it. */
import { usd, ago } from "./ui.js";

/* A token is a copycat when an older token with the same ticker has more liquidity. */
export function findOriginal(t, others) {
  const mine = t.age != null ? Date.now() - t.age * 60000 : Date.now();
  return others.find(o => o.liq > t.liq && (!o.created || Date.parse(o.created) < mine)) || null;
}

export function score(t, original) {
  if (t.stock) return 8;
  let r = 6;
  if (t.honeypot === true) r += 60;
  if (original) r += 45;
  r += t.liq < 10000 ? 30 : t.liq < 50000 ? 16 : t.liq < 150000 ? 6 : 0;
  if (t.top10 != null) r += t.top10 >= 70 ? 16 : t.top10 >= 45 ? 8 : 0;
  r += t.holders == null ? 12 : t.holders < 200 ? 14 : t.holders < 1000 ? 6 : 0;
  if (t.age != null) r += t.age < 1440 ? 18 : t.age < 10080 ? 5 : 0;
  if (t.tx1h && t.tx1h.sells >= 10 && t.tx1h.sells > 2 * Math.max(1, t.tx1h.buys)) r += 8;
  if (t.ch.h24 != null && t.ch.h24 <= -50) r += 8;
  if (t.ch.h1 != null && t.ch.h1 <= -30) r += 12;
  if (t.liq > 0 && t.vol24 / t.liq > 30) r += 8;
  return Math.max(3, Math.min(97, Math.round(r)));
}

/* [state, text]: state true is good, false is a warning, null is unknown */
export function signals(t, original) {
  const s = [];
  if (t.stock) return [[true, "Robinhood stock token: the price follows the underlying share"]];
  s.push(t.honeypot === true ? [false, "Fails the honeypot check: buyers may not be able to sell"] : t.honeypot === false ? [true, "Passes the honeypot check"] : [null, "Honeypot check not run yet"]);
  if (original) s.push([false, `Copies the ${t.symbol} ticker. The bigger, older one is ${original.address}`]);
  s.push([t.liq >= 50000, `Liquidity ${usd(t.liq)}${t.liq < 50000 ? ", thin: expect big price swings" : ""}`]);
  s.push(t.top10 == null ? [null, "Holder split not loaded yet"] : [t.top10 < 45, `Top 10 wallets hold ${t.top10.toFixed(0)}% (pool and burn addresses included)`]);
  if (t.holders != null) s.push([t.holders >= 1000, `${t.holders.toLocaleString()} holders`]);
  if (t.age != null) s.push([t.age >= 10080, `Trading for ${ago(t.age * 60000)}`]);
  if (t.devPct != null && t.devPct > 5) s.push([false, `Developer wallet holds ${t.devPct}%`]);
  if (t.tx1h && t.tx1h.sells >= 10 && t.tx1h.sells > 2 * Math.max(1, t.tx1h.buys)) s.push([false, `Heavy selling: ${t.tx1h.sells} sells vs ${t.tx1h.buys} buys this hour`]);
  if (t.ch.h1 != null && t.ch.h1 <= -30) s.push([false, `Fell ${Math.abs(t.ch.h1).toFixed(0)}% in the last hour`]);
  if (t.liq > 0 && t.vol24 / t.liq > 30) s.push([false, `24h volume is ${Math.round(t.vol24 / t.liq)}x liquidity, possible wash trading`]);
  return s;
}
