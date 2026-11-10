/* Paper trading: real prices, simulated balance. State lives in ~/.sightline/paper.json (or $SIGHTLINE_HOME). */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const HOME = process.env.SIGHTLINE_HOME || join(homedir(), ".sightline");
const FILE = join(HOME, "paper.json");
export const FEE = 0.01;          // 1% trading fee, like a Pons curve or DEX swap
export const START_ETH = 1;

export function load() {
  if (!existsSync(FILE)) return fresh(START_ETH);
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { throw new Error(`Could not read ${FILE}. Fix or delete it, or run: sightline reset`); }
}
export function save(s) {
  mkdirSync(HOME, { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, FILE);
}
export function fresh(eth) { return { version: 1, startEth: eth, eth, positions: {}, history: [] }; }
export function journal(line) { mkdirSync(HOME, { recursive: true }); appendFileSync(join(HOME, "trades.log"), `${new Date().toISOString()} ${line}\n`); }

/* Price impact from pool depth: the same estimate the website uses. */
export const impact = (usdIn, liq) => (liq > 0 ? usdIn / (liq / 2 + usdIn) : 0.5);

export function buy(s, t, ethIn, ethUsd) {
  if (!(ethIn > 0)) throw new Error("Amount must be more than 0 ETH.");
  if (ethIn > s.eth + 1e-12) throw new Error(`Not enough paper ETH: you have ${s.eth.toFixed(6)} ETH.`);
  if (!(t.price > 0)) throw new Error("This token has no price yet, so it can't be bought.");
  const usdIn = ethIn * ethUsd, imp = impact(usdIn, t.liq);
  const tokens = (usdIn * (1 - FEE) * (1 - imp)) / t.price;
  const k = t.address.toLowerCase();
  const p = s.positions[k] || { address: t.address, symbol: t.symbol, name: t.name, tokens: 0, costEth: 0, costUsd: 0, openedAt: Date.now(), tp: null, sl: null };
  p.tokens += tokens; p.costEth += ethIn; p.costUsd += usdIn;
  p.entry = p.costUsd / p.tokens;          // average entry price in USD, fees included
  s.positions[k] = p;
  s.eth -= ethIn;
  const h = { time: Date.now(), side: "buy", address: t.address, symbol: t.symbol, tokens, eth: ethIn, price: t.price, impact: imp };
  s.history.push(h);
  journal(`BUY ${t.symbol} ${tokens} for ${ethIn} ETH at $${t.price}`);
  return h;
}

export function sell(s, k, frac, priceUsd, ethUsd, liq, reason = "manual") {
  const p = s.positions[k];
  if (!p) throw new Error("You have no paper position in this token.");
  frac = Math.min(1, Math.max(0, frac));
  const tokens = p.tokens * frac;
  const usdGross = tokens * priceUsd, imp = impact(usdGross, liq);
  const ethOut = (usdGross * (1 - FEE) * (1 - imp)) / ethUsd;
  const costPart = p.costEth * frac;
  s.eth += ethOut;
  p.tokens -= tokens; p.costEth -= costPart; p.costUsd -= p.costUsd * frac;
  if (frac >= 0.9999 || p.tokens <= 0) delete s.positions[k];
  const h = { time: Date.now(), side: "sell", address: p.address, symbol: p.symbol, tokens, eth: ethOut, price: priceUsd, pnlEth: ethOut - costPart, reason };
  s.history.push(h);
  journal(`SELL ${p.symbol} ${tokens} for ${ethOut} ETH at $${priceUsd} (${reason}), pnl ${h.pnlEth} ETH`);
  return h;
}

/* "+50%", "-20%", "2x", "$0.0001" or "0.0001" into a target price */
export function target(spec, entry) {
  const v = String(spec).trim().toLowerCase();
  let m;
  if ((m = v.match(/^([+-]?\d+(?:\.\d+)?)%$/))) return entry * (1 + Number(m[1]) / 100);
  if ((m = v.match(/^(\d+(?:\.\d+)?)x$/))) return entry * Number(m[1]);
  if ((m = v.match(/^\$?(\d+(?:\.\d+)?(?:e-?\d+)?)$/))) return Number(m[1]);
  throw new Error(`Can't read "${spec}". Use +50%, -20%, 2x or a price like 0.0001.`);
}
