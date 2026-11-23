# AgentGuard

> **Local-First AI Agent Safety Harness & Adversarial Benchmark Suite — by MELCH TECH**

Test your AI agents against **30 deterministic adversarial attacks** covering prompt injection, unauthorized tool execution, and secret exfiltration — with zero heavy dependencies, local-first execution (Ollama, LM Studio, vLLM, OpenRouter), and interactive HTML/JSON scorecards.

---

## Repository Structure

| Directory | Description |
| :--- | :--- |
| [`cli/`](./cli) | Zero-dependency Python 3.10+ benchmark CLI (`agentguard`), `SOUL.md` policy loader, 30 adversarial scenarios (`PI-01..10`, `TR-01..10`, `EX-01..10`), local/cloud `openai-compat` runner, and JSON/HTML report generator. |
| [`web/`](./web) | Static storefront and interactive drag-and-drop `report.json` scorecard viewer (`web/public`), plus a Cloudflare Worker + D1 license verification & Polar.sh/Paystack webhook API (`web/worker`). |

---

## Quickstart (CLI)

```bash
cd cli
pip install -e .

# Inspect all 30 adversarial test vectors
python -m agentguard list-scenarios

# Run against the built-in hardened baseline (Grade A — 100%)
python -m agentguard run --target mock-hardened --out samples/demo_report.json --html samples/demo_report.html

# Run against the built-in vulnerable baseline (Grade F — 0%)
python -m agentguard run --target mock-vulnerable --out samples/vulnerable_report.json --html samples/vulnerable_report.html

# Run against a local Ollama / LM Studio / OpenAI-compatible model
python -m agentguard run \
  --target openai-compat \
  --endpoint http://localhost:11434/v1 \
  --model llama3 \
  --out ollama_report.json \
  --html ollama_report.html
```

---

## Interactive Scorecard & Storefront (`web/`)

Drop any CLI-generated `report.json` into [`web/public/index.html`](./web/public/index.html) to inspect category breakdowns, filter failed vectors, export an SVG grade badge, or copy a Markdown summary for PRs.

See [`web/README.md`](./web/README.md) for Cloudflare Pages, Workers, and D1 deployment steps.

---

## Running Tests

```bash
# Python CLI test suite (17 tests)
cd cli
python -m pytest tests
```

---

## License

MIT — see [LICENSE](./LICENSE).
