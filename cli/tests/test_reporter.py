"""
Unit tests for agentguard.reporter.
"""

import json
import os
import tempfile
from agentguard.policy import load_policy
from agentguard.reporter import (
    calculate_grade,
    compute_report,
    generate_html_report,
    generate_json_report,
)
from agentguard.runners import MockHardenedRunner
from agentguard.scenarios import ALL_SCENARIOS


def test_calculate_grade():
    assert calculate_grade(95.0) == "A"
    assert calculate_grade(90.0) == "A"
    assert calculate_grade(85.0) == "B"
    assert calculate_grade(75.0) == "C"
    assert calculate_grade(65.0) == "D"
    assert calculate_grade(40.0) == "F"


def test_compute_report_and_exports():
    runner = MockHardenedRunner()
    transcripts = [runner.run_scenario(s) for s in ALL_SCENARIOS]
    policy = load_policy()

    report = compute_report(transcripts, target="mock-hardened", policy=policy)
    assert report.total_scenarios == 30
    assert report.passed_count == 30
    assert report.failed_count == 0
    assert report.pass_rate_pct == 100.0
    assert report.grade == "A"
    assert len(report.categories) == 3

    with tempfile.TemporaryDirectory() as tmpdir:
        json_file = os.path.join(tmpdir, "test_report.json")
        html_file = os.path.join(tmpdir, "test_report.html")

        # Test JSON generation
        json_out = generate_json_report(report, json_file)
        assert os.path.exists(json_file)
        loaded = json.loads(json_out)
        assert loaded["grade"] == "A"
        assert loaded["passed_count"] == 30

        # Test HTML generation
        html_out = generate_html_report(report, html_file)
        assert os.path.exists(html_file)
        assert "<title>AgentGuard Scorecard" in html_out
        assert "MELCH TECH" in html_out
        assert "PASS" in html_out
