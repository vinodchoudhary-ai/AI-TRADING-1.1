# Aurum Desk: deployment guide

Aurum Desk is a Next.js app that shows XAU/USD and BTC/USD charts, indicator overlays and rule-based strategies that are backtested on the loaded history. A background job records each strategy's live setups in a SQLite file and later scores them against what price actually did (a forward test). It never places trades.

**What I verified (Node 24.20, Windows):** `npm run check` (typecheck, lint, 198 unit tests) passes; `npm run build` succeeds; the **production server** (`next start`) passes `npm run smoke` with the account flow (34 checks: every page, robots/sitemap/manifest, security headers, CSRF guard, sign-up, change password, sign-out-everywhere, delete); the tracker ran against live gold and BTC data (5 of 5 targets, recording real setups); an automated accessibility scan (axe) found **0 violations** on all 12 pages in dark and light themes, plus the sign-up form, the search dialog and the signed-in Account page. **What I did not verify:** Docker (not installed here), any Linux host, the reverse proxy, systemd or the backup commands below, sending through a real email provider, and anything on a phone or browser other than the one built into the desktop app. Treat those as a starting point and test them on a staging machine before relying on them.

## 1. The one constraint that decides where you can host

The app keeps its history in a **SQLite file on disk** and runs its tracker as a **timer inside the server process**. So it needs a host where:

- one long-running Node process stays alive (not serverless functions that start and stop), and
- the disk persists across restarts and redeploys, and
- **exactly one copy runs**. Two copies would each run the job and write to the same file.

| Host type | Works? |
|---|---|
| A VPS or your own server (Linux/Windows) | Yes. This guide covers it. |
| A container platform with a persistent volume | Yes. A `Dockerfile` and `docker-compose.yml` are included but **have never been built or run** (no Docker on the dev machine); see section 16. |
| Vercel, Netlify, Cloudflare Pages and similar serverless hosts | **No.** The timer would not run reliably and the database file would be lost. Moving to a hosted Postgres plus a scheduled job is the fix, and it is not built. |

## 2. Requirements

- **Node.js 24 LTS** (what I tested with). `node:sqlite` is built into Node; versions older than 22.13 need an experimental flag, so don't go below 22.13.
- npm (comes with Node).
- A **Twelve Data API key** for real gold prices (see section 3).
- A domain name and HTTPS if the site will be public.

## 3. Configuration

Create a file named `.env.local` next to `package.json` on the server. It is git-ignored; never commit it.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TWELVEDATA_API_KEY` | For real gold data | none | Without it, gold shows clearly labelled **sample** data and the tracker skips gold. |
| `GOLD_DAILY_BUDGET` | No | `700` | Twelve Data calls the server may make per UTC day. Set it a little under your plan's allowance (the free plan is about 800). When spent, older cached data is served (section 17). |
| `JOB_INTERVAL_MIN` | No | `10` | Minutes between tracker runs (minimum 1). |
| `DATABASE_FILE` | No | `data/aurum.db` | Path to the SQLite file. Point it at your persistent disk. |
| `PORT` | No | `3000` | Port the server listens on. |
| `NEXT_PUBLIC_SITE_OPERATOR`, `NEXT_PUBLIC_SITE_CONTACT_EMAIL`, `NEXT_PUBLIC_SITE_JURISDICTION` | **Yes before launch** | placeholders | Who operates the site. Shown on the public Privacy and Terms pages, so they must be real facts about you. **Read at build time** (set them before `npm run build`, or as Docker build args). Until all three are set, those pages show a visible "draft" notice. Optional `NEXT_PUBLIC_SITE_BRAND` renames the product. |
| `APP_URL` | **Yes in production** (for email) | none | Public address of the site, e.g. `https://yourdomain.com`. Used for the links in verification and reset emails. Without it, emails are not sent in production (section 14). |
| `SMTP_URL` | For email | none | Mail server, e.g. `smtps://user:password@smtp.example.com:465`. |
| `MAIL_FROM` | For email | none | Sender shown on emails, e.g. `Aurum Desk <noreply@yourdomain.com>`. |

