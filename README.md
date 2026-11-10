# Sightline CLI

The Sightline agent in your terminal. Check any token on Robinhood Chain, buy it, and let take profit and stop loss sell it for you.

This version runs in **paper mode**: prices are real and come live from Robinhood Chain, but the ETH balance is simulated. Nothing is signed and no wallet is needed. Live trading will come in a later version.

```
$ sightline check 0x83a9146affcd4e45ec584f2b710a66f2d13782c8

PONS  Pons  0x83a9146affcd4e45ec584f2b710a66f2d13782c8
risk 91 HIGH
 !!  Copies the PONS ticker. The bigger, older one is 0x39dbed3a...4571

agent> Careful. PONS reuses a ticker that already exists at 0x39db...4571.
```

## Install

Needs Node.js 18 or newer. Works on Linux, macOS, and Windows through Ubuntu on WSL.

```bash
cd ~ && git clone https://github.com/sightlineagent/sightline.git
echo 'alias sightline="node ~/sightline/bin/sightline.js"' >> ~/.bashrc && source ~/.bashrc
sightline         # shows all commands
```

There are no dependencies to install. If you prefer, `cd sightline && npm link` installs the command globally instead of the alias.

Quick start:

```bash
sightline check 0x137b2be32719a2007d46c8fe8f8aeae31792e479
sightline buy 0x137b2be32719a2007d46c8fe8f8aeae31792e479 0.05 --tp +50% --sl -20% --force
sightline watch   # keep this running in a second window
```

To update: `cd ~/sightline && git pull`.

## Commands

| Command | What it does |
|---|---|
| `sightline check <contract>` | Risk score from 3 to 97, with the reasons |
| `sightline buy <contract> <eth> [--tp X] [--sl Y]` | Paper buy, with optional take profit and stop loss |
| `sightline sell <contract or ticker> [percent]` | Paper sell, 100% by default |
| `sightline tp <contract or ticker> <+50% \| 2x \| price \| off>` | Set or remove take profit |
| `sightline sl <contract or ticker> <-20% \| price \| off>` | Set or remove stop loss |
| `sightline positions` | Open positions with live profit and loss |
| `sightline watch [--every 20]` | Checks prices and runs take profit and stop loss |
| `sightline history` | Your last 25 trades |
| `sightline balance` | ETH left in the paper wallet |
| `sightline reset [--eth 1]` | Start over with a fresh paper wallet |
| `sightline sync <key \| status \| off>` | Publish your paper wallet to the Live page on sightline-agent.xyz |

Examples:

```bash
sightline buy 0x137b2be32719a2007d46c8fe8f8aeae31792e479 0.05 --tp +50% --sl -20% --force
sightline tp SIGHTLINE 2x
sightline sl SIGHTLINE off
sightline watch
```

Take profit and stop loss are percentages from your average entry price (`+50%`, `-20%`), a multiple (`2x`), or an exact USD price (`0.000006`).

## How the paper fills work

- Prices come from GeckoTerminal's public API for Robinhood Chain. No API key is needed.
- Each buy and sell pays a 1% fee and a price impact estimated from the pool's liquidity, so thin pools cost more, as they would for real.
- Your entry price includes those costs.
- Tokens that score 65 or higher are refused unless you add `--force`.
- Everything is saved in `~/.sightline/`: `paper.json` holds the wallet and positions, `trades.log` keeps every fill.

## Show it on the website

`sightline sync <key>` publishes the paper wallet to [sightline-agent.xyz/#/live](https://www.sightline-agent.xyz/#/live). After that, every buy, sell, take profit, stop loss and level change is sent automatically, and `watch` sends a heartbeat every 10 minutes. Live prices on the page come from the chain, so nothing is sent while prices simply move.

Only the positions, levels, recent trades and paper balance are sent. The key is stored in `~/.sightline/sync.json` (readable only by you). `sightline sync off` stops publishing.

## Run it 24/7 on a VPS

Take profit and stop loss only work while `sightline watch` is running. On an Ubuntu or Debian VPS:

```bash
# 1. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. A user for the bot, and the code
sudo useradd -m -s /bin/bash sightline
sudo -iu sightline git clone https://github.com/sightlineagent/sightline.git

# 3. Keep `watch` running, and restart it after reboots
sudo cp /home/sightline/sightline/deploy/sightline-watch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sightline-watch

# 4. Check it
sudo systemctl status sightline-watch
sudo journalctl -u sightline-watch -f
```

Place trades as the same user, so `watch` sees them:

```bash
sudo -iu sightline
echo 'alias sightline="node ~/sightline/bin/sightline.js"' >> ~/.bashrc && source ~/.bashrc
sightline buy <contract> 0.05 --tp +50% --sl -20%
```

To update later: `cd ~/sightline && git pull`, then `sudo systemctl restart sightline-watch`.

## Notes

- The risk model is the same one used on [sightline-agent.xyz](https://www.sightline-agent.xyz). It is a signal, not advice.
- GeckoTerminal allows about 30 requests a minute. `watch` uses one request per check for all positions, plus one when a level is hit.
- Run the tests with `npm test` (needs Python 3).

Follow [@sightlineagent](https://x.com/sightlineagent) on X.
