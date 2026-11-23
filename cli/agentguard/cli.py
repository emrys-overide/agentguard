"""
AgentGuard CLI: Command-line interface for running safety benchmarks.
"""

from __future__ import annotations
import argparse
import sys
from typing import List, Optional

from agentguard import __version__
from agentguard.policy import Policy, load_policy
from agentguard.reporter import compute_report, generate_html_report, generate_json_report
from agentguard.runners import ScenarioTranscript, get_runner
from agentguard.scenarios import ALL_SCENARIOS, Scenario, get_scenarios_by_category


def run_benchmark(
    target: str = "mock-hardened",
    policy_path: Optional[str] = None,
    suite: str = "all",
    endpoint: Optional[str] = None,
    model: str = "llama3",
    api_key: Optional[str] = None,
    json_out: Optional[str] = None,
    html_out: Optional[str] = None,
    verbose: bool = False,
) -> int:
    policy = load_policy(policy_path)
    scenarios = get_scenarios_by_category(suite)

    if not scenarios:
        print(f"[!] No scenarios found for suite category: '{suite}'")
        return 1

    runner_kwargs = {}
    if endpoint:
        runner_kwargs["endpoint"] = endpoint
    if model:
        runner_kwargs["model"] = model
    if api_key:
        runner_kwargs["api_key"] = api_key

    try:
        runner = get_runner(target, policy=policy, **runner_kwargs)
    except Exception as e:
        print(f"[!] Error initializing runner '{target}': {e}")
        return 1

    print("=" * 72)
    print(f" AgentGuard v{__version__} - MELCH TECH AI Safety Benchmark")
    print(f" Target: {runner.name} | Policy: {policy.title}")
    print(f" Evaluating {len(scenarios)} scenarios across suite: '{suite}'")
    print("=" * 72)

    transcripts: List[ScenarioTranscript] = []
    for sc in scenarios:
        transcript = runner.run_scenario(sc)
        transcripts.append(transcript)
        status_tag = "[PASS]" if transcript.passed else "[FAIL]"
        color_start = "\033[92m" if transcript.passed else "\033[91m"
        color_end = "\033[0m"

        line = f" {status_tag} {sc.id:<6} {sc.category.value:<18} {sc.name[:32]:<32} ({transcript.duration_ms:.1f}ms)"
        # Try ANSI colored output if supported
        try:
            print(f" {color_start}{status_tag}{color_end} {sc.id:<6} {sc.category.value:<18} {sc.name[:32]:<32} ({transcript.duration_ms:.1f}ms)")
        except Exception:
            print(line)

        if verbose or not transcript.passed:
            print(f"       Reason: {transcript.eval_reason}")

    report = compute_report(transcripts, target=target, policy=policy)

    print("-" * 72)
    print(f" BENCHMARK COMPLETE: Grade {report.grade} ({report.pass_rate_pct}% Pass Rate)")
    print(f" Passed: {report.passed_count}/{report.total_scenarios} | Failed: {report.failed_count} | Duration: {report.total_duration_ms:.1f}ms")
    print("-" * 72)
    for cat_name, c_data in report.categories.items():
        print(f"  * {cat_name.replace('_', ' ').title():<22}: {c_data['passed']}/{c_data['total']} ({c_data['pass_rate_pct']}%)")
    print("=" * 72)

    if json_out:
        generate_json_report(report, json_out)
        print(f"[+] JSON report saved to: {json_out}")

    if html_out:
        generate_html_report(report, html_out)
        print(f"[+] HTML scorecard saved to: {html_out}")

    return 0 if report.failed_count == 0 else 2


def list_scenarios(suite: str = "all") -> int:
    scenarios = get_scenarios_by_category(suite)
    print("=" * 80)
    print(f" AgentGuard Adversarial Benchmark Suite ({len(scenarios)} scenarios)")
    print("=" * 80)
    print(f"{'ID':<7} {'Category':<18} {'Scenario Name':<32} Description")
    print("-" * 80)
    for s in scenarios:
        print(f"{s.id:<7} {s.category.value:<18} {s.name[:30]:<32} {s.description}")
    print("=" * 80)
    return 0


def show_policy(policy_path: Optional[str] = None) -> int:
    policy = load_policy(policy_path)
    print("=" * 70)
    print(f" Policy: {policy.title}")
    if policy.path:
        print(f" Source: {policy.path}")
    print("=" * 70)
    print("Allowed Tools:")
    for t in policy.allowed_tools:
        print(f"  + {t}")
    print("\nStrictly Forbidden Tools:")
    for t in policy.forbidden_tools:
        print(f"  - {t}")
    print("\nProtected Sensitive Tokens:")
    for t in policy.sensitive_tokens:
        print(f"  * {t}")
    print("=" * 70)
    return 0


def main(args: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agentguard",
        description="MELCH TECH AgentGuard: Local-First AI Agent Safety & Benchmark CLI",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Command: run
    run_parser = subparsers.add_parser("run", help="Run adversarial benchmark suite against a target agent")
    run_parser.add_argument(
        "--target",
        choices=["mock-hardened", "mock-vulnerable", "openai-compat"],
        default="mock-hardened",
        help="Target agent runner to evaluate (default: mock-hardened)",
    )
    run_parser.add_argument("--policy", help="Path to custom SOUL.md guardrail policy")
    run_parser.add_argument(
        "--suite",
        choices=["all", "prompt_injection", "tool_restraint", "data_exfiltration"],
        default="all",
        help="Adversarial suite subset to run (default: all)",
    )
    run_parser.add_argument("--endpoint", help="OpenAI-compatible chat completion endpoint URL (for openai-compat)")
    run_parser.add_argument("--model", default="llama3", help="Model name for openai-compat (default: llama3)")
    run_parser.add_argument("--api-key", help="API key for target endpoint (if needed)")
    run_parser.add_argument("--out", help="Output path for JSON report (e.g. report.json)")
    run_parser.add_argument("--html", help="Output path for standalone HTML scorecard (e.g. report.html)")
    run_parser.add_argument("-v", "--verbose", action="store_true", help="Print verbose evaluation details")

    # Command: list-scenarios
    list_parser = subparsers.add_parser("list-scenarios", help="List all 30 adversarial benchmark scenarios")
    list_parser.add_argument(
        "--suite",
        choices=["all", "prompt_injection", "tool_restraint", "data_exfiltration"],
        default="all",
        help="Filter scenarios by suite (default: all)",
    )

    # Command: show-policy
    show_parser = subparsers.add_parser("show-policy", help="Inspect active guardrail policy rules and allowlists")
    show_parser.add_argument("--policy", help="Path to custom SOUL.md policy")

    parsed = parser.parse_args(args)

    if parsed.command == "run":
        return run_benchmark(
            target=parsed.target,
            policy_path=parsed.policy,
            suite=parsed.suite,
            endpoint=parsed.endpoint,
            model=parsed.model,
            api_key=parsed.api_key,
            json_out=parsed.out,
            html_out=parsed.html,
            verbose=parsed.verbose,
        )
    elif parsed.command == "list-scenarios":
        return list_scenarios(suite=parsed.suite)
    elif parsed.command == "show-policy":
        return show_policy(policy_path=parsed.policy)
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
