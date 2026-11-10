import * as D from "./data.js";
import * as R from "./risk.js";
import * as P from "./paper.js";
import { green, dim, amber, red, blue, bold, usd, price, eth, pct, amount, short, ago, table, log, riskTag } from "./ui.js";

/* Accept a contract address, or the ticker of a position you already hold. */
function resolve(s, arg) {
  if (D.isAddress(arg)) return arg.toLowerCase();
  const hit = Object.values(s.positions).find(p => (p.symbol || "").toUpperCase() === String(arg || "").replace(/^\$/, "").toUpperCase());
  if (hit) return hit.address.toLowerCase();
  throw new Error(arg ? `"${arg}" is not a contract address or a token you hold. Use the full 0x... address.` : "Give a contract address (0x...).");
}

async function analyse(ca) {
  const t = await D.token(ca);
  if (!t) throw new Error(`No token found at ${ca} on Robinhood Chain.`);
  const others = await D.sameTicker(t.symbol, t.address);
  const original = R.findOriginal(t, others);
  return { t, original, risk: R.score(t, original), sig: R.signals(t, original) };
}

function explain({ t, risk, sig, original }) {
  if (original) return `Careful. ${t.symbol} reuses a ticker that already exists at ${short(original.address)}. Check the address before you buy.`;
  const bad = sig.filter(x => x[0] === false).map(x => { const t = x[1].split(/[:,(]/)[0].trim(); return t.charAt(0).toLowerCase() + t.slice(1); });
  if (risk < 35) return `Looks steady for its size. ${bad.length ? "Watch for: " + bad.slice(0, 2).join(", ") + "." : "No red flags in the data right now."}`;
  if (risk < 65) return `Medium risk. ${bad.length ? "Main concerns: " + bad.slice(0, 3).join(", ") + "." : "Mostly unknowns, the data is still filling in."}`;
  return `High risk. ${bad.slice(0, 3).join(", ") || "Too little data to trust"}. Size small or skip.`;
}

export async function check(args) {
  const s = P.load(); const ca = resolve(s, args[0]);
  const a = await analyse(ca), t = a.t;
  console.log(`\n${bold(t.symbol)}  ${t.name}  ${dim(t.address)}`);
  console.log(`price ${price(t.price)}   24h ${pct(t.ch.h24)}   1h ${pct(t.ch.h1)}   mcap ${usd(t.mcap)}   liquidity ${usd(t.liq)}`);
  const where = t.curve && !t.curve.done ? `on the Pons bonding curve, ${t.curve.pct != null ? t.curve.pct.toFixed(2) + "% to graduation" : "progress unknown"}` : t.pons ? "launched on Pons, graduated to a DEX pool" : `trading on ${t.dex || "a DEX"}`;
  console.log(dim(where + (t.age != null ? `, pool opened ${ago(t.age * 60000)} ago` : "")));
  console.log(`\nrisk ${riskTag(a.risk)}`);
  for (const [ok, txt] of a.sig) console.log(" " + (ok === true ? green("ok") : ok === false ? red("!!") : dim("??")) + "  " + txt);
  console.log(`\n${blue("agent>")} ${explain(a)}\n${dim("A signal, not advice.")}\n`);
  return a;
}

export async function buy(args, flags) {
  let s = P.load(); const ca = resolve(s, args[0]);
  const ethIn = Number(args[1]);
  if (!(ethIn > 0)) throw new Error("Usage: sightline buy <contract> <eth amount> [--tp +50%] [--sl -20%]");
  const a = await analyse(ca);
  const t = a.t;
  const ethUsd = t.ethUsd > 500 ? t.ethUsd : (await D.prices([ca])).eth;
  if (!ethUsd) throw new Error("Could not read the ETH price. Try again in a minute.");
  if (a.original) log("risk", red(`copycat: the ${t.symbol} ticker already exists at ${a.original.address}`));
  if (a.risk >= 65 && !flags.force) throw new Error(`${t.symbol} scores ${a.risk}/100 (high risk). Add --force if you still want to paper-buy it.`);
  s = P.load();   // re-read in case watch changed it
  const h = P.buy(s, t, ethIn, ethUsd);
  const pos = s.positions[t.address.toLowerCase()];
  pos.liq = t.liq;
  if (flags.tp) pos.tp = { spec: flags.tp, price: P.target(flags.tp, pos.entry) };
  if (flags.sl) pos.sl = { spec: flags.sl, price: P.target(flags.sl, pos.entry) };
  P.save(s);
  log("paper", `${green("BUY")} ${amount(h.tokens)} ${t.symbol} for ${eth(ethIn)} at ${price(t.price)}  ${dim(`(impact ${(h.impact * 100).toFixed(2)}%, fee 1%)`)}`);
  log("risk", riskTag(a.risk) + "  " + dim(explain(a)));
  if (pos.tp) log("tp", `sell all at ${price(pos.tp.price)} (${pos.tp.spec})`);
  if (pos.sl) log("sl", `sell all at ${price(pos.sl.price)} (${pos.sl.spec})`);
  if (pos.tp || pos.sl) log("note", dim("TP and SL run while `sightline watch` is running."));
  log("wallet", `${eth(s.eth)} left in the paper wallet`);
}

export async function sell(args) {
  let s = P.load(); const k = resolve(s, args[0]);
  const frac = args[1] ? Number(String(args[1]).replace("%", "")) / 100 : 1;
  if (!(frac > 0 && frac <= 1)) throw new Error("Sell between 1% and 100%, for example: sightline sell <contract> 50%");
  const px = await D.prices([k]);
  const t = await D.token(k).catch(() => null);
  const p = px.tokens[k] ?? t?.price;
  if (!p) throw new Error("No price for this token right now.");
  s = P.load();
  const h = P.sell(s, k, frac, p, px.eth, t?.liq ?? s.positions[k]?.liq ?? 0, "manual");
  P.save(s);
  log("paper", `${red("SELL")} ${amount(h.tokens)} ${h.symbol} for ${eth(h.eth)} at ${price(p)}   pnl ${h.pnlEth >= 0 ? green("+" + h.pnlEth.toFixed(6)) : red(h.pnlEth.toFixed(6))} ETH`);
  log("wallet", `${eth(s.eth)} in the paper wallet`);
}

export async function setLevel(kind, args) {
  const s = P.load(); const k = resolve(s, args[0]); const pos = s.positions[k];
  if (!pos) throw new Error("You have no paper position in this token. Buy first, or pass --tp/--sl with buy.");
  if (!args[1]) throw new Error(`Usage: sightline ${kind} <contract> ${kind === "tp" ? "+50% | 2x | 0.0001" : "-20% | 0.00001"} (or "off")`);
  if (args[1] === "off") { pos[kind] = null; P.save(s); return log(kind, `${kind.toUpperCase()} removed for ${pos.symbol}`); }
  const tp = P.target(args[1], pos.entry);
  if (kind === "tp" && tp <= pos.entry * 0.999) log("note", amber("This take profit is below your entry price."));
  if (kind === "sl" && tp >= pos.entry * 1.001) log("note", amber("This stop loss is above your entry price."));
  pos[kind] = { spec: args[1], price: tp };
  P.save(s);
  log(kind, `${pos.symbol}: sell all at ${price(tp)} (${args[1]} from entry ${price(pos.entry)})`);
  log("note", dim("Runs while `sightline watch` is running."));
}

function positionRows(s, live) {
  return Object.values(s.positions).map(p => {
    const k = p.address.toLowerCase(), now = live?.tokens[k];
    const value = now != null && live.eth ? (p.tokens * now) / live.eth : null;
    const ch = now != null ? (now / p.entry - 1) * 100 : null;
    return [bold(p.symbol), amount(p.tokens), price(p.entry), price(now), pct(ch), value != null ? eth(value) : "—", p.tp ? price(p.tp.price) : dim("—"), p.sl ? price(p.sl.price) : dim("—")];
  });
}

export async function positions() {
  const s = P.load(); const keys = Object.keys(s.positions);
  if (!keys.length) { log("paper", `No open positions. ${eth(s.eth)} ready in the paper wallet. Try: sightline buy <contract> 0.05`); return; }
  const live = await D.prices(keys);
  console.log(table(["TOKEN", "AMOUNT", "ENTRY", "PRICE", "PNL", "VALUE", "TP", "SL"], positionRows(s, live), ["", "r", "r", "r", "r", "r", "r", "r"]));
  const open = keys.reduce((a, k) => a + ((live.tokens[k] ?? 0) * s.positions[k].tokens) / (live.eth || Infinity), 0);
  const total = s.eth + open;
  console.log(dim(`\ncash ${eth(s.eth)}   in positions ${eth(open)}   total ${eth(total)}   since start `) + pct((total / s.startEth - 1) * 100));
}

export function history() {
  const s = P.load();
  if (!s.history.length) return log("paper", "No trades yet.");
  console.log(table(["TIME", "SIDE", "TOKEN", "AMOUNT", "ETH", "PRICE", "PNL", "WHY"], s.history.slice(-25).map(h => [
    new Date(h.time).toISOString().replace("T", " ").slice(0, 16), h.side === "buy" ? green("BUY") : red("SELL"), h.symbol, amount(h.tokens),
    h.eth.toFixed(6), price(h.price), h.pnlEth == null ? dim("—") : h.pnlEth >= 0 ? green("+" + h.pnlEth.toFixed(6)) : red(h.pnlEth.toFixed(6)), h.reason || "",
  ]), ["", "", "", "r", "r", "r", "r", ""]));
}

export function balance() { const s = P.load(); log("wallet", `${eth(s.eth)} in the paper wallet, ${Object.keys(s.positions).length} open positions`); }

export function reset(flags) {
  const e = flags.eth ? Number(flags.eth) : P.START_ETH;
  if (!(e > 0)) throw new Error("Use a positive amount, for example: sightline reset --eth 1");
  P.save(P.fresh(e)); log("paper", `Reset. ${eth(e)} in the paper wallet, no positions.`);
}

/* The loop that makes TP and SL work: checks prices every few seconds and sells when a level is hit. */
export async function watch(flags) {
  const every = Math.max(10, Number(flags.every || 20));
  const tty = process.stdout.isTTY;
  log("watch", `Watching your positions every ${every}s on Robinhood Chain. Ctrl+C to stop.`);
  let stop = false; process.on("SIGINT", () => { stop = true; console.log("\n" + dim("watch stopped")); process.exit(0); });
  process.on("SIGTERM", () => process.exit(0));
  while (!stop) {
    try {
      let s = P.load(); const keys = Object.keys(s.positions);
      if (keys.length) {
        const live = await D.prices(keys);
        for (const k of keys) {
          const p = s.positions[k], now = live.tokens[k];
          if (now == null || !live.eth) continue;
          const hitTp = p.tp && now >= p.tp.price, hitSl = p.sl && now <= p.sl.price;
          if (hitTp || hitSl) {
            const t = await D.token(k).catch(() => null);
            s = P.load(); if (!s.positions[k]) continue;
            const h = P.sell(s, k, 1, now, live.eth, t?.liq ?? p.liq ?? 0, hitTp ? "take profit" : "stop loss");
            P.save(s);
            log(hitTp ? "tp" : "sl", `${hitTp ? green("TAKE PROFIT") : red("STOP LOSS")} ${p.symbol}: sold ${amount(h.tokens)} at ${price(now)} for ${eth(h.eth)}, pnl ${h.pnlEth >= 0 ? green("+" + h.pnlEth.toFixed(6)) : red(h.pnlEth.toFixed(6))} ETH`);
          }
        }
        s = P.load();
        if (Object.keys(s.positions).length) {
          if (tty) console.log("\n" + dim(new Date().toLocaleTimeString()) + "\n" + table(["TOKEN", "AMOUNT", "ENTRY", "PRICE", "PNL", "VALUE", "TP", "SL"], positionRows(s, live), ["", "r", "r", "r", "r", "r", "r", "r"]));
          else log("watch", Object.values(s.positions).map(p => `${p.symbol} ${price(live.tokens[p.address.toLowerCase()])}`).join("  "));
        }
      } else if (tty) process.stdout.write(dim(`\r${new Date().toLocaleTimeString()}  no open positions, waiting...   `));
    } catch (e) { log("watch", amber(e.message)); }
    if (flags.once) break;
    await new Promise(r => setTimeout(r, every * 1000));
  }
}
