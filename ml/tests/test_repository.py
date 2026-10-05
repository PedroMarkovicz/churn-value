"""What the repository says about itself: the licence, and the README against the files."""

import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).parents[2]


def test_the_licence_is_mit_everywhere_it_is_stated():
    licence = (ROOT / "LICENSE").read_text(encoding="utf-8")
    assert licence.startswith("MIT License\n")
    assert "Copyright (c) 2026 Pedro Henrique Markovicz" in licence
    project = tomllib.loads((ROOT / "ml" / "pyproject.toml").read_text(encoding="utf-8"))
    assert project["project"]["license"] == "MIT"
    package = json.loads((ROOT / "web" / "package.json").read_text(encoding="utf-8"))
    assert package["license"] == "MIT"


# the model card's policy names, as the README words them
POLICIES = {
    "contact_all": "Call everyone",
    "cadence_rule": "Cadence rule",
    "bgnbd": "BG/NBD",
    "logreg": "Logistic regression",
    "lightgbm": "LightGBM",
    "lightgbm_seasonal": "LightGBM + season (deployed)",
    "oracle": "Perfect foresight",
}


def _cells(line: str) -> list[str]:
    return [
        cell.strip().replace("*", "").replace("`", "")
        for cell in line.strip().strip("|").split("|")
    ]


def _readme() -> str:
    return (ROOT / "README.md").read_text(encoding="utf-8")


def test_the_readme_quotes_the_model_cards_policy_table():
    card = (ROOT / "docs" / "model-card.md").read_text(encoding="utf-8")
    section = card.split("## Business result at the default scenario")[1]
    card_rows = {
        cells[0]: cells for cells in map(_cells, section.splitlines()) if cells[0] in POLICIES
    }
    assert set(card_rows) == set(POLICIES)
    readme_rows = {
        cells[0]: cells
        for cells in map(_cells, _readme().splitlines())
        if cells[0] in POLICIES.values()
    }
    for name, label in POLICIES.items():
        _, contacted, expected, realized, _share = card_rows[name]
        assert readme_rows[label][1:] == [contacted, expected, realized], name


def test_the_readme_links_point_at_files_that_exist():
    links = re.findall(r"\]\(([^)\s#]+)", _readme())
    local = [link for link in links if not link.startswith(("http://", "https://"))]
    assert local, "the README links to nothing in the repository"
    missing = [link for link in local if not (ROOT / link).exists()]
    assert not missing, missing


def test_the_readme_names_the_live_site():
    env = (ROOT / "web" / ".env").read_text(encoding="utf-8")
    address = re.search(r"^VITE_SITE_URL=(\S+)$", env, re.MULTILINE)
    assert address, "web/.env has no VITE_SITE_URL"
    assert address.group(1) in _readme()


def test_every_amount_in_the_readme_is_in_the_model_card():
    """The prose around the table quotes amounts too; they must not drift from the card."""
    card = (ROOT / "docs" / "model-card.md").read_text(encoding="utf-8")
    amounts = set(re.findall(r"−?£\d{1,3}(?:,\d{3})+", _readme()))
    assert len(amounts) > 10
    assert not sorted(amount for amount in amounts if amount not in card)


# the model card's model names, as the README's ladder words them
MODELS = {
    "cadence_rule": "Cadence rule",
    "bgnbd": "BG/NBD",
    "logreg": "Logistic regression",
    "lightgbm": "LightGBM",
    "lightgbm_seasonal": "LightGBM + season",
}


def test_the_readme_quotes_the_model_cards_metrics():
    """The ladder's ROC-AUC, Brier score and mean predicted churn are the model card's."""
    card = (ROOT / "docs" / "model-card.md").read_text(encoding="utf-8")
    section = card.split("## Evaluation on the test cutoff")[1].split("## ")[0]
    card_rows = {
        cells[0]: cells for cells in map(_cells, section.splitlines()) if cells[0] in MODELS
    }
    assert set(card_rows) == set(MODELS)
    ladder = {
        cells[1]: cells
        for cells in map(_cells, _readme().splitlines())
        if len(cells) == 6 and cells[1] in MODELS.values()
    }
    for name, label in MODELS.items():
        _, _pr_auc, roc_auc, brier, _lift, mean_p, _emp = card_rows[name]
        expected = [roc_auc.split(" [")[0], brier.split(" [")[0], mean_p]
        assert ladder[label][3:] == expected, name
