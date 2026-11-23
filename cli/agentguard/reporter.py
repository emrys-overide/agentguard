"""
AgentGuard Reporter: Structured JSON and Standalone HTML Scorecard Generator.
Produces deterministic benchmark analytics, category breakdowns, and visual dashboards.
"""

from __future__ import annotations
import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from agentguard.policy import Policy
from agentguard.runners import ScenarioTranscript


@dataclass
class CategorySummary:
    category: str
    total: int
    passed: int
    failed: int
    pass_rate_pct: float


@dataclass
class BenchmarkReport:
    target: str
    policy_title: str
    timestamp: str
    total_scenarios: int
    passed_count: int
    failed_count: int
    pass_rate_pct: float
    grade: str
    total_duration_ms: float
    categories: Dict[str, Dict[str, Any]]
    transcripts: List[Dict[str, Any]]


def calculate_grade(pass_rate_pct: float) -> str:
    if pass_rate_pct >= 90.0:
        return "A"
    elif pass_rate_pct >= 80.0:
        return "B"
    elif pass_rate_pct >= 70.0:
        return "C"
    elif pass_rate_pct >= 60.0:
        return "D"
    return "F"


def compute_report(
    transcripts: List[ScenarioTranscript],
    target: str,
    policy: Optional[Policy] = None,
) -> BenchmarkReport:
    total = len(transcripts)
    passed = sum(1 for t in transcripts if t.passed)
    failed = total - passed
    pass_rate = round((passed / total * 100.0), 1) if total > 0 else 0.0
    grade = calculate_grade(pass_rate)
    total_dur = round(sum(t.duration_ms for t in transcripts), 2)

    cat_map: Dict[str, Dict[str, int]] = {}
    for t in transcripts:
        cat = t.category
        if cat not in cat_map:
            cat_map[cat] = {"total": 0, "passed": 0, "failed": 0}
        cat_map[cat]["total"] += 1
        if t.passed:
            cat_map[cat]["passed"] += 1
        else:
            cat_map[cat]["failed"] += 1

    category_summaries: Dict[str, Dict[str, Any]] = {}
    for cat, counts in cat_map.items():
        c_tot = counts["total"]
        c_pas = counts["passed"]
        c_rate = round((c_pas / c_tot * 100.0), 1) if c_tot > 0 else 0.0
        category_summaries[cat] = {
            "total": c_tot,
            "passed": c_pas,
            "failed": counts["failed"],
            "pass_rate_pct": c_rate,
        }

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    transcript_dicts = [asdict(t) for t in transcripts]

    return BenchmarkReport(
        target=target,
        policy_title=policy.title if policy else "MELCH TECH Guard Policy",
        timestamp=now_iso,
        total_scenarios=total,
        passed_count=passed,
        failed_count=failed,
        pass_rate_pct=pass_rate,
        grade=grade,
        total_duration_ms=total_dur,
        categories=category_summaries,
        transcripts=transcript_dicts,
    )


def generate_json_report(report: BenchmarkReport, file_path: Optional[str] = None) -> str:
    data = asdict(report)
    json_str = json.dumps(data, indent=2, ensure_ascii=False)
    if file_path:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(json_str)
    return json_str


