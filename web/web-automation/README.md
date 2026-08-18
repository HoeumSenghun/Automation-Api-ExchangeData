# Web ExchangeData test runner

Next.js UI for the same Init → RSA → Confirm → Check flow as the Java CLI. Secrets never go to the browser.

This is the ExchangeData API, not Topup. Init uses `paymentCode`, `paidAmount` (number), and `msisdn`.

## Local run

From this folder (`web/web-automation`):

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Credentials load in this order:

1. `MERCHANT_DOTENV` (Vercel: paste the **repo-root** `.env` contents)
2. `.env.local` in this folder (optional override)
3. `.env` in this folder (optional)
4. The Java `.env` at the **repo root** — this is what local `npm run dev` uses

Use **one** credentials template: repo-root `.env.example` → copy to repo-root `.env`.
Do not put real keys in `.env.example` files.

## How to test

1. Choose a merchant (from `.env`) — this selects the API key
2. Choose a **package** from `.env` `paymentCodes` (amount is locked to that package)
3. Customer **MSISDN**
4. Optional: **Show advanced** → dry run (inspect the init body, no API call) or a custom `refId` (max 20)
5. Run Init / Confirm (includes `refId`) / Check and read each step’s JSON on the right

MSISDN is remembered in `sessionStorage` for the tab only.

## Vercel (this folder only)

The GitHub repo also contains Java. Deploy **only** this Next.js app:

1. Import the same GitHub repo in Vercel.
2. Set **Root Directory** to `web/web-automation`.
3. Framework: **Next.js**. Do not set a custom output directory.
4. Add env vars (Vercel does not get the gitignored root `.env`):
   - `MERCHANT_DOTENV` — paste the whole repo-root `.env` file
   - optional `RUN_SECRET`
5. Enable Deployment Protection.

To skip builds when only Java files changed, set **Ignored Build Step** to:

```bash
git diff --quiet HEAD^ HEAD -- web/web-automation
```

## Security

PIN, API key, and RSA keys are read only in Route Handlers (`/api/merchants`, `/api/run`). The merchants endpoint returns codes only, never secrets.
