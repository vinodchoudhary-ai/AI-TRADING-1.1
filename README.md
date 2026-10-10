# Aurum Desk

Charts, indicators and measured rule-based strategies for XAU/USD and BTC/USD. Educational only; it never places trades and is not investment advice.

- Live candlestick chart, 10 timeframes (1m to 1w), 3,000 candles of history
- Chart analysis: 17 working indicator toggles (EMA, structure/BOS/CHoCH, order blocks, FVG, support/resistance, Fibonacci, volume profile, liquidity levels, MACD/RSI, Bollinger, volume, "10 indicators in one", and more). Footprint, Bookmap and the liquidity heatmap are shown as unavailable: they need tick/order-book data
- Six trading strategies, each **backtested on the loaded history** (costs included, no look-ahead, recent 30% held back). The page says WAIT unless a strategy has a measured edge
- **Forward test:** a background job records every strategy's live setups before their outcome is known and scores them later with the same rules (Signals page)
- English and Hindi, light/dark/system theme, Ctrl+K search
- Email-and-password accounts (scrypt, HttpOnly sessions): saved settings, change password, sign out everywhere, email verification and password reset (needs SMTP)
- Security headers, rate limits, a quota-aware gold-data cache, accessibility-checked (axe: 0 violations)

## Develop

```bash
npm install
cp .env.example .env.local   # then add TWELVEDATA_API_KEY (optional; gold uses labelled sample data without it)
npm run dev                  # http://localhost:3000
npm run check                # typecheck + lint + unit tests
npm run smoke                # smoke-test a running server (default http://localhost:3000)
```

Requires Node 22.13+ (built with 24 LTS). The `.env.example` file lists every setting.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md): hosting constraints, configuration, running it, backups, the known gaps to read before going public, and a pre-launch checklist. A Dockerfile and compose file are included but have never been built (no Docker on the dev machine).

Other docs: [docs/gold-analyst-prompt.md](docs/gold-analyst-prompt.md) (saved prompt for a future AI phase, not used yet).