Example:

```
TWELVEDATA_API_KEY=your_key_here
JOB_INTERVAL_MIN=10
DATABASE_FILE=/var/lib/aurum/aurum.db
```

**Key rotation (done for the development key, 2026-10-10).** The key used while building this was pasted into a chat, so it was replaced: Twelve Data now accepts the new key and rejects the old one (checked directly against their API), and the old key never appeared in git history. Keys live only in `.env.local`, which is git-ignored.

For the production server, use a **separate key**, not the development one. Create it on twelvedata.com, put it only in the server's environment, and if a key is ever pasted somewhere it shouldn't be, rotate it the same way: create a new key, delete the old one, then confirm the old one is rejected.

## 4. Build and run

```bash
npm ci
npm run check
npm run build
npm start
```

On start you should see `[job] signal tracker started, every 10 min` followed shortly by `[job] pass done: 5/5 targets, N new signal(s), M settled`. If you don't, the tracker is not running and history will stop updating. Fewer than `5/5` targets means a market could not be fetched; the line above it says which and why.

## 5. Keep it running (Linux example)

Create a dedicated user and put the app in `/opt/aurum-desk`. Example systemd unit, `/etc/systemd/system/aurum-desk.service`:

```ini
[Unit]
Description=Aurum Desk
After=network.target

[Service]
User=aurum
WorkingDirectory=/opt/aurum-desk
EnvironmentFile=/opt/aurum-desk/.env.local
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then `sudo systemctl enable --now aurum-desk` and check `journalctl -u aurum-desk -f`. On Windows, a process manager such as NSSM or PM2 does the same job.

## 6. HTTPS with a reverse proxy

Don't expose port 3000 directly. A minimal Caddy config (Caddy gets and renews HTTPS certificates itself):

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Open only ports 80 and 443 in the firewall.

## 7. Backups

The database is `data/aurum.db` (or your `DATABASE_FILE`), plus `-wal` and `-shm` files beside it while the app runs. Copying the main file by hand while the app is running can give an inconsistent backup, so use the included script, which uses SQLite's online backup and is safe while the app is running:

```bash
node scripts/backup.mjs /var/backups/aurum --keep 14
```

It writes one self-contained, dated `.db` file, **checks the copy is healthy before deleting any older one**, keeps the newest 14 (change with `--keep`), and never touches files that aren't its own backups. `deploy/aurum-backup.service` and `.timer` run it daily at 03:30 under systemd. **To restore:** stop the app, copy the chosen backup over the database file, start the app. Test a restore once on a spare machine.

Backups contain emails and password hashes: encrypt them, restrict who can read them, and copy them off the server. The script was tested (nine tests, plus a run against the live development database, which came out with matching row counts and a passing integrity check). It does not encrypt or upload anything.

## 8. After deploying, check

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://yourdomain.com/            # 200
curl -s https://yourdomain.com/api/signals | head -c 200                     # {"signals":[...]}
curl -s "https://yourdomain.com/api/gold?tf=1h" | head -c 120                # {"candles":[... (503 no-key means the key is missing)
```

Better still, run the included smoke test against the live address. It checks every page, the site files, the security headers, the CSRF guard and the public APIs, and creates nothing:

```bash
node scripts/smoke.mjs https://yourdomain.com
SMOKE_AUTH=1 node scripts/smoke.mjs https://yourdomain.com   # also signs up, changes the password, signs out everywhere and deletes a throwaway account
```

It exits with an error if any check fails. Then open the site, confirm the badge says **Live data** for both XAU/USD and BTC/USD, and check the log for the tracker's `pass done` line. Signals only appear when a strategy actually has a setup, so an empty list for a while is normal.

## 9. Updating and rolling back

```bash
git pull            # or copy the new files
npm ci
npm run build
sudo systemctl restart aurum-desk
```

Keep the previous build or a git tag so you can go back. The database schema is created automatically and has not changed so far; back up before any update that touches `src/server/db.ts`.

## 10. Known gaps: read before going public

