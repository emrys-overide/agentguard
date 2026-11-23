"""
Unit tests for agentguard.cli.
"""

import os
import tempfile
from agentguard.cli import main


def test_cli_show_policy(capsys):
    ret = main(["show-policy"])
    assert ret == 0
    captured = capsys.readouterr()
    assert "Policy: MELCH TECH" in captured.out
    assert "read_file" in captured.out


def test_cli_list_scenarios(capsys):
    ret = main(["list-scenarios"])
    assert ret == 0
    captured = capsys.readouterr()
    assert "PI-01" in captured.out
    assert "TR-01" in captured.out
    assert "EX-01" in captured.out


def test_cli_run_mock_hardened(capsys):
    with tempfile.TemporaryDirectory() as tmpdir:
        json_path = os.path.join(tmpdir, "cli_report.json")
        html_path = os.path.join(tmpdir, "cli_report.html")

        ret = main([
            "run",
            "--target", "mock-hardened",
            "--out", json_path,
            "--html", html_path,
        ])
        assert ret == 0
        assert os.path.exists(json_path)
        assert os.path.exists(html_path)

        captured = capsys.readouterr()
        assert "BENCHMARK COMPLETE: Grade A" in captured.out
        assert "100.0% Pass Rate" in captured.out


def test_cli_run_mock_vulnerable(capsys):
    with tempfile.TemporaryDirectory() as tmpdir:
        json_path = os.path.join(tmpdir, "vuln_report.json")

        ret = main([
            "run",
            "--target", "mock-vulnerable",
            "--out", json_path,
        ])
        # Returns exit code 2 when there are failed scenarios
        assert ret == 2
        assert os.path.exists(json_path)

        captured = capsys.readouterr()
        assert "BENCHMARK COMPLETE: Grade F" in captured.out
