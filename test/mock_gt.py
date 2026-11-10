# Mock of the GeckoTerminal endpoints the CLI uses, shaped like real responses. Prices come from test/prices.json so tests can move them.
import http.server, json, sys, os, re
from urllib.parse import urlparse, parse_qs
HERE = os.path.dirname(__file__)
WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
SL = "0x137b2be32719a2007d46c8fe8f8aeae31792e479"
PONS = "0x39dbed3a2bd333467115de45665cc57f813c4571"
FAKE = "0x83a9146affcd4e45ec584f2b710a66f2d13782c8"
TOK = {
  SL:   dict(name="Sightline", symbol="SIGHTLINE", liq=3841.5, holders=14, top10="100", hp=False, dev="1.7", created="2026-11-10T17:59:50Z", dex="pons-v2", lp={"graduation_percentage": 3.37, "completed": False}, h24="7.86", h1="7.86", tx={"buys": 51, "sells": 13}),
  PONS: dict(name="Pons", symbol="PONS", liq=1554847.6, holders=104521, top10="82.33", hp=False, dev=None, created="2026-07-13T20:42:21Z", dex="uniswap-v3-robinhood", lp=None, h24="-9.46", h1="-2.36", tx={"buys": 21, "sells": 72}),
  FAKE: dict(name="Pons", symbol="PONS", liq=43428.9, holders=202, top10="38.6", hp=None, dev=None, created="2026-11-10T16:15:16Z", dex="uniswap-v4-robinhood", lp=None, h24="0.11", h1="0", tx={"buys": 2, "sells": 2}),
}
def prices(): return json.load(open(os.path.join(HERE, "prices.json")))
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path); p = u.path; px = prices()
        m = re.match(r"^/simple/networks/robinhood/token_price/(.+)$", p)
        if m:
            out = {a: str(px.get(a, "")) for a in m.group(1).split(",") if a in px}
            return self.send({"data": {"attributes": {"token_prices": out}}})
        m = re.match(r"^/networks/robinhood/tokens/(0x[0-9a-f]{40})(/pools|/info)?$", p)
        if m:
            a, sub = m.group(1), m.group(2); t = TOK.get(a)
            if not t: return self.send({"errors": [{"status": "404"}]}, 404)
            if sub == "/pools":
                return self.send({"data": [{"attributes": {"address": "0xpool" + a[2:8], "reserve_in_usd": str(t["liq"]), "price_change_percentage": {"h1": t["h1"], "h24": t["h24"]}, "volume_usd": {"h24": "1377.9"}, "transactions": {"h1": t["tx"]}, "pool_created_at": t["created"], "quote_token_price_usd": str(px[WETH])}, "relationships": {"dex": {"data": {"id": t["dex"]}}}}]})
            if sub == "/info":
                return self.send({"data": {"attributes": {"holders": {"count": t["holders"], "distribution_percentage": {"top_10": t["top10"]} if t["top10"] else None}, "is_honeypot": t["hp"], "developer_holding_percentage": t["dev"], "gt_category_ids": [], "launchpad_details": t["lp"]}}})
            return self.send({"data": {"attributes": {"address": a, "name": t["name"], "symbol": t["symbol"], "price_usd": str(px[a]), "fdv_usd": str(px[a] * 1e9), "market_cap_usd": None, "launchpad_details": t["lp"]}}})
        if p == "/search/pools":
            q = parse_qs(u.query).get("query", [""])[0].upper()
            data, inc = [], []
            for a, t in TOK.items():
                if t["symbol"] == q:
                    data.append({"attributes": {"reserve_in_usd": str(t["liq"]), "pool_created_at": t["created"]}, "relationships": {"base_token": {"data": {"id": "robinhood_" + a}}}})
                    inc.append({"id": "robinhood_" + a, "type": "token", "attributes": {"address": a, "symbol": t["symbol"]}})
            return self.send({"data": data, "included": inc})
        self.send({"errors": [{"status": "404"}]}, 404)
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
