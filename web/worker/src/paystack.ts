// Paystack Webhook Signature Verification and Event Parsing
import { hmacSha512Hex, timingSafeEqual } from "./crypto";

export interface PaystackChargeEvent {
  eventId: string;
  eventType: string;
  reference: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  productTier: string;
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
}

/**
 * Verifies Paystack webhook signature header x-paystack-signature using HMAC-SHA512
 */
export async function verifyPaystackWebhook(
  rawBody: string,
  headers: Headers,
  secretKey: string
): Promise<boolean> {
  if (!secretKey) return false;

  const signature = headers.get("x-paystack-signature");
  if (!signature) return false;

  const computed = await hmacSha512Hex(secretKey, rawBody);
  return timingSafeEqual(computed.toLowerCase(), signature.toLowerCase());
}

/**
 * Parses Paystack charge event
 */
export function parsePaystackEvent(payload: any): PaystackChargeEvent | null {
  const eventType = payload?.event;
  if (!eventType) return null;

  const data = payload?.data;
  if (!data) return null;

  const reference = data?.reference || `ps_${Date.now()}`;
  const customerEmail = data?.customer?.email;
  if (!customerEmail) return null;

  const customerName = [data?.customer?.first_name, data?.customer?.last_name]
    .filter(Boolean)
    .join(" ") || undefined;
  const customerPhone = data?.customer?.phone || undefined;

  const amount = Number(data?.amount || 500000); // 500,000 cents = KES 5,000
  const currency = (data?.currency || "KES").toUpperCase();

  // Determine tier
  let tier = "pro_harness";
  if (data?.metadata?.tier === "team_ci" || data?.plan?.name?.toLowerCase().includes("team")) {
    tier = "team_ci";
  }

  return {
    eventId: `${payload?.event}_${reference}`,
    eventType,
    reference,
    customerEmail,
    customerName,
    customerPhone,
    productTier: tier,
    amount,
    currency,
    metadata: data?.metadata || {}
  };
}
