"""Runs main.py (the hooks and the kitchen's commands) against dev/anki_stub.py's stand-in
for Anki. Run separately from tests/: pytest tests_main"""
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "dev"))
import anki_stub  # noqa: E402


@pytest.fixture
def main():
    env = anki_stub.setup(profile="Test")
    m = env.import_("main")
    m.on_profile_open()
    m._env = env
    return m