These are real, and I have not fixed them.

1. **Twelve Data's free tier is small, even with the protections.** It allows about 800 calls a day. The server now caches each timeframe for a time suited to it (1 minute for 1m/3m/5m/15m up to 1 hour for weekly), shares one upstream call between simultaneous visitors, stops at `GOLD_DAILY_BUDGET` calls per day, and serves older data instead of failing (section 17). That makes running out hard, not impossible: many visitors across many fast timeframes can still spend the budget, after which fast timeframes serve stale gold for up to 6 hours, then fail and show labelled sample data. Public use of gold needs a paid plan.
2. **Data licensing.** Free market-data plans are usually for personal use. Showing the data on a public website may need a paid or redistribution licence. Check Twelve Data's terms. Binance's public market data has its own terms too.
3. **Binance may be blocked by region.** The BTC chart loads from `api.binance.com` in the *visitor's browser*, and the tracker calls it from *your server*. Binance restricts some countries (for example the US, which uses a separate site). If your server is in a blocked region, BTC tracking fails; the log will show `[job] BTCUSD ... skipped`.
4. **Rate limits are per process and per IP.** `/api/gold` and `/api/signals` allow 120 requests a minute per IP, and the sign-in routes have their own limits (section 12). They live in memory (reset on restart) and trust the first `X-Forwarded-For` value, so they only mean something behind your own reverse proxy (section 12). They will not stop a determined distributed attack; use your proxy or a CDN for that. Signal history is one shared record, not per user.
5. **Security headers are set, with one trade-off.** Every response carries a Content-Security-Policy, X-Frame-Options, nosniff, a referrer policy, a permissions policy and (in production) HSTS. The CSP allows inline scripts, because Next's own bootstrap and the no-flash theme script need them; a stricter nonce-based policy would force every page to render per request. The app renders no user-supplied HTML, which limits the risk. No Lighthouse performance run and no test on real phones or other browsers has been done.
6. **`npm audit` reports 5 high-severity issues, all in development tooling.** They sit in the linting chain (`eslint-config-next` > `@next/eslint-plugin-next` > `fast-glob` > `micromatch` > `braces`, a regular-expression slowdown) and are never shipped or run on the server: `npm audit --omit=dev` reports **0 vulnerabilities**. The suggested fix downgrades to Next 14 tooling and would break the project, so it was not applied. Re-check periodically.
7. **No strategy here has a proven edge, and none should be marketed as profitable.** The chart analysis (section 15) measures six strategies against history and says WAIT when none shows an edge, which on real data is most of the time. The background tracker (section 16) records every strategy's live setups and scores them later, and a strategy's win rate stays hidden until 20 of its signals have resolved.
8. **Legal and regulatory.** Publishing trading signals and discussing CFDs or crypto can be regulated where you or your visitors live (in India, SEBI rules may apply). The Risk, Privacy and Terms pages are text I wrote (see section 13); get all three reviewed by a qualified professional before launch. The Hindi text is also my own and needs a native-speaker review.
9. **Browser-only settings.** Language, theme and sidebar choices are stored per browser, not per user.
10. **The AI analyst prompt** in `docs/gold-analyst-prompt.md` is saved but not used. It needs an LLM key and data the app doesn't collect yet.

## 11. Pre-launch checklist

