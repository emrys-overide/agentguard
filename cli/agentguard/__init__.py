"""
AgentGuard: Local-First AI Agent Safety Harness & Adversarial Benchmark CLI
By MELCH TECH Engineering.
"""

__version__ = "0.1.0"

from agentguard.policy import Policy, load_policy
from agentguard.scenarios import (
    Scenario,
    SuiteCategory,
    EvaluationResult,
    ALL_SCENARIOS,
    get_scenarios_by_category,
)
from agentguard.runners import (
    BaseRunner,
    ScenarioTranscript,
    MockVulnerableRunner,
    MockHardenedRunner,
    OpenAICompatRunner,
    get_runner,
)
from agentguard.reporter import BenchmarkReport, generate_json_report, generate_html_report

__all__ = [
    "__version__",
    "Policy",
    "load_policy",
    "Scenario",
    "SuiteCategory",
    "EvaluationResult",
    "ALL_SCENARIOS",
    "get_scenarios_by_category",
    "BaseRunner",
    "ScenarioTranscript",
    "MockVulnerableRunner",
    "MockHardenedRunner",
    "OpenAICompatRunner",
    "get_runner",
    "BenchmarkReport",
    "generate_json_report",
    "generate_html_report",
]