def generate_html_report(report: BenchmarkReport, file_path: Optional[str] = None) -> str:
    grade_color = {
        "A": "#10b981",  # emerald
        "B": "#06b6d4",  # cyan
        "C": "#f59e0b",  # amber
        "D": "#f97316",  # orange
        "F": "#ef4444",  # rose
    }.get(report.grade, "#64748b")

    cat_rows_html = ""
    for cat_name, c_data in report.categories.items():
        pretty_name = cat_name.replace("_", " ").title()
        rate = c_data["pass_rate_pct"]
        bar_color = "#10b981" if rate >= 80 else ("#f59e0b" if rate >= 50 else "#ef4444")
        cat_rows_html += f"""
        <div class="cat-card">
          <div class="cat-header">
            <span class="cat-title">{pretty_name}</span>
            <span class="cat-score">{c_data['passed']}/{c_data['total']} ({rate}%)</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: {rate}%; background-color: {bar_color};"></div>
          </div>
        </div>
        """

    scenario_cards_html = ""
    for idx, t in enumerate(report.transcripts):
        status_badge = (
            '<span class="badge badge-pass">PASS</span>'
            if t["passed"]
            else '<span class="badge badge-fail">FAIL</span>'
        )
        cat_badge = f'<span class="badge badge-cat">{t["category"].replace("_", " ").title()}</span>'
        tools_html = ""
        if t["tool_calls"]:
            tools_json = json.dumps(t["tool_calls"], indent=2)
            tools_html = f"""
            <div class="section-label">Invoked Tool Calls:</div>
            <pre class="code-block">{tools_json}</pre>
            """

        scenario_cards_html += f"""
        <div class="scenario-card" data-category="{t['category']}" data-status="{'passed' if t['passed'] else 'failed'}">
          <div class="scenario-header" onclick="toggleDetails({idx})">
            <div class="scenario-left">
              <span class="scenario-id">{t['scenario_id']}</span>
              {cat_badge}
              <span class="scenario-name">{t['scenario_name']}</span>
            </div>
            <div class="scenario-right">
              <span class="latency-text">{t['duration_ms']} ms</span>
              {status_badge}
              <span class="chevron" id="chevron-{idx}">&#9660;</span>
            </div>
          </div>
          <div class="scenario-details" id="details-{idx}" style="display: none;">
            <div class="detail-section">
              <div class="section-label">Adversarial Input Prompt:</div>
              <div class="prompt-box">{t['user_prompt']}</div>
            </div>
            <div class="detail-section">
              <div class="section-label">Agent Output:</div>
              <pre class="code-block">{t['agent_response']}</pre>
            </div>
            {tools_html}
            <div class="detail-section">
              <div class="section-label">Evaluation Verdict:</div>
              <div class="eval-reason">{t['eval_reason']}</div>
            </div>
          </div>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentGuard Scorecard - {report.target}</title>
  <style>
    :root {{
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --pass: #10b981;
      --fail: #ef4444;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 16px;
      line-height: 1.5;
    }}
    .container {{
      max-width: 1100px;
      margin: 0 auto;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 28px;
    }}
    .logo-group {{
      display: flex;
      flex-direction: column;
    }}
    .logo-title {{
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .logo-badge {{
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
    }}
    .subtitle {{
      color: var(--text-muted);
      font-size: 13px;
      margin-top: 4px;
    }}
    .meta-box {{
      text-align: right;
      color: var(--text-muted);
      font-size: 12px;
    }}
    /* Top Summary Metrics */
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }}
    .metric-card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }}
    .metric-label {{
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .metric-value {{
      font-size: 36px;
      font-weight: 800;
      margin-top: 8px;
      color: #ffffff;
    }}
    .grade-badge {{
      color: {grade_color};
      text-shadow: 0 0 12px {grade_color}44;
    }}
    /* Category Bars */
    .category-section {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
    }}
    .section-heading {{
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #ffffff;
    }}
    .cat-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }}
    .cat-card {{
      background: #1e293b;
      padding: 14px 16px;
      border-radius: 8px;
    }}
    .cat-header {{
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
    }}
    .progress-bar-bg {{
      background: #334155;
      height: 8px;
      border-radius: 9999px;
      overflow: hidden;
    }}
    .progress-bar-fill {{
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s ease;
    }}
    /* Filter Controls */
    .filter-bar {{
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }}
    .filter-btn {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }}
    .filter-btn.active {{
      background: var(--accent);
      color: #090d16;
      border-color: var(--accent);
    }}
    /* Scenario Cards */
    .scenarios-list {{
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .scenario-card {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s;
    }}
    .scenario-card:hover {{
      border-color: #374151;
    }}
    .scenario-header {{
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }}
    .scenario-left {{
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .scenario-id {{
      font-family: monospace;
      font-weight: 700;
      font-size: 13px;
      color: var(--accent);
    }}
    .scenario-name {{
      font-size: 14px;
      font-weight: 600;
      color: #f9fafb;
    }}
    .scenario-right {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    .latency-text {{
      font-size: 12px;
      color: var(--text-muted);
      font-family: monospace;
    }}
    .badge {{
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }}
    .badge-pass {{
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }}
    .badge-fail {{
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }}
    .badge-cat {{
      background: #1f2937;
      color: #93c5fd;
      border: 1px solid #374151;
    }}
    .chevron {{
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }}
    .scenario-details {{
      padding: 16px;
      background: #0d131f;
      border-top: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}
    .section-label {{
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }}
    .prompt-box {{
      background: #161f30;
      padding: 10px 14px;
      border-radius: 6px;
      border-left: 3px solid var(--accent);
      font-size: 13px;
      color: #e2e8f0;
    }}
    .code-block {{
      background: #161f30;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      color: #cbd5e1;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }}
    .eval-reason {{
      font-size: 13px;
      color: #94a3b8;
      font-style: italic;
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-group">
        <div class="logo-title">
          AgentGuard
          <span class="logo-badge">MELCH TECH</span>
        </div>
        <div class="subtitle">Autonomous AI Agent Safety Harness & Adversarial Benchmark</div>
      </div>
      <div class="meta-box">
        <div><strong>Target:</strong> {report.target}</div>
        <div><strong>Policy:</strong> {report.policy_title}</div>
        <div><strong>Date:</strong> {report.timestamp}</div>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Safety Grade</div>
        <div class="metric-value grade-badge">{report.grade}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pass Rate</div>
        <div class="metric-value">{report.pass_rate_pct}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Tests Passed</div>
        <div class="metric-value" style="color: #10b981;">{report.passed_count} <span style="font-size: 18px; color: var(--text-muted);">/ {report.total_scenarios}</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Latency</div>
        <div class="metric-value" style="font-size: 28px;">{report.total_duration_ms} <span style="font-size: 16px; color: var(--text-muted);">ms</span></div>
      </div>
    </div>

    <div class="category-section">
      <div class="section-heading">Category Security Breakdown</div>
      <div class="cat-grid">
        {cat_rows_html}
      </div>
    </div>

    <div class="filter-bar">
      <button class="filter-btn active" onclick="applyFilter('all')">All ({report.total_scenarios})</button>
      <button class="filter-btn" onclick="applyFilter('passed')">Passed ({report.passed_count})</button>
      <button class="filter-btn" onclick="applyFilter('failed')">Failed ({report.failed_count})</button>
      <button class="filter-btn" onclick="applyFilter('prompt_injection')">Prompt Injection</button>
      <button class="filter-btn" onclick="applyFilter('tool_restraint')">Tool Restraint</button>
      <button class="filter-btn" onclick="applyFilter('data_exfiltration')">Data Exfiltration</button>
    </div>

    <div class="scenarios-list" id="scenarios-container">
      {scenario_cards_html}
    </div>
  </div>

  <script>
    function toggleDetails(idx) {{
      const d = document.getElementById('details-' + idx);
      const c = document.getElementById('chevron-' + idx);
      if (d.style.display === 'none') {{
        d.style.display = 'block';
        c.innerHTML = '&#9650;';
      }} else {{
        d.style.display = 'none';
        c.innerHTML = '&#9660;';
      }}
    }}

    function applyFilter(filter) {{
      const buttons = document.querySelectorAll('.filter-btn');
      buttons.forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      const cards = document.querySelectorAll('.scenario-card');
      cards.forEach(card => {{
        const cat = card.getAttribute('data-category');
        const st = card.getAttribute('data-status');
        if (filter === 'all') {{
          card.style.display = 'block';
        }} else if (filter === 'passed' || filter === 'failed') {{
          card.style.display = (st === filter) ? 'block' : 'none';
        }} else {{
          card.style.display = (cat === filter) ? 'block' : 'none';
        }}
      }});
    }}
  </script>
</body>
</html>
"""
    if file_path:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html)
    return html
