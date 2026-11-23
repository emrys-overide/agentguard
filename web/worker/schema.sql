-- AgentGuard Cloudflare D1 Database Schema
-- Run with: npx wrangler d1 execute agentguard-db --file=./schema.sql

-- 1. Licenses Table: Stores issued cryptographic license keys
CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    product_tier TEXT NOT NULL,          -- 'pro_harness', 'team_ci'
    provider TEXT NOT NULL,              -- 'polar', 'paystack'
    transaction_id TEXT UNIQUE NOT NULL, -- Polar order ID or Paystack reference
    amount INTEGER NOT NULL,             -- In cents or kobo/KES cents
    currency TEXT NOT NULL,              -- 'USD', 'KES'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
    created_at INTEGER NOT NULL,         -- Unix timestamp ms
    updated_at INTEGER NOT NULL,
    metadata TEXT                        -- JSON string of extra attributes
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- 2. Webhook Events Table: Ensures strict idempotency against duplicate delivery
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,              -- 'polar', 'paystack'
    event_id TEXT UNIQUE NOT NULL,       -- Webhook ID or transaction reference
    event_type TEXT NOT NULL,            -- 'order.created', 'charge.success'
    payload TEXT NOT NULL,               -- Raw JSON payload
    processed_at INTEGER NOT NULL        -- Unix timestamp ms
);

CREATE INDEX IF NOT EXISTS idx_webhook_event ON webhook_events(event_id, provider);

-- 3. Verifications Table: Audit log of CLI / API license validations
CREATE TABLE IF NOT EXISTS verifications (
    id TEXT PRIMARY KEY,
    license_key TEXT NOT NULL,
    client_version TEXT,
    ip_address TEXT,
    verified_at INTEGER NOT NULL,
    is_valid INTEGER NOT NULL            -- 1 for valid, 0 for invalid
);

CREATE INDEX IF NOT EXISTS idx_verifications_key ON verifications(license_key);
CREATE INDEX IF NOT EXISTS idx_verifications_time ON verifications(verified_at);
