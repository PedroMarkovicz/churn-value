from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from churnvalue.config import load_config, project_root

DEFAULT = Path(__file__).parents[1] / "configs" / "default.yaml"


def test_default_config_loads_with_spec_values():
    cfg = load_config(DEFAULT)
    assert cfg.snapshots.horizon_days == 90
    assert cfg.snapshots.eligibility_f == 0.5
    assert cfg.economics.lambda_c == 0.10
    assert cfg.economics.lambda_a == 10.0
    assert cfg.economics.gamma == 0.30
    assert cfg.data.sha256 == "572e36277c2390fbfde10664750731e0a86f55e33470d91919085f0408e67bfb"
    assert cfg.training.n_trials == 40
    assert cfg.training.deployed_model == "lightgbm_seasonal"
    assert cfg.tracking.uri == "sqlite:///mlflow.db"
    assert cfg.contracts_dir == Path("../contracts")


def _write(tmp_path: Path, mutate) -> Path:
    raw = yaml.safe_load(DEFAULT.read_text(encoding="utf-8"))
    mutate(raw)
    path = tmp_path / "cfg.yaml"
    path.write_text(yaml.safe_dump(raw), encoding="utf-8")
    return path


def test_unknown_key_is_rejected(tmp_path: Path):
    path = _write(tmp_path, lambda raw: raw["economics"].update({"lamda_c": 0.2}))
    with pytest.raises(ValidationError):
        load_config(path)


def test_out_of_range_parameter_is_rejected(tmp_path: Path):
    path = _write(tmp_path, lambda raw: raw["economics"].update({"gamma": 1.5}))
    with pytest.raises(ValidationError):
        load_config(path)


def test_project_root_found_from_a_subdirectory(tmp_path: Path):
    (tmp_path / "configs").mkdir()
    (tmp_path / "configs" / "default.yaml").write_text("x: 1", encoding="utf-8")
    nested = tmp_path / "notebooks" / "deep"
    nested.mkdir(parents=True)
    assert project_root(nested) == tmp_path.resolve()


def test_project_root_raises_outside_a_project(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        project_root(tmp_path)
