#!/usr/bin/env node
/* Sightline CLI: the Sightline agent in your terminal. Paper mode: real Robinhood Chain prices, simulated balance. */
import * as C from "../src/commands.js";
import { green, dim, red, bold } from "../src/ui.js";

const HELP = `
${bold("sightline")} ${dim("paper mode: real prices from Robinhood Chain, simulated ETH balance")}

  ${green("check")} <contract>                     risk score and the reasons behind it
  ${green("buy")} <contract> <eth> [--tp X] [--sl Y]  paper buy, optional take profit and stop loss
  ${green("sell")} <contract|ticker> [percent]        paper sell, 100% by default
  ${green("tp")} <contract|ticker> <+50% | 2x | price | off>
  ${green("sl")} <contract|ticker> <-20% | price | off>
  ${green("positions")}                            open positions with live PnL
  ${green("watch")} [--every 20]                   runs TP and SL, keep it running
  ${green("history")}                              last trades
  ${green("balance")}                              paper ETH left
  ${green("reset")} [--eth 1]                      start over with a fresh paper balance

  ${dim("examples")}
  sightline check 0x137b2be32719a2007d46c8fe8f8aeae31792e479
  sightline buy 0x137b2be32719a2007d46c8fe8f8aeae31792e479 0.05 --tp +50% --sl -20%
  sightline tp SIGHTLINE 2x
  sightline watch
`;

function parse(argv) {
  const args = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else args.push(a);
  }
  return { args, flags };
}

const [cmd, ...rest] = process.argv.slice(2);
const { args, flags } = parse(rest);
const run = {
  check: () => C.check(args), buy: () => C.buy(args, flags), sell: () => C.sell(args),
  tp: () => C.setLevel("tp", args), sl: () => C.setLevel("sl", args),
  positions: () => C.positions(), pos: () => C.positions(), watch: () => C.watch(flags),
  history: () => C.history(), balance: () => C.balance(), reset: () => C.reset(flags),
}[cmd];

if (!run) { console.log(HELP); process.exit(cmd && !["help", "-h", "--help"].includes(cmd) ? 1 : 0); }
Promise.resolve(run()).catch(e => { console.error(red("error ") + e.message); process.exit(1); });
