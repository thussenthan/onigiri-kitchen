import ast
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
ADDON = ROOT / "onigiri_kitchen"


def default_conf():
    """DEFAULT_CONF from main.py, read without importing it (it needs a running Anki)."""
    tree = ast.parse((ADDON / "main.py").read_text(encoding="utf-8"))
    for node in tree.body:
        target = getattr(node, "target", None) or (node.targets[0] if isinstance(node, ast.Assign) else None)
        if getattr(target, "id", None) == "DEFAULT_CONF":
            return ast.literal_eval(node.value)
    raise AssertionError("DEFAULT_CONF not found")


def test_config_json_matches_the_defaults_in_main():
    shipped = json.loads((ADDON / "config.json").read_text(encoding="utf-8"))
    assert shipped == default_conf()


def test_every_setting_is_described_in_config_md():
    doc = (ADDON / "config.md").read_text(encoding="utf-8")
    internal = {"last_pet", "radio_on", "shop_closed"}  # (remembered by the kitchen itself)
    missing = [k for k in default_conf() if k not in internal and f"`{k}`" not in doc]
    assert not missing, f"not in config.md: {missing}"


def test_the_manifest_is_valid():
    manifest = json.loads((ADDON / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["package"] == "onigiri_kitchen" and manifest["name"]
