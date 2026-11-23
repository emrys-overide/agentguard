// Polar.sh Webhook Signature Verification and Event Parsing
import { hmacSha256Hex, timingSafeEqual } from "./crypto";

export interface PolarOrderEvent {
  eventId: string;
  eventType: string;
  orderId: string;
  customerEmail: string;
  customerName?: string;
  productTier: string;
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
}

/**
 * Verifies Polar webhook signature.
 * Supports Polar standard webhook signature or polar-webhook-signature header.
 */
export async function verifyPolarWebhook(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  if (!secret) return false;

  // Polar / Standard Webhooks send:
  // webhook-signature or polar-webhook-signature
  const sigHeader =
    headers.get("webhook-signature") ||
    headers.get("polar-webhook-signature") ||
    headers.get("x-polar-signature");

  if (!sigHeader) return false;

  const timestamp = headers.get("webhook-timestamp") || headers.get("x-polar-timestamp") || "";
  const webhookId = headers.get("webhook-id") || "";

  // If Standard Webhooks timestamped signature (format: v1,base64 or v1,hex)
  if (sigHeader.includes("v1,")) {
    const parts = sigHeader.split(" ");
    for (const part of parts) {
      if (part.startsWith("v1,")) {
        const signature = part.slice(3);
        const signedPayload = webhookId ? `${webhookId}.${timestamp}.${rawBody}` : `${timestamp}.${rawBody}`;
        const computed = await hmacSha256Hex(secret, signedPayload);

        // Computed can match hex or base64
        if (timingSafeEqual(computed.toLowerCase(), signature.toLowerCase())) {
          return true;
        }
      }
    }
  }

  // Direct HMAC-SHA256 signature fallback
  const directComputed = await hmacSha256Hex(secret, rawBody);
  const cleanSig = sigHeader.replace(/^v1=/, "").replace(/^v1,/, "");
  return timingSafeEqual(directComputed.toLowerCase(), cleanSig.toLowerCase());
}

/**
 * Parses Polar webhook payload and normalizes order details
 */
export function parsePolarEvent(payload: any): PolarOrderEvent | null {
  const eventType = payload?.type || payload?.event;
  if (!eventType) return null;

  // Handle order.created or checkout.created or subscription.created
  const data = payload?.data || payload;
  const orderId = data?.id || data?.order_id || `polar_${Date.now()}`;
  const customerEmail =
    data?.customer?.email ||
    data?.user?.email ||
    data?.customer_email ||
    data?.email;

  if (!customerEmail) {
    return null;
  }

  const customerName = data?.customer?.name || data?.user?.name || data?.customer_name;
  const amount = Number(data?.amount || data?.total_amount || 3900);
  const currency = (data?.currency || "USD").toUpperCase();

  // Tier detection from product name or metadata
  const prodName = (data?.product?.name || data?.product_name || "").toLowerCase();
  let tier = "pro_harness";
  if (prodName.includes("team") || data?.metadata?.tier === "team_ci") {
    tier = "team_ci";
  }

  return {
    eventId: payload?.id || orderId,
    eventType,
    orderId,
    customerEmail,
    customerName,
    productTier: tier,
    amount,
    currency,
    metadata: data?.metadata || {}
  };
}
