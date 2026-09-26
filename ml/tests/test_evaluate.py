import json
from pathlib import Path

import numpy as np
import pytest

from churnvalue.config import load_config
from churnvalue.economics import EconomicParams, customer_economics
from churnvalue.evaluate import evaluate_baselines, policy_table
from churnvalue.snapshots import build_snapshots

PARAMS = EconomicParams(
    margin=0.35, lambda_c=0.10, lambda_a=10.0, gamma=0.30, contact_cost=1.0, value_horizon_days=365
)
DEFAULT = Path(__file__).parents[1] / "configs" / "default.yaml"


def test_policy_table_hand_computed():
    y = np.array([1.0, 0.0, 1.0, 0.0])
    econ = customer_economics([1000.0] * 4, PARAMS)
    # realized per customer: churner 269, non-churner -101
    perfect = np.array([0.99, 0.01, 0.99, 0.01])
    rows = {r["policy"]: r for r in policy_table(y, {"model": perfect}, econ, PARAMS)}
    assert rows["do_nothing"]["realized_profit"] == 0.0
    assert rows["contact_all"]["realized_profit"] == pytest.approx(2 * 269 - 2 * 101)
    assert rows["oracle"]["realized_profit"] == pytest.approx(538.0)
    assert rows["model"]["n_contacted"] == 2
    assert rows["model"]["share_of_oracle"] == pytest.approx(1.0)
    # random with k=2 in expectation: 2 * mean(269, -101, 269, -101) = 168
    assert rows["model"]["random_same_k_profit"] == pytest.approx(168.0)


def test_evaluate_baselines_end_to_end_on_synthetic(tx_synthetic):
    cfg = load_config(DEFAULT)
    cfg = cfg.model_copy(
        update={"evaluation": cfg.evaluation.model_copy(update={"n_bootstrap": 100})}
    )
    report = evaluate_baselines(build_snapshots(tx_synthetic, cfg.snapshots), cfg)
    json.dumps(report)  # must be JSON-serialisable
    assert report["split"]["test"] == "2011-09-10"
    assert set(report["models"]) == {"cadence_rule", "bgnbd"}
    for model in report["models"].values():
        for metric in model["metrics"].values():
            assert metric["ci_low"] <= metric["value"] <= metric["ci_high"]
    names = [r["policy"] for r in report["policies"]]
    assert names == ["do_nothing", "contact_all", "cadence_rule", "bgnbd", "oracle"]
