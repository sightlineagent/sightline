/* End-to-end test against a local mock of GeckoTerminal: npm test (needs python3). */
import { spawn, execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8799 + Math.floor(Math.random() * 200);
const SL = "0x137b2be32719a2007d46c8fe8f8aeae31792e479", PONS = "0x39dbed3a2bd333467115de45665cc57f813c4571", FAKE = "0x83a9146affcd4e45ec584f2b710a66f2d13782c8";
const pricesFile = join(here, "prices.json");
const base = { "0x0bd7d308f8e1639fab988df18a8011f41eacad73": 2026.55, [SL]: 0.000004036, [PONS]: 0.1407, [FAKE]: 0.1444 };
writeFileSync(pricesFile, JSON.stringify(base));
const mock = spawn("python3", [join(here, "mock_gt.py"), String(PORT)], { stdio: "ignore" });
const env = { ...process.env, SIGHTLINE_GT: `http://127.0.0.1:${PORT}`, SIGHTLINE_HOME: mkdtempSync(join(tmpdir(), "sl-")), NO_COLOR: "1" };
const cli = (...a) => { try { return { ok: true, out: execFileSync("node", [join(here, "../bin/sightline.js"), ...a], { env, encoding: "utf8" }) }; } catch (e) { return { ok: false, out: (e.stdout || "") + (e.stderr || "") }; } };
const setPrice = (k, v) => { const d = JSON.parse(readFileSync(pricesFile, "utf8")); d[k] = v; writeFileSync(pricesFile, JSON.stringify(d)); };
let fails = 0;
const expect = (name, cond, out) => { console.log((cond ? "pass " : "FAIL ") + name); if (!cond) { fails++; console.log(out); } };

await new Promise(r => setTimeout(r, 800));
try {
  let r = cli("check", FAKE); expect("copycat is flagged", r.ok && /Copies the PONS ticker/.test(r.out) && /HIGH/.test(r.out), r.out);
  r = cli("buy", FAKE, "0.1"); expect("high risk buy needs --force", !r.ok && /--force/.test(r.out), r.out);
  r = cli("buy", PONS, "0.2", "--tp", "2x", "--sl", "-15%"); expect("buy with tp and sl", r.ok && /BUY/.test(r.out) && /\[tp\]/.test(r.out), r.out);
  r = cli("buy", SL, "0.05", "--tp", "+50%", "--force"); expect("forced buy", r.ok, r.out);
  r = cli("sell", "PONS", "50%"); expect("sell half by ticker", r.ok && /SELL/.test(r.out), r.out);
  r = cli("tp", "SIGHTLINE", "banana"); expect("bad tp is rejected", !r.ok && /Can't read/.test(r.out), r.out);
  setPrice(SL, base[SL] * 1.7); r = cli("watch", "--once"); expect("take profit fires", /TAKE PROFIT SIGHTLINE/.test(r.out), r.out);
  setPrice(PONS, 0.11); r = cli("watch", "--once"); expect("stop loss fires", /STOP LOSS PONS/.test(r.out), r.out);
  r = cli("positions"); expect("no positions left", /No open positions/.test(r.out), r.out);
  r = cli("history"); expect("history has 5 trades", (r.out.match(/BUY|SELL/g) || []).length === 5, r.out);
  r = cli("buy", SL, "50", "--force"); expect("can't spend more than the balance", !r.ok && /Not enough paper ETH/.test(r.out), r.out);
} finally { mock.kill(); writeFileSync(pricesFile, JSON.stringify(base)); }
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