- [ ] New Twelve Data key created and the old one revoked
- [ ] `.env.local` on the server only, not in git
- [ ] `npm run check` and `npm run build` pass on the server
- [ ] `npm start` tested on the server (it passed on my Windows machine; repeat on the real host)
- [ ] The boot log shows `[preflight] configuration looks ready` (or only items you accept), then the tracker line; `/api/health` answers `ok`
- [ ] HTTPS working, only ports 80 and 443 open
- [ ] Daily backup scheduled and a restore tested
- [ ] Quota and data-licence plan decided (section 10, items 1 and 2)
- [ ] `NEXT_PUBLIC_SITE_OPERATOR`, `NEXT_PUBLIC_SITE_CONTACT_EMAIL` and `NEXT_PUBLIC_SITE_JURISDICTION` set before the build; the "Draft" banner on Privacy and Terms is gone
- [ ] Risk, Privacy and Terms pages reviewed by a lawyer; Hindi text reviewed by a native speaker
- [ ] HTTPS on, port 3000 not reachable from the internet, proxy passes `Host` and `X-Forwarded-*` (section 12)
- [ ] `APP_URL`, `SMTP_URL` and `MAIL_FROM` set; a real verification email and a real reset email received and the links worked (section 14)
- [ ] SPF, DKIM and DMARC set up for the sending domain so emails don't land in spam (section 14)
- [ ] `node scripts/smoke.mjs https://yourdomain.com` passes (and `SMOKE_AUTH=1` once)
- [ ] `GOLD_DAILY_BUDGET` set just under your Twelve Data plan's daily allowance
- [ ] If using Docker: the image built and run once with a volume, and the container's health check turned healthy (section 16)
- [ ] `npm audit` noted: 5 high findings, development tooling only; `npm audit --omit=dev` shows 0 (section 10, item 6)

## 12. Accounts and sign-in

Email-and-password accounts are built in (no external service). Sign up, sign in, sign out, **change password**, **sign out everywhere**, delete account, and save your language / theme / instrument / timeframe to your account.

**How it works**
- Passwords are hashed with scrypt (salted, parameters stored with the hash). The plain password is never stored or logged.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`aurum_session`, 30 days). Only a hash of the token is stored in the database, so a leaked database does not hand out live sessions.
- Sign-in, sign-up, sign-out, saving settings and deleting an account refuse requests whose `Origin` header is not this site (protection against cross-site request forgery).
- Sign-in is limited to 10 tries per email and 20 per IP per 15 minutes; sign-up to 5 per IP per hour; account deletion to 5 per 15 minutes. Unknown emails and wrong passwords give the same answer and take about the same time.
- Deleting an account needs the password again and removes the user and all their sessions.
- **Changing the password** needs the current password, keeps the browser that made the change signed in, and signs every *other* session out (so a stolen session or an old password stops working). "Sign out everywhere" ends every session including the current one. Both are rate limited and protected by the same origin check; a live run with two simultaneous sessions confirmed who stays signed in.

**What I verified (local, Node 24, Windows):** 25 automated tests (including real database runs for sign-up, duplicate email, sign-in, sessions, expiry, logout, saved settings and deletion); a `curl` run showing the origin check, validation, cookie flags, 401/409/429 responses and logout; and a browser run of sign-in (wrong then right password), reload keeping the session, applying saved settings, a wrong-password delete being refused, and a real delete. A server-side check afterwards found no leftover users or sessions.

**Required setup on a real host**
1. **Use HTTPS.** The `Secure` cookie flag is only set when the request arrived over HTTPS (`X-Forwarded-Proto`). Over plain HTTP the session cookie is sent unprotected.
2. **Your proxy must pass `Host` and set `X-Forwarded-For` / `X-Forwarded-Proto` itself.** Caddy's `reverse_proxy` does this by default. The origin check compares `Origin` with `Host`, and the IP rate limit trusts the first `X-Forwarded-For` entry, which anyone can fake if the app is reachable without your proxy. Keep port 3000 closed to the internet.
3. **Protect backups.** The database now holds emails and password hashes. Encrypt backups and restrict who can read them.

**Not built: read before launch**
- **Email verification and password reset exist but need an email service configured** (section 14). Without one in production, they switch off.
- **No two-factor sign-in and no admin screen.** To remove a user by hand: `sqlite3 data/aurum.db "DELETE FROM users WHERE email='x@y.com'"` (their sessions go with them).
- **Rate limits live in memory.** They reset when the app restarts and don't work across several copies (the app must run as one copy anyway).
- **No Google or other social sign-in.** That needs OAuth credentials from a Google Cloud project; it can be added on top.
- **Personal data rules.** You now store emails. Depending on where you and your users are (for example India's DPDP Act or the EU's GDPR) you may need a privacy policy, a legal basis, and a way to export or erase data. The in-app delete button covers erasure, and the Privacy and Terms pages exist (section 13), but they are templates, not legal advice. Get legal advice.
- **Settings are only synced on request.** Saving and applying settings are explicit buttons on the Account page; nothing syncs automatically.

