/* Publishes the paper wallet to sightline-agent.xyz/#/live. Only runs after `sightline sync <key>`. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { HOME } from "./paper.js";

const FILE = join(HOME, "sync.json");
export const DEFAULT_URL = "https://www.sightline-agent.xyz/api/live";

export function config() { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return null; } }
export function saveConfig(c) { mkdirSync(HOME, { recursive: true }); writeFileSync(FILE, JSON.stringify(c, null, 2), { mode: 0o600 }); }
export function clearConfig() { if (existsSync(FILE)) unlinkSync(FILE); }

/* Sends only what the Live page shows: positions, levels, recent trades and the paper balance. */
export function snapshot(s) {
  return {
    source: "sightline-cli", startEth: s.startEth, eth: s.eth,
    positions: Object.values(s.positions).map(p => ({ address: p.address, symbol: p.symbol, name: p.name, tokens: p.tokens, entry: p.entry, costEth: p.costEth, openedAt: p.openedAt, tp: p.tp, sl: p.sl })),
    history: s.history.slice(-30),
  };
}

let lastSent = "";
/* Returns null when sync is off, true on success, or an error message. Never throws. */
export async function publish(s, force = false) {
  const c = config(); if (!c || !c.key) return null;
  const body = JSON.stringify(snapshot(s));
  if (!force && body === lastSent) return true;
  try {
    const r = await fetch(c.url || DEFAULT_URL, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.key }, body, signal: AbortSignal.timeout(10000) });
    if (r.status === 401) return "the website refused the sync key";
    if (!r.ok) return `the website answered ${r.status}`;
    lastSent = body; return true;
  } catch (e) { return "could not reach the website"; }
}
