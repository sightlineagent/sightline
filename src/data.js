/* Live Robinhood Chain market data from the GeckoTerminal public API (no key needed, about 30 calls a minute). */
const GT = (process.env.SIGHTLINE_GT || "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");
const NET = "robinhood";
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const sleep = ms => new Promise(r => setTimeout(r, ms));
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
/* Short disk cache so `check` then `buy` doesn't ask GeckoTerminal for the same data twice (free tier is about 30 calls a minute). */
const CACHE_DIR = join(process.env.SIGHTLINE_HOME || join(homedir(), ".sightline"), "cache");
const cacheFile = path => join(CACHE_DIR, path.replace(/[^a-z0-9]+/gi, "_").slice(0, 180) + ".json");
function cacheGet(path, ttl) { try { const c = JSON.parse(readFileSync(cacheFile(path), "utf8")); return Date.now() - c.at < ttl ? c.body : undefined; } catch { return undefined; } }
function cachePut(path, body) { try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(cacheFile(path), JSON.stringify({ at: Date.now(), body })); } catch {} }
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));

export const isAddress = s => /^0x[0-9a-fA-F]{40}$/.test(s || "");

async function get(path, ttl = 0, tries = 4) {
  if (ttl) { const hit = cacheGet(path, ttl); if (hit !== undefined) return hit; }
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(GT + path, { headers: { accept: "application/json" } });
      if (r.ok) { const j = await r.json(); if (ttl) cachePut(path, j); return j; }
      if (r.status === 404) return null;
      last = new Error(`GeckoTerminal answered ${r.status}`);
      if (r.status === 429) {
        const wait = Number(r.headers.get("retry-after")) * 1000 || [4000, 8000, 15000, 20000][i];
        if (process.stderr.isTTY) process.stderr.write(`\rrate limited by GeckoTerminal, retrying in ${Math.round(wait / 1000)}s...   `);
        await sleep(wait); continue;
      }
    } catch (e) { last = e; }
    await sleep(1000 * (i + 1));
  }
  throw new Error(`Market data is unavailable right now (${last ? last.message : "no answer"}). Wait a minute and try again.`);
}

/* Prices in USD for several tokens and ETH, in one call. */
export async function prices(addrs) {
  const list = [...new Set([...addrs.map(a => a.toLowerCase()), WETH])];
  const j = await get(`/simple/networks/${NET}/token_price/${list.join(",")}`);
  const p = j?.data?.attributes?.token_prices || {};
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k.toLowerCase()] = num(v);
  return { eth: out[WETH], tokens: out };
}

/* Everything the risk check needs for one token. */
export async function token(ca) {
  const addr = ca.toLowerCase();
  const t = await get(`/networks/${NET}/tokens/${addr}`, 45000);
  if (!t?.data) return null;
  const pools = await get(`/networks/${NET}/tokens/${addr}/pools?page=1`, 45000);
  const info = await get(`/networks/${NET}/tokens/${addr}/info`, 300000).catch(() => null);
  const a = t.data.attributes, i = info?.data?.attributes || {};
  const plist = (pools?.data || []).map(p => ({
    address: p.attributes.address, dex: p.relationships?.dex?.data?.id || "",
    liq: num(p.attributes.reserve_in_usd) || 0, ch: p.attributes.price_change_percentage || {},
    vol: p.attributes.volume_usd || {}, tx: p.attributes.transactions || {},
    created: p.attributes.pool_created_at, ethUsd: num(p.attributes.quote_token_price_usd),
  })).sort((x, y) => y.liq - x.liq);
  const main = plist[0] || {};
  const lp = a.launchpad_details || i.launchpad_details || null;
  return {
    address: a.address, name: a.name, symbol: a.symbol,
    price: num(a.price_usd), fdv: num(a.fdv_usd), mcap: num(a.market_cap_usd) || num(a.fdv_usd),
    pool: main.address || null, dex: main.dex || null, liq: main.liq || 0,
    ch: { m5: num(main.ch?.m5), h1: num(main.ch?.h1), h6: num(main.ch?.h6), h24: num(main.ch?.h24) },
    vol24: num(main.vol?.h24) || 0, tx1h: main.tx?.h1 || null,
    age: main.created ? Math.max(1, Math.round((Date.now() - Date.parse(main.created)) / 60000)) : null,
    holders: i.holders ? num(i.holders.count) : null,
    top10: i.holders?.distribution_percentage ? num(i.holders.distribution_percentage.top_10) : null,
    honeypot: i.is_honeypot === true ? true : i.is_honeypot === false ? false : null,
    devPct: num(i.developer_holding_percentage),
    curve: lp ? { pct: num(lp.graduation_percentage), done: !!lp.completed } : null,
    ethUsd: main.ethUsd || null,
    pons: /pons/.test(main.dex || "") || (i.gt_category_ids || []).includes("pons-launchpad"),
    stock: /Robinhood Token/i.test(a.name || ""),
  };
}

/* Other tokens on Robinhood Chain that use the same ticker, to catch copycats. */
export async function sameTicker(symbol, address) {
  if (!symbol) return [];
  const j = await get(`/search/pools?query=${encodeURIComponent(symbol)}&network=${NET}&include=base_token`, 300000).catch(() => null);
  const toks = new Map((j?.included || []).filter(x => x.type === "token").map(x => [x.id, x.attributes]));
  const seen = new Map();
  for (const p of j?.data || []) {
    const b = toks.get(p.relationships?.base_token?.data?.id);
    if (!b || (b.symbol || "").toUpperCase() !== symbol.toUpperCase()) continue;
    if ((b.address || "").toLowerCase() === address.toLowerCase()) continue;
    const liq = num(p.attributes.reserve_in_usd) || 0;
    const prev = seen.get(b.address);
    if (!prev || liq > prev.liq) seen.set(b.address, { address: b.address, liq, created: p.attributes.pool_created_at });
  }
  return [...seen.values()];
}