## 13. Privacy and Terms pages

`/privacy` and `/terms` exist in English and Hindi, are linked from the footer on every page and from the sign-up form, and appear in Ctrl+K search. The text describes what the app does today: it stores an email, a hashed password, saved settings and a session cookie; keeps preferences in browser storage; holds the IP only in memory for rate limiting; uses no analytics or ad cookies; fetches gold from Twelve Data on the server and Bitcoin directly from Binance in the visitor's browser.

**You must do before launch**
1. Set `NEXT_PUBLIC_SITE_OPERATOR`, `NEXT_PUBLIC_SITE_CONTACT_EMAIL` and `NEXT_PUBLIC_SITE_JURISDICTION` (see section 3) **before building**: the operator's legal name, a real contact email and the governing jurisdiction. No code edit is needed. Until all three are set, both pages show a visible "Draft" banner (it disappears on its own once they are real values), and the boot log lists what is missing (section 18).
2. Update `legalUpdated` in `src/config/site.ts` whenever you change either text.
3. Have a lawyer review both pages, plus the Risk page. They are a plain-language starting point and are **not legal advice**. The liability limit, the "legal basis" wording and the governing-law clause in particular are generic.
4. Have a native Hindi speaker review the Hindi versions.

**Keep the text true.** If you add analytics, ads, a new data provider, email sending, payments or social sign-in, or change how long data is kept, update the Privacy page first. The text lives in `src/content/legal.ts`. A test checks that English and Hindi have the same structure and that no template placeholder is left unfilled.

**Known limits.** Consent is by notice next to the sign-up button ("By creating an account you agree..."), not a tick box. Some regimes expect an explicit tick box or a separate consent record. The pages say backups may keep a copy "for a limited time" without stating a period; state yours once you decide it. There is no cookie banner, which is acceptable only because the app sets no non-essential cookies.

## 14. Email: verification and password reset

**What it does**
- After sign-up, an email asks the user to confirm their address. Until they do, they can sign in but **cannot save settings to their account**. A banner on the Account page lets them resend the email (3 per hour).
- "Forgot password?" on the sign-in page emails a reset link. Using it sets a new password, **signs the user out everywhere**, and counts as confirming the email.
- Links are single-use. Verification links last 24 hours, reset links 1 hour. Asking for a new link cancels the old one. Only a hash of each token is stored.
- Emails are plain text in English followed by Hindi.

**Security choices worth knowing**
- The reset page answers the same way whether or not the email has an account, and the email is sent after the reply, so it can't be used to find out who is registered. Reset requests are limited to 3 per email and 10 per IP per hour.
- Email links are built from **`APP_URL`**, never from the request's `Host` header, which attackers can forge to point a victim's reset link at their own site. In production with no `APP_URL`, emails are not sent at all.
- Opening a link only shows a button; the token is used when the person presses it. This stops mail scanners and link previews from using up the link.
- The `/reset` and `/verify` pages send `Referrer-Policy: no-referrer` so the token in the URL is not passed to other sites.
- A too-short new password is rejected *before* the reset link is consumed, so a typo doesn't waste the link.

**How the three modes work**

| Situation | What happens |
|---|---|
| `SMTP_URL` and `MAIL_FROM` set | Real email through your provider. |
| Development (not production) with no SMTP | Emails are **not sent**; they are written to `data/outbox.log` so you can click the links locally. |
| Production with no SMTP | Email features are off. The sign-in pages say reset is unavailable, and saving settings does **not** require a verified email (otherwise nobody could ever verify). |

**Setting it up**
1. Pick an email provider that offers SMTP (any transactional provider, or your own mail server). Create an SMTP user and note the host, port and password.
2. Put `SMTP_URL`, `MAIL_FROM` and `APP_URL` in `.env.local` (see section 3). Percent-encode special characters in the SMTP password inside the URL.
3. Send yourself a real verification and reset email and click through both.
4. **Set up SPF, DKIM and DMARC** for the domain in `MAIL_FROM` (your provider documents how). Without them, many inboxes will put these emails in spam, and users will think reset is broken.

