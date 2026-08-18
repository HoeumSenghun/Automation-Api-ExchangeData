# Automation API ExchangeData

Java test runner and Next.js console for the merchant ExchangeData API. Each run executes one full flow:

1. **Init** — POST `/{code}/exchangedata/init` with an `EXCHANGE_DATA` body and a unique `refId`
2. **RSA** — decrypt `txPaymentTokenId` with the merchant private key, append the PIN, re-encrypt with the public key
3. **Confirm** — POST `/{code}/exchangedata/confirm` with `refId` and the final token
4. **Check** — POST `/{code}/exchangedata/check` with `{ refId }`

The run stops at the first failed step (non-2xx HTTP or API `status` other than `0`).

Headers are the same on init, confirm, and check: `Content-Type`, `Accept`, `Authorization: epa {apiKey}`, `e-language`. Only the API key changes, based on the selected merchant.

This is **not** the Topup API. Init fields are `paymentCode`, `paidAmount`, `msisdn` — not `transAmount` / `customerPhoneNumber` / PINCODE.

## Requirements

- JDK 11 or later
- Node.js 20+ (for the web console)
- A merchant API host and credentials (not stored in this repo)

## Setup

Copy the example files. Do **not** commit the copies.

```bash
cp .env.example .env
cp config.properties.example config.properties
```

Fill in `.env` with credentials. Fill in `config.properties` with the merchant and init body for this run.

## Configuration

### `.env` (secrets)

Shared host plus one block per merchant.

```
baseUrl=https://YOUR-HOST:PORT

merchants=ExampleTest,OtherMerchant

ExampleTest.pin=YOUR_PIN
ExampleTest.apiKey=YOUR_API_KEY
ExampleTest.privateKey=YOUR_PRIVATE_KEY_BASE64
ExampleTest.publicKey=YOUR_PUBLIC_KEY_BASE64
```

Required per merchant: `{code}.pin`, `{code}.apiKey`, `{code}.privateKey`, `{code}.publicKey`.

Also in `.env` (not committed): `paymentCodes` (catalog for the UI) and `paymentCode` (Java CLI selection).

Optional per merchant:

| Key | Default |
|---|---|
| `{code}.baseUrl` | shared `baseUrl` |
| `{code}.initPath` | `/{code}/exchangedata/init` |
| `{code}.confirmPath` | `/{code}/exchangedata/confirm` |
| `{code}.checkPath` | `/{code}/exchangedata/check` |

### `config.properties` (Java run settings)

| Key | Purpose |
|---|---|
| `activeMerchant` | Merchant code listed in `.env` |
| `language` | Request language header (default `en`) |
| `currency` | `USD` |
| `msisdn` | Customer MSISDN, e.g. `855XXXXXXXX` |

`paymentCode` and `paidAmount` live in `.env`, not in this file.

## Init body

```json
{
  "serviceType": "EXCHANGE_DATA",
  "refId": "EXCHyymmdd0001",
  "paymentCode": "<from .env paymentCodes>",
  "paidAmount": 1.5,
  "currency": "USD",
  "msisdn": "855XXXXXXXX"
}
```

`paidAmount` is a JSON number, not a string. `refId` max 20 characters.

### Confirm body

```json
{
  "refId": "EXCHyymmdd0001",
  "txPaymentTokenId": "..."
}
```

### Check body

```json
{
  "refId": "EXCHyymmdd0001"
}
```

## Packages

Package codes are secrets. Put them only in gitignored `.env` (and Vercel `MERCHANT_DOTENV`):

```
paymentCodes=CODE:AMOUNT:FAMILY:Label,CODE:AMOUNT:FAMILY:Label
paymentCode=CODE
paidAmount=1.5
```

Optional per merchant: `{code}.paymentCodes=...`. The web UI loads this list from the server; it is not committed.

`paidAmount` must match the selected package when the code is in `paymentCodes`.

## Run (Java)

From the project root:

```bash
javac -d out src/*.java
java -cp out Main
```

Override merchant from the command line:

```bash
java -cp out Main ExampleTest
```

refIds are `EXCH` + `yyMMdd` + a 4-digit sequence. Used ids for the current day are stored under `data/`.

## Project layout

```
src/                     Java CLI
web/web-automation/      Next.js UI (Vercel root directory)
config.properties.example
.env.example
```

Gitignored (never commit):

- `.env`
- `config.properties`
- `data/`
- `keys/`
- `out/`

## Secrets

Keep PINs, API keys, RSA keys, host URLs, and MSISDNs out of git and out of chat logs. Use only the `*.example` files as templates.

## Web UI

A Next.js console lives in `web/web-automation`. Same API flow, with merchant / payment-code / amount / MSISDN pickers. See `web/web-automation/README.md`. Local `npm run dev` can reuse the Java `.env` at this repo root.

## Deploy only the web app on Vercel

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com) → **Add New Project** → import this repository.
3. Before deploy, set:
   - **Framework Preset:** Next.js
   - **Root Directory:** `web/web-automation`
   - Leave Build Command / Output as the Next.js defaults
4. **Environment Variables** (Production + Preview):
   - `MERCHANT_DOTENV` = full contents of your local `.env` (one variable — do not add `CodeA.pin` as a Vercel name)
   - optional `RUN_SECRET`
5. Enable **Deployment Protection**.
