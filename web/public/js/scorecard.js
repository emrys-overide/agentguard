// AgentGuard Interactive Scorecard Engine
import { SAMPLES } from "./sample-data.js";

export class ScorecardViewer {
  constructor(options = {}) {
    this.containerId = options.containerId || "scorecard-app";
    this.currentData = SAMPLES.hardened;
    this.filterStatus = "all"; // "all" | "passed" | "failed"
    this.filterCategory = "all";
    this.filterSearch = "";
    this.activePreset = "hardened";
  }

  init() {
    this.renderContainer();
    this.bindEvents();
    this.update();
  }

  loadData(data, sourceLabel = "Custom Report") {
    try {
      this.currentData = this.normalizeReport(data);
      this.activePreset = "custom";
      this.update(sourceLabel);
    } catch (err) {
      alert("Invalid report format: " + err.message);
    }
  }

  normalizeReport(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Report must be a valid JSON object");
    }

    const rawItems = Array.isArray(raw.tests)
      ? raw.tests
      : Array.isArray(raw.transcripts)
        ? raw.transcripts
        : [];
    if (rawItems.length === 0) {
      throw new Error("Report contains no test results under 'tests' or 'transcripts' array.");
    }

    const defaultSeverityByCat = {
      data_exfiltration: "critical",
      tool_restraint: "high",
      prompt_injection: "high"
    };

    const tests = rawItems.map((t, index) => {
      const category = t.category || "general";
      const toolInvoked =
        t.tool_invoked ||
        (Array.isArray(t.tool_calls) && t.tool_calls.length > 0
          ? t.tool_calls
              .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
              .join("\n")
          : null);

      return {
        id: t.id || t.scenario_id || `TEST-${index + 1}`,
        category,
        severity: (t.severity || defaultSeverityByCat[category] || "medium").toLowerCase(),
        title: t.title || t.scenario_name || t.scenario_id || "Untitled Scenario",
        passed: t.passed === true,
        latency_ms: Math.round(Number(t.latency_ms ?? t.duration_ms ?? 0) * 10) / 10,
        attack_vector:
          t.attack_vector ||
          category
            .replace(/_/g, " ")
            .replace(/\b\w/g, (ch) => ch.toUpperCase()),
        payload: t.payload ?? t.user_prompt ?? "",
        tool_invoked: toolInvoked,
        intercepted: t.intercepted ?? t.passed === true,
        leak_detected: t.leak_detected ?? false,
        reason: t.reason || t.eval_reason || t.agent_response || ""
      };
    });

    // Recalculate summary deterministically
    const total = tests.length;
    const passed = tests.filter((t) => t.passed === true).length;
    const failed = total - passed;
    const score = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;

    let grade = "F";
    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";

    const categories = {};
    const severities = {
      critical: { total: 0, passed: 0, failed: 0 },
      high: { total: 0, passed: 0, failed: 0 },
      medium: { total: 0, passed: 0, failed: 0 },
      low: { total: 0, passed: 0, failed: 0 }
    };

    let totalDuration = 0;

    tests.forEach((t) => {
      const cat = t.category || "general";
      if (!categories[cat]) {
        categories[cat] = { total: 0, passed: 0, failed: 0, score: 0 };
      }
      categories[cat].total += 1;
      if (t.passed) categories[cat].passed += 1;
      else categories[cat].failed += 1;

      const sev = (t.severity || "medium").toLowerCase();
      if (severities[sev]) {
        severities[sev].total += 1;
        if (t.passed) severities[sev].passed += 1;
        else severities[sev].failed += 1;
      }

      totalDuration += Number(t.latency_ms || 0);
    });

    Object.keys(categories).forEach((cat) => {
      const c = categories[cat];
      c.score = c.total > 0 ? Math.round((c.passed / c.total) * 1000) / 10 : 0;
    });

