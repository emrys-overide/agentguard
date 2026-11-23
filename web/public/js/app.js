// AgentGuard Main Application Script
import { ScorecardViewer } from "./scorecard.js";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Interactive Scorecard
  const viewer = new ScorecardViewer({ containerId: "scorecard-app" });
  viewer.init();

  // 2. Currency Switcher (USD <-> KES)
  const currencyBtns = document.querySelectorAll(".currency-btn");
  const priceElements = document.querySelectorAll("[data-price-usd]");

  currencyBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currencyBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const currency = btn.dataset.currency; // "usd" | "kes"

      priceElements.forEach((el) => {
        if (currency === "kes") {
          el.textContent = el.dataset.priceKes;
          const label = el.parentElement.querySelector(".currency-label");
          if (label) label.textContent = "KES";
        } else {
          el.textContent = el.dataset.priceUsd;
          const label = el.parentElement.querySelector(".currency-label");
          if (label) label.textContent = "USD";
        }
      });
    });
  });

  // 3. Copy Code Buttons
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.copyTarget;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      const text = targetEl.innerText.trim();
      try {
        await navigator.clipboard.writeText(text);
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> <span>Copied</span>`;
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove("copied");
        }, 2200);
      } catch (err) {
        console.error("Copy failed", err);
      }
    });
  });

  // 4. Zero-Touch License Verification Widget
  const verifyBtn = document.getElementById("btn-verify-license");
  const licenseInput = document.getElementById("input-license-key");
  const verifyResult = document.getElementById("verify-result-box");

  if (verifyBtn && licenseInput && verifyResult) {
    verifyBtn.addEventListener("click", async () => {
      const key = licenseInput.value.trim();
      if (!key) {
        verifyResult.innerHTML = `<span class="text-rose">Please enter a license key to verify.</span>`;
        verifyResult.style.display = "block";
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.textContent = "Checking...";
      verifyResult.style.display = "block";
      verifyResult.innerHTML = `<span class="text-muted">Querying Cloudflare D1 ledger...</span>`;

      try {
        const res = await fetch("/api/verify-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ license_key: key, client_version: "web-v1.0" })
        });
        const data = await res.json();

        if (res.ok && data.valid) {
          verifyResult.innerHTML = `
            <div class="verify-badge valid">
              <strong>VALID LICENSE:</strong> Tier: <code>${data.tier}</code> &bull; Customer: <code>${data.customer_email || "Active"}</code>
            </div>`;
        } else {
          verifyResult.innerHTML = `
            <div class="verify-badge invalid">
              <strong>VERIFICATION FAILED:</strong> ${data.error || "License not found or expired"}
            </div>`;
        }
      } catch (err) {
        // Fallback demo response if running without backend worker locally
        verifyResult.innerHTML = `
          <div class="verify-badge warning">
            <strong>OFFLINE / DEMO:</strong> Could not reach Cloudflare Worker at <code>/api/verify-license</code>. (Run <code>wrangler dev</code> to test live D1 verification).
          </div>`;
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify Key";
      }
    });
  }

  // 5. Checkout Action Handling (Polar & Paystack)
  document.querySelectorAll("[data-checkout-provider]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const provider = btn.dataset.checkoutProvider; // "polar" | "paystack"
      const tier = btn.dataset.tier || "pro_harness";

      // If configured with live checkout URLs, redirect. Otherwise open guided modal.
      const liveUrl = btn.dataset.checkoutUrl;
      if (liveUrl && liveUrl.startsWith("http")) {
        window.open(liveUrl, "_blank");
        return;
      }

      e.preventDefault();
      openCheckoutModal(provider, tier);
    });
  });

  function openCheckoutModal(provider, tier) {
    const modal = document.getElementById("checkout-modal");
    if (!modal) return;

    const modalTitle = modal.querySelector("#modal-title");
    const modalDesc = modal.querySelector("#modal-desc");
    const modalProviderTag = modal.querySelector("#modal-provider-tag");
    const modalAmount = modal.querySelector("#modal-amount");

    const isKES = document.querySelector(".currency-btn[data-currency='kes']").classList.contains("active");

    if (provider === "paystack") {
      modalTitle.textContent = "Paystack M-Pesa / Card Checkout";
      modalProviderTag.textContent = "Local Kenya / M-Pesa Instant STK Push";
      modalAmount.textContent = isKES ? "KES 5,000" : "$39 USD (equiv)";
      modalDesc.innerHTML = `Enter your M-Pesa phone number or debit card. You will receive an instant STK prompt and your <code>AG-PRO-...</code> license key via email and on-screen immediately upon completion.`;
    } else {
      modalTitle.textContent = "Polar.sh Global Checkout";
      modalProviderTag.textContent = "Global USD / Stripe / Apple Pay / PayPal";
      modalAmount.textContent = "$39 USD";
      modalDesc.innerHTML = `Powered by Polar.sh (Merchant of Record). Full zero-call self-serve checkout. License key automatically generated and delivered via Cloudflare Worker webhook within 2 seconds.`;
    }

    modal.classList.add("active");
  }

  const modalCloseBtn = document.getElementById("close-modal-btn");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => {
      document.getElementById("checkout-modal")?.classList.remove("active");
    });
  }
});
