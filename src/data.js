/* Live Robinhood Chain market data from the GeckoTerminal public API (no key needed, about 30 calls a minute). */
const GT = (process.env.SIGHTLINE_GT || "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");
const NET = "robinhood";
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));

export const isAddress = s => /^0x[0-9a-fA-F]{40}$/.test(s || "");

async function get(path, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(GT + path, { headers: { accept: "application/json" } });
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      last = new Error(`GeckoTerminal answered ${r.status}`);
      if (r.status === 429) { await sleep(2500 * (i + 1)); continue; }
    } catch (e) { last = e; }
    await sleep(1000 * (i + 1));
  }
  throw new Error(`Market data is unavailable right now (${last ? last.message : "no answer"}). Try again in a minute.`);
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
  const [t, pools, info] = await Promise.all([
    get(`/networks/${NET}/tokens/${addr}`),
    get(`/networks/${NET}/tokens/${addr}/pools?page=1`),
    get(`/networks/${NET}/tokens/${addr}/info`).catch(() => null),
  ]);
  if (!t?.data) return null;
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
    pons: /pons/.test(main.dex || "") || (i.gt_category_ids || []).includes("pons-launchpad"),
    stock: /Robinhood Token/i.test(a.name || ""),
  };
}

/* Other tokens on Robinhood Chain that use the same ticker, to catch copycats. */
export async function sameTicker(symbol, address) {
  if (!symbol) return [];
  const j = await get(`/search/pools?query=${encodeURIComponent(symbol)}&network=${NET}&include=base_token`).catch(() => null);
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
