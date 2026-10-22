# MoreCode server

The hosted backend: accounts, plans, AI access for people without their own key, chat sync, share links,
feedback and update checks. Needs **Node 22.5 or newer**. Production uses **PostgreSQL** and **Paystack**; development and the tests use a local SQLite file and need nothing installed.

    cd server
    ANTHROPIC_API_KEY=sk-ant-... npm start     # development: SQLite file, emails printed, plans free (demo billing)
    npm test                                   # ~190 checks, no network needed
    TEST_DATABASE_URL=postgres://... npm test  # also runs the same database checks on PostgreSQL

## Run it for real

    cp .env.example .env     # fill it in (TOKEN_SECRET, APP_URL, POSTGRES_PASSWORD, PAYSTACK_SECRET_KEY, mail)
    docker compose up -d     # server + PostgreSQL 16; data lives in the "morecode-pg" volume

Put it behind HTTPS. In production the server refuses to start without `TOKEN_SECRET` and `DATABASE_URL`, and refuses `BILLING_MODE=demo`.
Without compose, set `DATABASE_URL` yourself (and `DATABASE_SSL=true` if your host requires TLS) and run `npm install && npm start`.

## Payments (Paystack)

1. Put your secret key in `PAYSTACK_SECRET_KEY` (start with `sk_test_...`), set `PAYSTACK_CURRENCY` (Ghana: `GHS`) and your prices (`PRICE_*`; the defaults are placeholders).
2. In the Paystack dashboard, Settings > API Keys & Webhooks, set the webhook URL to `APP_URL/v1/billing/paystack/webhook`.
3. Plans are created in Paystack automatically on first use (or set `PAYSTACK_PLAN_*` to use your own).

How it works: the app asks `POST /v1/billing/checkout`, opens Paystack's page in the browser (card details never touch MoreCode), and polls
`GET /v1/billing/status`. A plan is switched on only from a payment Paystack confirms (signed webhook, or our own verify call) with the right
currency and amount, recorded once per reference. Renewals arrive as `charge.success` and extend the period. Cancelling stops renewal and keeps the
plan until the paid period ends; a failed renewal gets a 3-day grace period before dropping to Free. Changing card opens Paystack's manage page.

Known limits: switching between paid plans does not prorate (the new plan starts at once, the old subscription is stopped); refunds are done in the
Paystack dashboard and do not change the plan automatically; card only by default (`PAYSTACK_CHANNELS`) because mobile money may not renew by itself.

## Data

PostgreSQL in production (`src/repo.pg.mjs`), SQLite in development (`src/repo.sqlite.mjs`); both expose the same methods and are checked by the same tests.
Passwords are scrypt hashes, codes are keyed hashes, and a card number is never stored (only brand, last four, expiry from Paystack).

    npm run backup           # PostgreSQL: pg_dump into ./backups (needs pg_dump installed)

## Settings

| Variable | What it does |
| --- | --- |
| `TOKEN_SECRET` | Signs sign-in tokens. **Required in production.** |
| `DATABASE_URL`, `DATABASE_SSL` | PostgreSQL connection. **Required in production.** |
| `APP_URL` | Public address of this server (share links, OAuth and payment return pages). |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_CURRENCY`, `PRICE_*`, `PAYSTACK_CHANNELS`, `PAYSTACK_PLAN_*` | Payments, see above. |
| `BILLING_MODE` | Normally leave unset (`paystack` when a key is set). `demo` = free plan changes (development only), `off` = refuse plan changes. |
| `ANTHROPIC_API_KEY` | Used for people on a plan. |
| `RESEND_API_KEY`, `MAIL_FROM` / `MAIL_WEBHOOK_URL` | Email delivery. |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | Social sign-in. |
| `RELEASES_FILE`, `SIGNUPS_PER_HOUR`, `DATABASE_FILE`, `PORT`, `ALLOWED_ORIGINS`, `NODE_ENV` | As named. |

## Connect the app

Create `.env` next to the app's `package.json`: `VITE_API_URL=http://localhost:8787`. Without it the app keeps its built-in demo accounts.
