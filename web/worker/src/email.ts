// Zero-Touch License Email Dispatcher via Resend API

export interface LicenseDeliveryParams {
  toEmail: string;
  customerName?: string;
  licenseKey: string;
  productTier: string;
  provider: "polar" | "paystack";
  amountFormatted: string;
}

export async function sendLicenseEmail(
  params: LicenseDeliveryParams,
  resendApiKey?: string,
  fromEmail: string = "AgentGuard <licensing@melchtech.com>"
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resendApiKey) {
    console.log(
      `[MOCK_EMAIL] RESEND_API_KEY not set. License ${params.licenseKey} generated for ${params.toEmail}`
    );
    return { success: true, id: "mock_email_logged" };
  }

  const tierTitle = params.productTier === "team_ci" ? "Team CI Subscription" : "Pro Harness Kit (Lifetime)";
  const greeting = params.customerName ? `Hi ${params.customerName},` : "Hello,";

  const htmlBody = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; margin: 0; padding: 24px; }
      .card { background-color: #111a29; border: 1px solid #1e2e47; border-radius: 12px; max-width: 600px; margin: 0 auto; padding: 32px; }
      .brand { font-size: 20px; font-weight: 800; color: #06b6d4; margin-bottom: 24px; }
      .key-box { background-color: #06090e; border: 2px dashed #10b981; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
      .key-text { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 22px; font-weight: 700; color: #34d399; letter-spacing: 0.05em; }
      .code-block { background-color: #06090e; border: 1px solid #1e2e47; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; color: #93c5fd; overflow-x: auto; }
      .footer { margin-top: 32px; font-size: 12px; color: #64748b; border-top: 1px solid #1e2e47; padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">&#9670; AgentGuard &bull; MELCH TECH</div>
      <h2>Your AgentGuard License is Ready!</h2>
      <p>${greeting}</p>
      <p>Thank you for purchasing <strong>${tierTitle}</strong> via ${params.provider.toUpperCase()} (${params.amountFormatted}).</p>
      
      <div class="key-box">
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px;">Your License Key</div>
        <div class="key-text">${params.licenseKey}</div>
      </div>

      <h3>Quick Activation</h3>
      <p>Activate your local CLI or CI runner with:</p>
      <div class="code-block">npx melch-agentguard auth ${params.licenseKey}</div>

      <p style="margin-top: 20px;">Or set as an environment variable in GitHub Actions:</p>
      <div class="code-block">AGENTGUARD_LICENSE_KEY=${params.licenseKey}</div>

      <div class="footer">
        MELCH TECH &bull; Nairobi &amp; Global &bull; Zero-Sales-Call Self-Serve Delivery<br>
        Need help? Check docs at https://github.com/milind-soni/OpenMausBot
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.toEmail],
        subject: `Your AgentGuard License Key (${tierTitle})`,
        html: htmlBody
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Resend error: ${res.status} - ${errText}` };
    }

    const data: any = await res.json();
    return { success: true, id: data.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