    return {
      agent_name: raw.agent_name || raw.policy_title || raw.target || "Custom Benchmarked Agent",
      target: raw.target || "agent.py",
      model: raw.model || raw.target || "local-runner",
      timestamp: raw.timestamp || new Date().toISOString(),
      suite_version: raw.suite_version || "agentguard-v0.1.0",
      summary: {
        total_tests: total,
        passed,
        failed,
        score,
        grade,
        duration_ms: Number(raw.total_duration_ms ?? totalDuration),
        severities,
        categories
      },
      tests
    };
  }

  renderContainer() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="scorecard-wrapper">
        <!-- Controls Bar -->
        <div class="scorecard-controls">
          <div class="preset-switchers">
            <span class="control-label">Compare Sample:</span>
            <button type="button" class="preset-btn" data-preset="unprotected">
              <span class="dot dot-danger"></span> Unprotected (37% - F)
            </button>
            <button type="button" class="preset-btn active" data-preset="hardened">
              <span class="dot dot-success"></span> AgentGuard Hardened (97% - A)
            </button>
          </div>

          <div class="file-actions">
            <label class="drop-upload-btn" title="Upload your own report.json">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Drop report.json</span>
              <input type="file" id="report-file-input" accept=".json" style="display:none;" />
            </label>
            <button type="button" class="paste-json-btn" id="paste-json-toggle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Paste JSON</span>
            </button>
          </div>
        </div>

        <!-- Hidden Paste Drawer -->
        <div class="paste-drawer" id="paste-drawer" style="display: none;">
          <textarea id="paste-textarea" placeholder="Paste your AgentGuard CLI report.json content here..."></textarea>
          <div class="paste-drawer-actions">
            <button type="button" class="btn btn-sm btn-primary" id="btn-apply-paste">Render Scorecard</button>
            <button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-paste">Cancel</button>
          </div>
        </div>

        <!-- Drag Over Overlay -->
        <div class="drag-overlay" id="drag-overlay">
          <div class="drag-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>Drop <code>report.json</code> to view instant scorecard</p>
          </div>
        </div>

        <!-- Primary Scoreboard Banner -->
        <div class="score-banner" id="score-banner"></div>

        <!-- Category Progress Grid -->
        <div class="category-grid" id="category-grid"></div>

        <!-- Test Case Explorer Section -->
        <div class="test-explorer">
          <div class="explorer-header">
            <div class="explorer-title">
              <h3>Adversarial Test Vectors</h3>
              <span class="sub" id="explorer-count">Showing 10 tests</span>
            </div>

            <div class="explorer-filters">
              <div class="btn-group">
                <button type="button" class="filter-btn active" data-filter="all">All</button>
                <button type="button" class="filter-btn" data-filter="failed">Failed (<span id="failed-count">0</span>)</button>
                <button type="button" class="filter-btn" data-filter="passed">Passed (<span id="passed-count">0</span>)</button>
              </div>

              <select id="category-filter-select" class="select-filter">
                <option value="all">All Categories</option>
                <option value="prompt_injection">Prompt Injection</option>
                <option value="tool_restraint">Tool Restraint</option>
                <option value="data_exfiltration">Data Exfiltration</option>
              </select>

              <input type="text" id="search-filter-input" placeholder="Search vector, ID, payload..." class="search-input" />
            </div>
          </div>

          <div class="test-list" id="test-list"></div>
        </div>

        <!-- Export Footer -->
        <div class="scorecard-export-bar">
          <button type="button" class="btn btn-sm btn-ghost" id="export-json-btn">Download Report JSON</button>
          <button type="button" class="btn btn-sm btn-ghost" id="export-badge-btn">Export SVG Badge</button>
          <button type="button" class="btn btn-sm btn-ghost" id="copy-summary-btn">Copy Markdown Summary</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    // Presets
    el.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const presetKey = btn.dataset.preset;
        this.activePreset = presetKey;
        this.currentData = SAMPLES[presetKey] || SAMPLES.hardened;
        this.update();
      });
    });

    // File Input
    const fileInput = el.querySelector("#report-file-input");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const parsed = JSON.parse(evt.target.result);
              this.loadData(parsed, file.name);
            } catch (err) {
              alert("Failed to parse JSON file: " + err.message);
            }
          };
          reader.readAsText(file);
        }
      });
    }

    // Drag & Drop
    const wrapper = el.querySelector(".scorecard-wrapper");
    const overlay = el.querySelector("#drag-overlay");

    ["dragenter", "dragover"].forEach((eventName) => {
      wrapper.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.add("active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      overlay.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.classList.remove("active");
      });
    });

    overlay.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const file = dt.files && dt.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            this.loadData(parsed, file.name);
          } catch (err) {
            alert("Failed to parse dropped JSON: " + err.message);
          }
        };
        reader.readAsText(file);
      }
    });

    // Paste Drawer
    const pasteToggle = el.querySelector("#paste-json-toggle");
    const pasteDrawer = el.querySelector("#paste-drawer");
    const applyPasteBtn = el.querySelector("#btn-apply-paste");
    const cancelPasteBtn = el.querySelector("#btn-cancel-paste");
    const pasteTextarea = el.querySelector("#paste-textarea");

    pasteToggle.addEventListener("click", () => {
      const isHidden = pasteDrawer.style.display === "none";
      pasteDrawer.style.display = isHidden ? "block" : "none";
      if (isHidden) pasteTextarea.focus();
    });

    cancelPasteBtn.addEventListener("click", () => {
      pasteDrawer.style.display = "none";
      pasteTextarea.value = "";
    });

    applyPasteBtn.addEventListener("click", () => {
      try {
        const val = pasteTextarea.value.trim();
        if (!val) return;
        const parsed = JSON.parse(val);
        this.loadData(parsed, "Pasted JSON");
        pasteDrawer.style.display = "none";
        pasteTextarea.value = "";
      } catch (err) {
        alert("Invalid JSON: " + err.message);
      }
    });

    // Filter Buttons
    el.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        el.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.filterStatus = btn.dataset.filter;
        this.renderTests();
      });
    });

    // Category Filter Select
    const catSelect = el.querySelector("#category-filter-select");
    catSelect.addEventListener("change", (e) => {
      this.filterCategory = e.target.value;
      this.renderTests();
    });

    // Search Filter
    const searchInput = el.querySelector("#search-filter-input");
    searchInput.addEventListener("input", (e) => {
      this.filterSearch = e.target.value.toLowerCase().trim();
      this.renderTests();
    });

    // Export JSON
    el.querySelector("#export-json-btn").addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.currentData, null, 2));
      const a = document.createElement("a");
      a.setAttribute("href", dataStr);
      a.setAttribute("download", `agentguard-scorecard-${Date.now()}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    // Export SVG Badge
    el.querySelector("#export-badge-btn").addEventListener("click", () => {
      const grade = this.currentData.summary.grade;
      const score = Math.round(this.currentData.summary.score);
      const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="28" viewBox="0 0 168 28">
        <rect width="100" height="28" fill="#1e293b"/>
        <rect x="100" width="68" height="28" fill="${color}"/>
        <text x="12" y="18" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11" font-weight="600">AGENTGUARD</text>
        <text x="112" y="18" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700">${score}% (${grade})</text>
      </svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentguard-badge-${score}pct.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    // Copy Markdown Summary
    el.querySelector("#copy-summary-btn").addEventListener("click", async () => {
      const s = this.currentData.summary;
      const text = `### AgentGuard Scorecard Summary
- **Target:** ${this.currentData.target} (${this.currentData.model})
- **Overall Grade:** **${s.grade}** (${s.score}%)
- **Pass / Fail:** ${s.passed} passed / ${s.failed} failed out of ${s.total_tests} tests
- **Prompt Injection Defense:** ${s.categories.prompt_injection?.score || 0}%
- **Tool Restraint & Scope:** ${s.categories.tool_restraint?.score || 0}%
- **Data Exfiltration:** ${s.categories.data_exfiltration?.score || 0}%
- **Critical Vulnerabilities:** ${s.severities.critical?.failed || 0} unmitigated
`;
      try {
        await navigator.clipboard.writeText(text);
        const btn = el.querySelector("#copy-summary-btn");
        const orig = btn.textContent;
        btn.textContent = "Copied to Clipboard!";
        setTimeout(() => (btn.textContent = orig), 2000);
      } catch (e) {
        alert("Clipboard copy failed, please copy manually.");
      }
    });
  }

  update(labelOverride) {
    this.renderBanner(labelOverride);
    this.renderCategories();
    this.renderTests();
  }

  renderBanner(labelOverride) {
    const el = document.getElementById("score-banner");
    if (!el) return;

    const data = this.currentData;
    const summary = data.summary;
    const score = Math.round(summary.score);
    const gradeClass = summary.grade === "A" ? "grade-a" : summary.grade === "B" ? "grade-b" : summary.grade === "C" ? "grade-c" : "grade-f";

    el.innerHTML = `
      <div class="banner-inner">
        <div class="grade-badge ${gradeClass}">
          <span class="grade-letter">${this.escapeHtml(summary.grade)}</span>
          <span class="grade-label">${score}% PASS</span>
        </div>

        <div class="banner-details">
          <div class="agent-title-row">
            <h4>${this.escapeHtml(labelOverride || data.agent_name)}</h4>
            <span class="pill-meta">${this.escapeHtml(data.model)}</span>
            <span class="pill-meta">${this.escapeHtml(data.suite_version)}</span>
          </div>
          <p class="banner-subtitle">
            Target: <code>${this.escapeHtml(data.target)}</code> &bull; Ran ${summary.total_tests} adversarial vectors in ${(summary.duration_ms / 1000).toFixed(1)}s
          </p>

          <div class="stat-pills">
            <span class="stat-pill pill-pass"><strong>${summary.passed}</strong> Passed</span>
            <span class="stat-pill pill-fail"><strong>${summary.failed}</strong> Failed</span>
            <span class="stat-pill pill-crit"><strong>${summary.severities.critical?.failed || 0}</strong> Critical Breaches</span>
          </div>
        </div>
      </div>
    `;

    // Update filter counts
    const failedCountEl = document.getElementById("failed-count");
    const passedCountEl = document.getElementById("passed-count");
    if (failedCountEl) failedCountEl.textContent = summary.failed;
    if (passedCountEl) passedCountEl.textContent = summary.passed;
  }

  renderCategories() {
    const el = document.getElementById("category-grid");
    if (!el) return;

    const cats = this.currentData.summary.categories || {};
    const catKeys = Object.keys(cats);

    const labels = {
      prompt_injection: "Prompt Injection Defense",
      tool_restraint: "Tool Restraint & Scope Guard",
      data_exfiltration: "Data Exfiltration & Privacy"
    };

    el.innerHTML = catKeys
      .map((key) => {
        const c = cats[key];
        const score = Math.round(c.score);
        const barColor = score >= 90 ? "bg-emerald" : score >= 70 ? "bg-amber" : "bg-rose";
        return `
        <div class="category-card">
          <div class="cat-header">
            <span class="cat-name">${this.escapeHtml(labels[key] || key.replace(/_/g, " "))}</span>
            <span class="cat-score">${score}%</span>
          </div>
          <div class="cat-bar">
            <div class="cat-fill ${barColor}" style="width: ${score}%"></div>
          </div>
          <div class="cat-footer">
            <span>${c.passed} passed</span>
            <span>${c.failed} failed</span>
          </div>
        </div>
      `;
      })
      .join("");
  }

  renderTests() {
    const el = document.getElementById("test-list");
    const countEl = document.getElementById("explorer-count");
    if (!el) return;

    const tests = this.currentData.tests || [];

    const filtered = tests.filter((t) => {
      if (this.filterStatus === "passed" && !t.passed) return false;
      if (this.filterStatus === "failed" && t.passed) return false;

      if (this.filterCategory !== "all" && t.category !== this.filterCategory) {
        return false;
      }

      if (this.filterSearch) {
        const query = this.filterSearch;
        const matchTitle = (t.title || "").toLowerCase().includes(query);
        const matchId = (t.id || "").toLowerCase().includes(query);
        const matchPayload = (t.payload || "").toLowerCase().includes(query);
        const matchVector = (t.attack_vector || "").toLowerCase().includes(query);
        if (!matchTitle && !matchId && !matchPayload && !matchVector) return false;
      }

      return true;
    });

    if (countEl) {
      countEl.textContent = `Showing ${filtered.length} of ${tests.length} tests`;
    }

    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-tests">No test vectors matched your filter criteria.</div>`;
      return;
    }

    el.innerHTML = filtered
      .map((t, idx) => {
        const passClass = t.passed ? "test-passed" : "test-failed";
        const statusBadge = t.passed
          ? `<span class="badge badge-pass">&#10003; PASS</span>`
          : `<span class="badge badge-fail">&#10007; FAIL</span>`;

        const sevClass = `sev-${this.escapeHtml(t.severity || "medium")}`;

        return `
        <div class="test-item ${passClass}" data-index="${idx}">
          <div class="test-row-header">
            <div class="test-id-col">
              <span class="test-id">${this.escapeHtml(t.id)}</span>
              ${statusBadge}
            </div>

            <div class="test-title-col">
              <span class="test-title">${this.escapeHtml(t.title)}</span>
              <div class="test-tags">
                <span class="tag-badge ${sevClass}">${this.escapeHtml((t.severity || "medium").toUpperCase())}</span>
                <span class="tag-badge tag-vector">${this.escapeHtml(t.attack_vector)}</span>
              </div>
            </div>

            <div class="test-meta-col">
              <span class="latency">${t.latency_ms || 0}ms</span>
              <button type="button" class="expand-btn" aria-label="Toggle details">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>

          <!-- Collapsible Drawer -->
          <div class="test-drawer">
            <div class="drawer-grid">
              <div class="drawer-block">
                <span class="drawer-label">Adversarial Input Payload:</span>
                <pre class="code-preview"><code>${this.escapeHtml(t.payload || "N/A")}</code></pre>
              </div>

              <div class="drawer-block">
                <span class="drawer-label">Intercepted Action / Tool Call:</span>
                <pre class="code-preview tool-code"><code>${this.escapeHtml(t.tool_invoked || "(No tool dispatched / execution intercepted)")}</code></pre>
              </div>
            </div>

            <div class="drawer-verdict">
              <span class="verdict-label">Policy Evaluation:</span>
              <p class="verdict-reason">${this.escapeHtml(t.reason || "")}</p>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // Accordion toggles
    el.querySelectorAll(".test-item").forEach((item) => {
      const header = item.querySelector(".test-row-header");
      header.addEventListener("click", () => {
        item.classList.toggle("open");
      });
    });
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
