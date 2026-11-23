# AgentGuard Web Storefront & Cloudflare Edge Backend
**Built by MELCH TECH (Nairobi & Global)**

AgentGuard is a local-first AI agent safety harness and adversarial benchmark kit. This package provides the zero-sales-call self-serve storefront, the client-side interactive scorecard explorer, and the production-ready Cloudflare Worker with D1 ledger for automated license issuance via **Polar.sh** (Global USD / Stripe) and **Paystack** (Kenya M-Pesa / Card).

---

## Architecture Overview

```
melch-agentguard/web/
├── public/                 # Zero-build static storefront (Cloudflare Pages)
│   ├── index.html          # Hero, Quickstart, Scorecard Explorer, Pricing, FAQ
│   ├── css/style.css       # High-contrast dark tech theme (mobile-first)
│   ├── js/
│   │   ├── app.js          # Currency switch (USD/KES), copy buttons, modals
│   │   ├── scorecard.js    # Interactive scorecard engine (drop/paste/filters)
│   │   └── sample-data.js  # Unprotected (37% F) vs Hardened (97% A) benchmarks
│   └── assets/logo.svg     # SVG shield logo
├── worker/                 # Cloudflare Worker API & Payment Gateway
│   ├── src/
│   │   ├── index.ts        # Worker routes: /api/verify-license, /webhooks/*
│   │   ├── crypto.ts       # Web Crypto HMAC-SHA256/512 & signed license keys
│   │   ├── polar.ts        # Polar.sh Standard Webhooks signature verifier
│   │   ├── paystack.ts     # Paystack HMAC-SHA512 signature verifier
│   │   └── email.ts        # Zero-touch license delivery via Resend API
│   ├── schema.sql          # Cloudflare D1 SQLite database schema
│   ├── wrangler.toml       # Worker configuration & D1 binding
│   ├── package.json
│   └── tsconfig.json
├── test/
│   └── mock-report.json    # Sample CLI benchmark output for testing dropzone
└── README.md
```

---

## 5-Minute Setup & Deployment Guide

### 1. Local Storefront Testing (Zero Build Step)
The storefront is pure modern HTML5, CSS, and vanilla ES modules. It runs in any browser without Webpack, Vite, or bundle bloat:

```bash
# Serve public/ locally
npx serve public -l 3000
```
Open `http://localhost:3000` to inspect:
- The **Interactive Scorecard**: Toggle between "Unprotected Agent (37% - F)" and "AgentGuard Hardened (97% - A)".
- Drag and drop `test/mock-report.json` onto the scorecard to test real-time parsing.
- Toggle pricing between **USD ($)** and **KES (KSh)**.

---

### 2. Cloudflare D1 Database Provisioning

Create your D1 database on Cloudflare:

```bash
cd worker
npx wrangler d1 create agentguard-db
```

Copy the generated `database_id` from the output into `worker/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "agentguard-db"
database_id = "<YOUR_D1_DATABASE_ID>"
```

Apply the database schema locally and remotely:

```bash
# Local D1 SQLite (for wrangler dev)
npx wrangler d1 execute agentguard-db --local --file=./schema.sql

# Production Cloudflare D1
npx wrangler d1 execute agentguard-db --remote --file=./schema.sql
```

---

### 3. Configure Worker Secrets & Deploy

Set your production secrets using Wrangler:

```bash
cd worker

# 1. Cryptographic seed for signing license keys (tamper-evident)
npx wrangler secret put LICENSE_SECRET_KEY

# 2. Polar.sh Webhook Secret (from Polar Dashboard -> Settings -> Webhooks)
npx wrangler secret put POLAR_WEBHOOK_SECRET

# 3. Paystack Secret Key (from Paystack Dashboard -> Settings -> API Keys)
npx wrangler secret put PAYSTACK_SECRET_KEY

# 4. Resend API Key for automatic email license delivery (optional)
npx wrangler secret put RESEND_API_KEY
```

Deploy the Cloudflare Worker:

```bash
npx wrangler deploy
```
Your worker will be live at `https://melch-agentguard-api.<your-subdomain>.workers.dev`.

---

### 4. Deploy Front-End Storefront (Cloudflare Pages)

Deploy `public/` directly to Cloudflare Pages:

```bash
# From melch-agentguard/web root:
npx wrangler pages deploy public --project-name=agentguard
```

Your storefront will be live on the global Cloudflare Edge network with 0ms cold starts.

---

## Webhook Configuration

### 1. Polar.sh (Global USD / Stripe / Apple Pay)
1. Go to **Polar Dashboard** &rarr; **Settings** &rarr; **Webhooks**.
2. Add endpoint: `https://melch-agentguard-api.<your-subdomain>.workers.dev/webhooks/polar`
3. Select events: `order.created`, `subscription.created`.
4. Copy the Webhook Secret and set it via `wrangler secret put POLAR_WEBHOOK_SECRET`.

### 2. Paystack (Kenya M-Pesa / Local Cards)
1. Go to **Paystack Dashboard** &rarr; **Settings** &rarr; **API Keys & Webhooks**.
2. Add Webhook URL: `https://melch-agentguard-api.<your-subdomain>.workers.dev/webhooks/paystack`
3. Copy your live Secret Key (`sk_live_...`) and set it via `wrangler secret put PAYSTACK_SECRET_KEY`.

---

## API Endpoints

### 1. Health Check
```http
GET /api/health
```
Response:
```json
{
  "status": "healthy",
  "service": "melch-agentguard-license-api",
  "version": "1.2.0",
  "timestamp": 1795556400000,
  "environment": "production"
}
```

### 2. Verify License
```http
POST /api/verify-license
Content-Type: application/json

{
  "license_key": "AG-PRO-4b1e8a9f-3e81ab02",
  "client_version": "cli-v1.2"
}
```
Response (Valid):
```json
{
  "valid": true,
  "license_key": "AG-PRO-4b1e8a9f-3e81ab02",
  "tier": "pro_harness",
  "customer_email": "developer@nairobi-tech.co.ke",
  "created_at": 1795556390000
}
```

---

## License
Open Core licensed under MIT. Pro adversarial vectors and tool policy interceptors licensed by MELCH TECH.
