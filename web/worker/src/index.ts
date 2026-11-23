/**
 * AgentGuard Cloudflare Worker
 * Payment & License Management Gateway
 * Handles Polar.sh & Paystack Webhooks with Cloudflare D1 Ledger
 */

import { generateLicenseKey, verifyLicenseChecksum } from "./crypto";
import { verifyPolarWebhook, parsePolarEvent } from "./polar";
import { verifyPaystackWebhook, parsePaystackEvent } from "./paystack";
import { sendLicenseEmail } from "./email";

export interface Env {
  DB: D1Database;
  POLAR_WEBHOOK_SECRET?: string;
  PAYSTACK_SECRET_KEY?: string;
  LICENSE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  ENVIRONMENT?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, webhook-id, webhook-timestamp, webhook-signature, x-paystack-signature",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Handle CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const licenseSecret = env.LICENSE_SECRET_KEY || "melch-agentguard-default-seed-2026";

    // 1. Health Endpoint
    if (url.pathname === "/api/health" && method === "GET") {
      return jsonResponse({
        status: "healthy",
        service: "melch-agentguard-license-api",
        version: "1.2.0",
        timestamp: Date.now(),
        environment: env.ENVIRONMENT || "production"
      });
    }

    // 2. License Verification Endpoint (Used by CLI & Web Inspector)
    if (url.pathname === "/api/verify-license" && method === "POST") {
      try {
        const body: any = await request.json();
        const licenseKey = (body?.license_key || "").trim();
        const clientVersion = body?.client_version || "unknown";
        const clientIp = request.headers.get("CF-Connecting-IP") || "local";

        if (!licenseKey) {
          return jsonResponse({ valid: false, error: "Missing 'license_key' parameter" }, 400);
        }

        // Fast cryptographic integrity check
        const isChecksumValid = await verifyLicenseChecksum(licenseKey, licenseSecret);
        if (!isChecksumValid) {
          // Log failed verification attempt in D1
          await env.DB.prepare(
            "INSERT INTO verifications (id, license_key, client_version, ip_address, verified_at, is_valid) VALUES (?, ?, ?, ?, ?, 0)"
          )
            .bind(crypto.randomUUID(), licenseKey, clientVersion, clientIp, Date.now())
            .run();

          return jsonResponse({
            valid: false,
            error: "License key failed cryptographic checksum validation"
          }, 403);
        }

        // Database lookup in D1
        const record = await env.DB.prepare(
          "SELECT id, license_key, customer_email, product_tier, status, created_at FROM licenses WHERE license_key = ? LIMIT 1"
        )
          .bind(licenseKey)
          .first<{
            id: string;
            license_key: string;
            customer_email: string;
            product_tier: string;
            status: string;
            created_at: number;
          }>();

        if (!record || record.status !== "active") {
          await env.DB.prepare(
            "INSERT INTO verifications (id, license_key, client_version, ip_address, verified_at, is_valid) VALUES (?, ?, ?, ?, ?, 0)"
          )
            .bind(crypto.randomUUID(), licenseKey, clientVersion, clientIp, Date.now())
            .run();

          return jsonResponse({
            valid: false,
            error: record ? `License status is '${record.status}'` : "License key not found in ledger"
          }, 404);
        }

        // Log successful verification audit
        await env.DB.prepare(
          "INSERT INTO verifications (id, license_key, client_version, ip_address, verified_at, is_valid) VALUES (?, ?, ?, ?, ?, 1)"
        )
          .bind(crypto.randomUUID(), licenseKey, clientVersion, clientIp, Date.now())
          .run();

        return jsonResponse({
          valid: true,
          license_key: record.license_key,
          tier: record.product_tier,
          customer_email: record.customer_email,
          created_at: record.created_at
        });
      } catch (err: any) {
        return jsonResponse({ valid: false, error: "Internal error: " + err.message }, 500);
      }
    }

