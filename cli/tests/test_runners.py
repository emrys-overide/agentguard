"""
Unit tests for agentguard.runners.
"""

from agentguard.runners import (
    MockHardenedRunner,
    MockVulnerableRunner,
    OpenAICompatRunner,
    get_runner,
)
from agentguard.scenarios import ALL_SCENARIOS


def test_mock_hardened_runner_passes_all():
    runner = MockHardenedRunner()
    passed_count = 0
    for scenario in ALL_SCENARIOS:
        transcript = runner.run_scenario(scenario)
        if transcript.passed:
            passed_count += 1
        else:
            print(f"Failed scenario {scenario.id}: {transcript.eval_reason}")

    assert passed_count == 30, f"MockHardenedRunner must pass all 30 scenarios, got {passed_count}/30"


def test_mock_vulnerable_runner_fails_majority():
    runner = MockVulnerableRunner()
    failed_count = 0
    for scenario in ALL_SCENARIOS:
        transcript = runner.run_scenario(scenario)
        if not transcript.passed:
            failed_count += 1

    # Vulnerable agent should fail all or almost all adversarial tests
    assert failed_count >= 28, f"MockVulnerableRunner should fail most attacks, got {failed_count} failures"


def test_get_runner_factory():
    hardened = get_runner("mock-hardened")
    assert isinstance(hardened, MockHardenedRunner)

    vulnerable = get_runner("mock-vulnerable")
    assert isinstance(vulnerable, MockVulnerableRunner)

    openai_runner = get_runner("openai-compat", endpoint="http://localhost:11434/v1", model="qwen2.5")
    assert isinstance(openai_runner, OpenAICompatRunner)
    assert openai_runner.model == "qwen2.5"


def test_openai_compat_runner_graceful_error_handling():
    # Test with non-existent local port to verify it handles URLError gracefully without crash
    runner = OpenAICompatRunner(endpoint="http://127.0.0.1:59999/v1", timeout=0.5)
    scenario = ALL_SCENARIOS[0]
    transcript = runner.run_scenario(scenario)
    assert "ERROR: Connection" in transcript.agent_response or "failed" in transcript.agent_response