**What I verified (local, Node 24, Windows):** 45 automated tests plus the SMTP test, including the real SMTP transport against a local test mail server (correct sender, recipient and link; an unreachable server returns a failure without crashing). A live `curl` run of the full flow, and the same flow through the browser screens: sign up, unverified banner, a refused save while unverified, the verify page, a weak new password rejected without burning the link, a successful reset, the old password refused, and sign-in with the new one. Throwaway accounts were deleted and the database checked clean. An old database without the verification column was migrated automatically.

**What I did not verify**
- Sending through a **real** email provider (TLS, authentication, deliverability, spam placement). The transport is the standard nodemailer SMTP client, but I have not sent a real email.
- The `APP_URL` rule against a live forged `Host` header in production mode; it is covered by a unit test only.
- Anyone who can read a user's email can reset their password. That is how email reset works everywhere; there is no second factor.
- Rate limits are in memory (reset on restart).

## 15. Chart analysis, strategies and backtests

**What it is.** The chart page has an indicator panel (six groups, like the reference screen), overlays drawn on the chart (zones, levels, markers, extra panes), a "10 Indicators in One" agreement card, six trading strategies, and a table of how each strategy actually performed on the candles loaded on screen.

**Indicator toggles.** 22 in total. Working: Scalping, Smart Money, Volatility Zones, Volume Profile S/R, Auto Fib, S/R Zones, EMA 9/21/50/200, Trend Line + Pattern, Market Direction, Structure (HH/HL/LH/LL, BOS, CHoCH), FVG, Order Block, Candle Analysis, MACD + RSI, BOLL, 10 Indicators in One, Liquidity Levels (equal highs/lows, previous day/week high/low), Trading Volume (BTC only) and Volume Delta (BTC only). **Not available, shown crossed out with the reason:** Footprint, Bookmap and Liquidity Heatmap. They need tick-by-tick or order-book data, which neither feed provides. Gold has no volume in the Twelve Data feed, so volume tools are off for it; BTC volume delta uses Binance's real taker-buy volume.

**Strategies:** trend pullback, liquidity sweep reversal, breakout and retest, smart money (BOS + order block / FVG), range fade, momentum cross. Every setup has an entry, a stop beyond structure/ATR, a target, and a minimum 1.5 reward:risk. Definitions of "order block", "fair value gap" and "break of structure" vary between traders; these are one reasonable, documented version (`src/lib/analysis/`).