    // 3. Polar.sh Webhook Handler
    if (url.pathname === "/webhooks/polar" && method === "POST") {
      try {
        const rawBody = await request.text();
        const polarSecret = env.POLAR_WEBHOOK_SECRET || "";

        // Verify signature (unless in dev mode without secret)
        if (polarSecret) {
          const isValid = await verifyPolarWebhook(rawBody, request.headers, polarSecret);
          if (!isValid) {
            return jsonResponse({ error: "Invalid Polar webhook signature" }, 401);
          }
        }

        const payload = JSON.parse(rawBody);
        const orderEvent = parsePolarEvent(payload);

        if (!orderEvent) {
          return jsonResponse({ message: "Ignored unhandled Polar event type" }, 200);
        }

        // Check idempotency in D1
        const existingEvent = await env.DB.prepare(
          "SELECT id FROM webhook_events WHERE provider = 'polar' AND event_id = ? LIMIT 1"
        )
          .bind(orderEvent.eventId)
          .first();

        if (existingEvent) {
          return jsonResponse({ message: "Event already processed", duplicate: true }, 200);
        }

        // Issue new cryptographic license key
        const licenseKey = await generateLicenseKey(orderEvent.productTier, licenseSecret);
        const licenseId = crypto.randomUUID();
        const now = Date.now();

        // Atomic transaction in D1
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO licenses (
              id, license_key, customer_email, customer_name, product_tier,
              provider, transaction_id, amount, currency, status, created_at, updated_at, metadata
            ) VALUES (?, ?, ?, ?, ?, 'polar', ?, ?, ?, 'active', ?, ?, ?)`
          ).bind(
            licenseId,
            licenseKey,
            orderEvent.customerEmail,
            orderEvent.customerName || null,
            orderEvent.productTier,
            orderEvent.orderId,
            orderEvent.amount,
            orderEvent.currency,
            now,
            now,
            JSON.stringify(orderEvent.metadata || {})
          ),
          env.DB.prepare(
            `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, processed_at)
             VALUES (?, 'polar', ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            orderEvent.eventId,
            orderEvent.eventType,
            rawBody,
            now
          )
        ]);

        // Send confirmation email asynchronously
        const formattedAmount = `$${(orderEvent.amount / 100).toFixed(2)} ${orderEvent.currency}`;
        ctx.waitUntil(
          sendLicenseEmail(
            {
              toEmail: orderEvent.customerEmail,
              customerName: orderEvent.customerName,
              licenseKey,
              productTier: orderEvent.productTier,
              provider: "polar",
              amountFormatted: formattedAmount
            },
            env.RESEND_API_KEY,
            env.RESEND_FROM_EMAIL
          )
        );

        return jsonResponse({
          success: true,
          license_key: licenseKey,
          provider: "polar",
          tier: orderEvent.productTier,
          customer_email: orderEvent.customerEmail
        });
      } catch (err: any) {
        return jsonResponse({ error: "Polar processing failed: " + err.message }, 500);
      }
    }

    // 4. Paystack Webhook Handler
    if (url.pathname === "/webhooks/paystack" && method === "POST") {
      try {
        const rawBody = await request.text();
        const paystackSecret = env.PAYSTACK_SECRET_KEY || "";

        // Verify HMAC-SHA512 signature
        if (paystackSecret) {
          const isValid = await verifyPaystackWebhook(rawBody, request.headers, paystackSecret);
          if (!isValid) {
            return jsonResponse({ error: "Invalid Paystack signature" }, 401);
          }
        }

        const payload = JSON.parse(rawBody);
        const chargeEvent = parsePaystackEvent(payload);

        if (!chargeEvent || chargeEvent.eventType !== "charge.success") {
          return jsonResponse({ message: "Ignored unhandled Paystack event" }, 200);
        }

        // Check idempotency in D1
        const existingEvent = await env.DB.prepare(
          "SELECT id FROM webhook_events WHERE provider = 'paystack' AND event_id = ? LIMIT 1"
        )
          .bind(chargeEvent.eventId)
          .first();

        if (existingEvent) {
          return jsonResponse({ message: "Charge already processed", duplicate: true }, 200);
        }

        // Issue license key
        const licenseKey = await generateLicenseKey(chargeEvent.productTier, licenseSecret);
        const licenseId = crypto.randomUUID();
        const now = Date.now();

        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO licenses (
              id, license_key, customer_email, customer_name, product_tier,
              provider, transaction_id, amount, currency, status, created_at, updated_at, metadata
            ) VALUES (?, ?, ?, ?, ?, 'paystack', ?, ?, ?, 'active', ?, ?, ?)`
          ).bind(
            licenseId,
            licenseKey,
            chargeEvent.customerEmail,
            chargeEvent.customerName || null,
            chargeEvent.productTier,
            chargeEvent.reference,
            chargeEvent.amount,
            chargeEvent.currency,
            now,
            now,
            JSON.stringify(chargeEvent.metadata || {})
          ),
          env.DB.prepare(
            `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, processed_at)
             VALUES (?, 'paystack', ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            chargeEvent.eventId,
            chargeEvent.eventType,
            rawBody,
            now
          )
        ]);

        // Send email confirmation
        const formattedAmount = `${chargeEvent.currency} ${(chargeEvent.amount / 100).toLocaleString()}`;
        ctx.waitUntil(
          sendLicenseEmail(
            {
              toEmail: chargeEvent.customerEmail,
              customerName: chargeEvent.customerName,
              licenseKey,
              productTier: chargeEvent.productTier,
              provider: "paystack",
              amountFormatted: formattedAmount
            },
            env.RESEND_API_KEY,
            env.RESEND_FROM_EMAIL
          )
        );

        return jsonResponse({
          success: true,
          license_key: licenseKey,
          provider: "paystack",
          tier: chargeEvent.productTier,
          customer_email: chargeEvent.customerEmail
        });
      } catch (err: any) {
        return jsonResponse({ error: "Paystack processing failed: " + err.message }, 500);
      }
    }

    // Default 404
    return jsonResponse({ error: "Not Found", path: url.pathname }, 404);
  }
};
