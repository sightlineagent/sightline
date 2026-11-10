/* Terminal output helpers: colors, number formats and tables. Colors turn off when output is not a terminal or NO_COLOR is set. */
const on = process.stdout.isTTY && !process.env.NO_COLOR;
const c = code => s => (on ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const green = c("38;5;84"), dim = c("38;5;65"), amber = c("38;5;221"), red = c("38;5;203"), blue = c("38;5;147"), bold = c("1");

export const usd = n => n == null || isNaN(n) ? "—" : Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + n.toFixed(2);
export const price = p => p == null || isNaN(p) ? "—" : p >= 1 ? "$" + p.toFixed(4) : "$" + p.toPrecision(4);
export const eth = n => n == null || isNaN(n) ? "—" : n.toFixed(n >= 1 ? 4 : 6) + " ETH";
export const pct = n => n == null || isNaN(n) ? "—" : (n >= 0 ? green : red)((n >= 0 ? "+" : "-") + Math.abs(n).toFixed(2) + "%");
export const amount = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(2) + "K" : n.toFixed(2);
export const short = a => a ? a.slice(0, 6) + "..." + a.slice(-4) : "—";
export const ago = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };

const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, "");
export function table(head, rows, align = []) {
  const w = head.map((h, i) => Math.max(strip(h).length, ...rows.map(r => strip(r[i]).length)));
  const pad = (s, i) => { const n = w[i] - strip(s).length; return align[i] === "r" ? " ".repeat(n) + s : s + " ".repeat(n); };
  const line = r => r.map(pad).join("   ");
  return [dim(line(head)), ...rows.map(line)].join("\n");
}
export const log = (tag, msg) => console.log(dim(`[${tag}]`.padEnd(8)) + " " + msg);
export const riskTag = r => r == null ? dim("—") : r < 35 ? green(`${r} LOW`) : r < 65 ? amber(`${r} MED`) : red(`${r} HIGH`);
