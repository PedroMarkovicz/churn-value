from pathlib import Path

from churnvalue.config import load_config
from churnvalue.provenance import UNKNOWN, config_sha256, git_sha, run_tags

DEFAULT = Path(__file__).parents[1] / "configs" / "default.yaml"


def test_git_sha_is_unknown_outside_a_repository(tmp_path: Path):
    assert git_sha(tmp_path) == UNKNOWN


def test_config_hash_is_stable_and_sensitive():
    cfg = load_config(DEFAULT)
    assert config_sha256(cfg) == config_sha256(load_config(DEFAULT))
    changed = cfg.model_copy(update={"economics": cfg.economics.model_copy(update={"gamma": 0.31})})
    assert config_sha256(changed) != config_sha256(cfg)
    assert len(config_sha256(cfg)) == 64


def test_run_tags_name_code_config_and_data():
    cfg = load_config(DEFAULT)
    tags = run_tags(cfg)
    assert set(tags) == {"git_sha", "config_sha256", "data_sha256"}
    assert tags["data_sha256"] == cfg.data.sha256
