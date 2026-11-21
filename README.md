# Qiyas

Qiyas is a counter dashboard for a Kuwaiti dishdasha tailor. Staff look up a customer by phone or a label code, keep dated measurement sets, and track each order’s production, payment, and handover separately. Customers follow a shareable link to see status, pay the balance in this demo, or request delivery.

The app is a static Vite + React frontend with a Netlify Function API and PostgreSQL.

## Local development

Requirements: Node.js 20 or newer, and PostgreSQL 13 or newer (`gen_random_uuid()`).

```bash
# Example local database
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER qiyas WITH PASSWORD 'qiyas' SUPERUSER;"
sudo -u postgres createdb -O qiyas qiyas

cp .env.example .env
npm install
npm run seed
npm run dev
```

Open http://localhost:5173. The dev script serves the API on port 8787 and Vite on 5173, proxying `/api` to the API. `npm run dev:web` and `npm run dev:api` start the two processes separately.

`npm run check:api` runs the order flow against `DATABASE_URL` (create customer, measurements, order, finish, payment, adjustment, tracking payment, and delivery).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Required. Non-local hosts use SSL with `rejectUnauthorized: false` so Render works. |
| `SHOP_NAME` | Name used only when the first shop row is created. After that, change it in Settings. |
| `PUBLIC_BASE_URL` | Origin written into message links. Falls back to Netlify `URL` / `DEPLOY_PRIME_URL`, then the browser origin when it is localhost. |
| `MESSAGE_PROVIDER` | `mock` (default), `whatsapp_cloud`, or `twilio`. |
| `MESSAGE_FALLBACK_SMS` | `true` to try Twilio SMS after a WhatsApp send fails. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API credentials. Unused while the provider is `mock`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Twilio credentials. Unused while the provider is `mock`. |
| `ALLOW_SEED` | Set to `false` to disable `POST /api/seed`. |

Do not commit real credentials. `.env` is gitignored.

The mock provider writes each message (channel, text, status) to the `messages` table and to the function log. The order page shows that log. WhatsApp is not connected.

## Data

`db/schema.sql` is the schema. On the first request the API runs the same SQL with `CREATE TABLE IF NOT EXISTS`, then creates the shop and the eight default measurement fields if they are missing.

`npm run seed` replaces customers and orders with one demo shop: overdue, today, tomorrow, upcoming, a finished order, and an open adjustment. Settings → **Replace with demo data** calls `POST /api/seed` with `{ "reset": true }`.

`GET /api/health` runs `SELECT 1` and returns `{ "ok": true, "db": "ok" }`.

Money is stored as KD with 3 decimal places (`numeric(12,3)`).

## Netlify + Render

1. Create a PostgreSQL instance on Render and copy its external connection string.
2. In Netlify, set `DATABASE_URL` and any optional variables above. Do not put the URL in `netlify.toml`.
3. Connect this repo. The build is already declared in `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
```

`npm run build` typechecks the React app and the functions, then builds the static site. Functions are TypeScript files in `netlify/functions` using the Web API handler (`export default` + `export const config`). Client routes fall back to `index.html`. `/api/*` is handled by `netlify/functions/api.ts`.

If the Netlify plan allows a custom function region, set it to Frankfurt (`fra`) under Cloud compute → Functions → Region so the API sits next to a Render database in eu-central-1. Pinning that region in `netlify.toml` failed the deploy preview on this site, so it is left to the dashboard.

4. After the first deploy, open Settings and load demo data, or `POST /api/seed`.

There is no login. The demo is a single shop. Offline mode and cross-shop measurement sharing are intentionally left out.
