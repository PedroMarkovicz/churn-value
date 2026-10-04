"""What the repository says about itself: the licence, and the README against the files."""

import json
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