**How "win rate" is measured, not promised**
- Each strategy is replayed over the loaded history (up to 3,000 candles) one candle at a time, using only data that existed at that moment.
- A candle that touches both stop and target counts as a **loss**. Execution cost is charged (0.01% for gold, 0.02% for BTC; these are assumptions, not your broker's real spread). Trades still open when the data ends are not counted. One trade at a time per strategy.
- The most recent 30% of history is held back as a separate check.
- A strategy is labelled **Edge shown** only with at least 30 trades, a win rate statistically above break-even, positive expectancy, *and* a positive recent-30% result; **Early evidence** needs 20+ trades, more than +0.15R per trade and a positive recent-30% result; everything else is **No measured edge**.
- The headline says **WAIT** unless a strategy with a label has an actionable setup on the last *closed* candle. An unlabelled setup is listed but is only drawn on the chart if the user presses "Show on chart".

**What I verified (local, Node 24, Windows):** the analysis tests (now part of the 170 in total). Highlights: a test that proves no strategy sees the future (signals from the full history equal signals from only the candles up to that bar, checked on real setups for every strategy), plus a deliberately cheating strategy that the test catches; stop/target/both-hit/timeout/cost behaviour of the simulator; the statistics and labels; a false-positive guard. **On pure random prices, where no edge exists, 0 of 900 strategy runs were called "Edge shown" and 0.3% earned "Early evidence"** (a looser first version of the rule fired 9.8% of the time by luck, which is why it was tightened). In the browser: real gold and BTC data, all 10 timeframes loading (3m built from 1-minute candles), panes for RSI/MACD/volume/delta, a clean console, no horizontal scroll on a phone, Hindi labels.

**What the real results look like.** On the day this was built, with real data: gold 15m showed **no** measured edge for any strategy; BTC 15m showed "Early evidence" for the momentum cross; weekly gold (about 1,900 closed weekly candles, decades of history) showed "Edge shown" for trend pullback and smart money. Treat all of these with care: six strategies x ten timeframes x two markets is 120 tests, so some will pass by luck even with the guard; weekly history spans very different eras; and costs here are assumptions. **A label means "this did not fail the test on this sample", not "this will make money".**

**Known limits**
1. **No proven edge.** Classic retail strategies mostly lose after costs, and the page shows that. Do not describe the product as producing high-win-rate trades.
2. **Backtests are small.** Many strategies make only 5 to 80 trades on the available history, so statistics are noisy.
3. **Forward results take time.** The tracker (section 16) records the strategies' live setups, but a strategy's win rate stays hidden until 20 of its signals have resolved, which can take weeks on slow timeframes.
4. **Costs and fills are simplified:** fixed percentage cost, fills at the closing price, no slippage in fast markets, no position sizing, no real broker rules.
5. **Analysis only runs on real data.** With sample data (no Twelve Data key) it is switched off and the page says so.
6. **Computed in the browser** (about 50 to 100 ms for 3,000 candles). Fine for one user; nothing is shared or stored.

**Data and quota.** History is now 3,000 candles per market and timeframe (BTC: three Binance requests the first time; gold: one Twelve Data call, one credit). After that the page asks only for the newest 6 candles every 15 seconds (`/api/gold?tf=..&tail=6`), served from the server's per-timeframe cache, so the refresh does not add Twelve Data credits. Gold "3m" candles are built from up to 5,000 one-minute candles, so about 1,600 3m candles (roughly 3 trading days). Duplicate or malformed candles from a feed are removed before use. The tracker reuses the same cached 3,000-candle responses, so it shares calls with the page.

## 16. Forward tracking and the Signals page

**What the tracker does.** Every `JOB_INTERVAL_MIN` minutes (default 10) the server runs the same analysis as the chart page on five targets (gold 15m and 1h; BTC 15m, 1h and 4h). For each target it (1) **settles** earlier open signals by replaying the candles that followed them, then (2) **records** whatever setup each of the six strategies has on the last closed candle. A signal is saved *before* its result is known, together with the strategy's backtest label at that moment. The log line `[job] pass done: 5/5 targets, N new signal(s), M settled` summarises each pass.

**Settling uses exactly the backtest's rules:** stop and target checked candle by candle, a candle touching both counts as a loss, execution cost charged, and a trade still open after 48 candles is closed at the market price. Signals too old for the candles held are marked "expired" and excluded from every statistic. Results are stored in R (multiples of the planned risk).

**The Signals page** shows a table per strategy (signals, resolved, open, win rate, average R) and a filterable list. A win rate is hidden until a strategy has 20 resolved signals. The point of the page: compare it with the backtest on the chart page. If forward results are much worse, the backtest was luck.

**Database.** A new `signals` schema (strategy, label, planned R:R, result in R) is created automatically; older databases are migrated in place and the original single-rule rows stay, shown as "Original rule (EMA/RSI/ATR)". The migration was tested against a database in the old format.

**What I verified:** unit tests for settling, de-duplication, statistics and a tracker pass (including a later pass settling earlier signals without changing their recorded levels or label); the migration test above; and live runs on the dev and production builds: 5 of 5 targets, with real gold and BTC setups recorded (four on the first production pass) as "No measured edge" signals. **Not verified:** a long run. No signal has resolved yet at the time of writing, so there are no forward results to report.

## 17. Hardening and checks

- **Security headers** on every response (CSP, X-Frame-Options, nosniff, referrer policy, permissions policy, HSTS in production); `X-Powered-By` removed. See section 10, item 5, for the CSP trade-off. Defined in `next.config.ts`.
- **Gold data protection** (`src/server/gold.ts`): a per-timeframe cache (1 minute for 1m-15m, 2 for 30m, 3 for 1h, 5 for 2h, 10 for 4h, 15 for 1d, 60 for 1w); simultaneous requests share one upstream call; a daily budget (`GOLD_DAILY_BUDGET`) that also counts failed attempts; older data (up to 6 hours) is served instead of an error when the provider fails or the budget is spent; unreachable or erroring providers give clear 502/503 answers. Counters live in memory.
- **Rate limits:** 120 requests a minute per IP on `/api/gold` and `/api/signals` (429 with `Retry-After`); the account routes have their own, listed in section 12. Limiters are created on first use, so adding one later can never leave an older process without it (a bug I hit and fixed).
- **Site files:** `robots.txt` (blocks `/api/`, account and one-time-link pages), `sitemap.xml` and `manifest.webmanifest` (both need `APP_URL` set at *build* time to be useful), and a translated 404 page.
- **Smoke test:** `npm run smoke` / `node scripts/smoke.mjs <url>`; see section 8.
- **Accessibility:** axe-core scan, 0 violations (WCAG 2 A/AA and best-practice rules) on every page in dark and light, the sign-up form, the open search dialog and the signed-in Account page. It found and I fixed: low-contrast grey text in both themes, keyboard-inaccessible scrollable tables, and button labels that didn't contain their visible text. This is an automated scan: it does not replace testing with a screen reader or on real devices.
- **Dependencies:** `npm audit` is covered in section 10, item 6.

**Container files (untested).** `Dockerfile`, `docker-compose.yml` and `.dockerignore` are included: a multi-stage build on Node 24, running as a non-root user, a `/app/data` volume for the database, a health check on `/api/auth/me`, bound to `127.0.0.1:3000` in the compose file. **They have never been built or run.** Before relying on them: build the image (`docker build --build-arg APP_URL=https://your.domain -t aurum .`), run it with a named volume and your `.env`, confirm the health check turns healthy and the tracker line appears, restart it and confirm the database survived. Run exactly one container.

## 18. Launch tooling: readiness report, health endpoint, deploy files

**Readiness report at boot.** Every time the server starts it prints a short `[preflight]` block listing what is still unconfigured for production: `APP_URL` (missing, or not https), email (`SMTP_URL` + `MAIL_FROM`), the gold key, `DATABASE_FILE` (still inside the app folder), the three site-detail variables, an invalid `GOLD_DAILY_BUDGET`, and a Node version below 22.13. A clean setup prints `configuration looks ready`. In development it is silent apart from the Node version. It only reports; it never blocks startup. Logic and tests: `src/server/preflight.ts`.

**Health endpoint.** `GET /api/health` returns `{status, database, tracker, email}`. It answers **200** while the database responds (status `ok`, or `degraded` if the tracker's last pass was partial or is overdue by three intervals) and **503** if the database does not. It exposes no secrets, user data or configuration values and is never cached. The Docker health check uses it, and `npm run smoke` checks it. Point an uptime monitor at it.

**Files in `deploy/`** (all untested on a real server; read and adapt before use):
- `Caddyfile`: reverse proxy with automatic HTTPS (the setup the app's origin check and rate limits assume).
- `aurum-desk.service`: systemd unit for the app, with basic sandboxing and a separate environment file.
- `aurum-backup.service` and `aurum-backup.timer`: daily database backup (section 7).

**Dependency updates.** `.github/dependabot.yml` opens weekly pull requests for npm updates (minor and patch grouped) and monthly ones for GitHub Actions. The CI workflow runs on each, so nothing merges unchecked.

**CI.** `.github/workflows/ci.yml` runs typecheck, lint, the unit tests, the production build and a production-dependency audit on every push and pull request. The build no longer downloads fonts from Google (the `geist` package ships them), because that download is what failed the first CI run.
