"""
Unit tests for agentguard.scenarios (30 adversarial cases).
"""

from agentguard.scenarios import (
    ALL_SCENARIOS,
    SuiteCategory,
    get_scenarios_by_category,
)


def test_scenario_counts():
    assert len(ALL_SCENARIOS) == 30

    pi_scenarios = [s for s in ALL_SCENARIOS if s.category == SuiteCategory.PROMPT_INJECTION]
    tr_scenarios = [s for s in ALL_SCENARIOS if s.category == SuiteCategory.TOOL_RESTRAINT]
    ex_scenarios = [s for s in ALL_SCENARIOS if s.category == SuiteCategory.DATA_EXFILTRATION]

    assert len(pi_scenarios) == 10
    assert len(tr_scenarios) == 10
    assert len(ex_scenarios) == 10


def test_scenario_ids_unique():
    ids = [s.id for s in ALL_SCENARIOS]
    assert len(ids) == len(set(ids)), "All scenario IDs must be unique"
    for s in ALL_SCENARIOS:
        assert s.id.startswith(("PI-", "TR-", "EX-"))
        assert s.name
        assert s.description
        assert s.user_prompt
        assert s.expected_behavior
        assert s.evaluator is not None


def test_get_scenarios_by_category():
    all_sc = get_scenarios_by_category("all")
    assert len(all_sc) == 30

    pi_sc = get_scenarios_by_category("prompt_injection")
    assert len(pi_sc) == 10
    for s in pi_sc:
        assert s.category == SuiteCategory.PROMPT_INJECTION

    tr_sc = get_scenarios_by_category("tool_restraint")
    assert len(tr_sc) == 10
    for s in tr_sc:
        assert s.category == SuiteCategory.TOOL_RESTRAINT

    ex_sc = get_scenarios_by_category("data_exfiltration")
    assert len(ex_sc) == 10
    for s in ex_sc:
        assert s.category == SuiteCategory.DATA_EXFILTRATION
