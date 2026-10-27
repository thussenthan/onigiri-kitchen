"""Onigiri has no public interface, so Onigiri Kitchen reads its files. These tests
pin the formats it expects; if Onigiri changes one, a test here (or the "health" line in
bug reports) says which part stopped working."""
import datetime
import json
import types

import pytest

from aqt import mw

from onigiri_kitchen import onigiri_link

DISHES_JS = """
export const SPECIAL_DISHES = {
  "default": [
    {
      name: "Tuna Mayo",
      description: "The classic.",
      difficulty: "common",
    },
    {
      name: "Golden Dragon",
      description: "Very rare.",
      difficulty: "legendary",
    },
  ],
  "macha_delights": [
    {
      name: "Matcha Mochi",
      description: "Green.",
      difficulty: "rare",
    },
  ],
};
"""


@pytest.fixture
def onigiri(tmp_path):
    root = tmp_path / "1011095603"
    (root / "gamification").mkdir(parents=True)
    (root / "user_files").mkdir()
    (root / "web" / "gamification" / "restaurant_level").mkdir(parents=True)
    (root / "manifest.json").write_text(json.dumps({"name": "Onigiri", "version": "9.9"}))
    (root / "web" / "gamification" / "restaurant_level" / "special_dishes.js").write_text(DISHES_JS)
    old = (mw.addonManager, mw.pm)
    mw.addonManager = types.SimpleNamespace(addonsFolder=lambda: str(tmp_path), allAddons=lambda: ["1011095603"])
    mw.pm = types.SimpleNamespace(name="p")
    onigiri_link._package_cache = None
    onigiri_link._SPECIALS_CACHE.update(key=None, dishes=None)
    yield root
    mw.addonManager, mw.pm = old
    onigiri_link._package_cache = None


def put(root, name, data):
    (root / "user_files" / name).write_text(json.dumps(data))


def test_without_onigiri_everything_has_a_default(tmp_path):
    old = mw.addonManager
    mw.addonManager = types.SimpleNamespace(addonsFolder=lambda: str(tmp_path), allAddons=lambda: [])
    onigiri_link._package_cache = None
    try:
        assert onigiri_link.find_onigiri_package() is None
        assert onigiri_link.read_progress()["found"] is False
        assert onigiri_link.read_specials() == {"found": False, "book": [], "today": None}
        assert onigiri_link.read_theme() is None and onigiri_link.theme_css() == ""
        assert onigiri_link.health() == "not installed"
    finally:
        mw.addonManager = old
        onigiri_link._package_cache = None


def test_level_name_and_theme_come_from_the_restaurant_file(onigiri):
    put(onigiri, "gamification_p.json", {"restaurant_level": {"total_xp": 50 + 150 + 5, "name": "Maru's", "current_theme_id": "macha_delights"}})
    p = onigiri_link.read_progress()
    assert p["found"] and p["level"] == 2 and p["xpInto"] == 5 and p["name"] == "Maru's"
    assert p["themeColor"] == "#517C58"  # (from the built-in table when Onigiri isn't loaded)


def test_the_hard_difficulties_need_more_xp_per_level(onigiri):
    put(onigiri, "gamification_p.json", {"restaurant_level": {"total_xp": 200}})
    put(onigiri, "settings_p.json", {"restaurant_level": {"difficulty": "Executive Chef"}})
    assert onigiri_link.read_progress()["level"] == 1  # (4x: 200 xp is only just past level 1)


def test_the_specials_book_lists_finished_dishes_newest_first(onigiri):
    put(onigiri, "gamification_p.json", {"daily_specials": [
        {"name": "Tuna Mayo", "completed": True, "completed_date": "2026-01-01", "difficulty": "common"},
        {"name": "Golden Dragon", "completed": True, "completed_date": "2026-02-01", "difficulty": "legendary"},
        {"name": "Tuna Mayo", "completed": True, "completed_date": "2025-01-01", "difficulty": "common"},
        {"name": "Skipped", "completed": False},
    ]})
    out = onigiri_link.read_specials()
    assert out["found"] and [d["name"] for d in out["book"]] == ["Golden Dragon", "Tuna Mayo"]
    assert out["book"][0]["rarity"] == "legendary"


def test_todays_special_is_chosen_like_onigiri_does_and_shows_progress(onigiri):
    put(onigiri, "gamification_p.json", {"daily_specials": [], "restaurant_level": {
        "current_theme_id": "default", "daily_special": {"target": 20, "current_progress": 20}}})
    put(onigiri, "settings_p.json", {"daily_special": {"enabled": True}})
    out = onigiri_link.read_specials()
    now = datetime.datetime.now()
    day = (now - datetime.datetime(now.year, 1, 1)).days + 1
    expected = ["Tuna Mayo", "Golden Dragon"][day % 2]
    assert out["today"]["name"] == expected and out["today"]["done"] is True and out["today"]["target"] == 20


def test_todays_special_is_off_unless_onigiri_has_it_switched_on(onigiri):
    put(onigiri, "gamification_p.json", {"daily_specials": [], "restaurant_level": {}})
    assert onigiri_link.read_specials()["today"] is None


def test_a_restaurant_with_its_own_menu_uses_it(onigiri):
    put(onigiri, "gamification_p.json", {"daily_specials": [], "restaurant_level": {"current_theme_id": "macha_delights"}})
    put(onigiri, "settings_p.json", {"daily_special": {"enabled": True}})
    assert onigiri_link.read_specials()["today"]["name"] == "Matcha Mochi"


def test_the_dish_file_parser_reads_every_list(onigiri):
    dishes = onigiri_link._restaurant_dishes("1011095603", "restaurant_evo_ii")
    assert [d["name"] for d in dishes] == ["Tuna Mayo", "Golden Dragon"]  # (evolutions use the default list)


def test_a_missing_dish_file_just_means_no_menu(onigiri):
    (onigiri / "web" / "gamification" / "restaurant_level" / "special_dishes.js").unlink()
    assert onigiri_link._restaurant_dishes("1011095603", "default") == []


def test_only_safe_colours_are_taken_from_the_theme(onigiri):
    put(onigiri, "settings_p.json", {"colors": {"light": {
        "--accent-color": "#ff0000", "--bg": "red; background: url(http://evil)", "--fg": "rgb(10, 20, 30)", "--border": "javascript:1"}}})
    pal = onigiri_link.read_theme()["light"]
    assert pal["--accent-color"] == "#ff0000" and "--bg" not in pal and "--border" not in pal


def test_unreadable_text_colours_are_fixed(onigiri):
    pal = onigiri_link.readable({"--bg": "#ffffff", "--canvas-inset": "#ffffff", "--fg": "#fefefe", "--fg-subtle": "#fafafa", "--accent-color": "#ffffff"})
    assert pal["--fg"] == "#212121" and pal["--fg-subtle"] == "#5d5a55" and pal["--accent-fg"] == "#1b1b24"


def test_the_health_line_says_what_can_be_read(onigiri):
    assert onigiri_link.health().startswith("level unread, specials unread")  # (no files yet)
    put(onigiri, "gamification_p.json", {"daily_specials": [], "restaurant_level": {"total_xp": 100, "current_theme_id": "macha_delights"}})
    line = onigiri_link.health()
    assert "level ok" in line and "specials ok" in line


def test_the_theme_css_defines_only_oni_variables(onigiri):
    put(onigiri, "settings_p.json", {"colors": {"light": {"--accent-color": "#123456"}, "dark": {"--accent-color": "#654321"}}})
    css = onigiri_link.theme_css()
    assert "--oni-accent-color:#123456" in css and "--oni-accent-color:#654321" in css
