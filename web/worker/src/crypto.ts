// Web Standards Cryptographic Utilities (Cloudflare Workers & Node 18+)

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha512Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generates a tamper-evident license key:
 * Format: AG-[TIER]-[RANDOM_BYTES]-[HMAC_8_CHARS]
 * Example: AG-PRO-4b1e8a9f-3e81ab02
 */
export async function generateLicenseKey(tier: string, secret: string): Promise<string> {
  const normalizedTier = tier.toUpperCase().replace(/_/g, "-");
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const payload = `AG-${normalizedTier}-${randomHex}`;
  const sig = await hmacSha256Hex(secret, payload);
  const checksum = sig.slice(0, 8);

  return `${payload}-${checksum}`;
}

/**
 * Verifies the mathematical integrity of a license key without DB access
 */
export async function verifyLicenseChecksum(licenseKey: string, secret: string): Promise<boolean> {
  const parts = licenseKey.trim().split("-");
  if (parts.length < 4 || parts[0] !== "AG") {
    return false;
  }
  const checksum = parts[parts.length - 1];
  const payload = parts.slice(0, -1).join("-");
  const expectedSig = await hmacSha256Hex(secret, payload);
  return timingSafeEqual(checksum.toLowerCase(), expectedSig.slice(0, 8).toLowerCase());
}
