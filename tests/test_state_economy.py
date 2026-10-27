import json
import types

from aqt import mw

from onigiri_kitchen import state as statemod
from onigiri_kitchen.state import KitchenState, SAVE_VERSION


def fresh(tmp_path):
    s = KitchenState(str(tmp_path))
    s.load()
    return s


def names(**by_id):
    return {k: v for k, v in by_id.items()}


def test_ten_reviews_in_a_deck_bring_a_guest(tmp_path):
    s = fresh(tmp_path)
    assert s.sync_today({"11": 9}, 10, {"11": "Spanish"}) == 0
    assert s.sync_today({"11": 10}, 10, {"11": "Spanish"}) == 1
    assert s.data["guests"][0]["deck"] == "Spanish"
    assert s.data["today"]["reviews"] == 10


def test_each_deck_counts_on_its_own(tmp_path):
    s = fresh(tmp_path)
    s.sync_today({"1": 6, "2": 6}, 10, {"1": "A", "2": "B"})
    assert s.data["guests"] == []
    s.sync_today({"1": 10, "2": 6}, 10, {"1": "A", "2": "B"})
    assert [g["deck"] for g in s.data["guests"]] == ["A"]


def test_renaming_a_deck_does_not_bring_new_guests(tmp_path):
    s = fresh(tmp_path)
    s.sync_today({"7": 25}, 10, {"7": "Old name"})
    before = len(s.data["guests"])
    reviews = s.data["today"]["reviews"]
    assert s.sync_today({"7": 25}, 10, {"7": "New name"}) == 0
    assert len(s.data["guests"]) == before == 2
    assert s.data["today"]["reviews"] == reviews


def test_an_undone_review_takes_back_an_unseated_guest(tmp_path):
    s = fresh(tmp_path)
    s.sync_today({"3": 10}, 10, {"3": "Kanji"})
    assert len(s.data["guests"]) == 1
    s.sync_today({"3": 9}, 10, {"3": "Kanji"})
    assert s.data["guests"] == []
    s.sync_today({"3": 10}, 10, {"3": "Kanji"})
    assert len(s.data["guests"]) == 1


def test_reviews_without_the_log_are_counted_directly(tmp_path):
    s = fresh(tmp_path)
    for _ in range(10):
        s.add_review("Deck", False, 10, None, deck_id=5)
    assert len(s.data["guests"]) == 1 and s.data["today"]["reviews"] == 10


def test_a_leech_guest_comes_for_a_correct_leech_answer_up_to_three_a_day(tmp_path):
    s = fresh(tmp_path)
    for _ in range(5):
        s.add_review("Hard", True, 10, {"9": 1}, deck_id=9, names={"9": "Hard"})
    assert [g["kind"] for g in s.data["guests"]].count("leech") == 3


def test_a_seated_guest_who_never_paid_goes_back_in_the_queue(tmp_path):
    s = fresh(tmp_path)
    s.add_guest({"deck": "A", "kind": "regular"})
    s.add_guest({"deck": "B", "kind": "regular"})
    first = s.claim_guest()
    assert first["deck"] == "A" and len(s.data["serving"]) == 1
    assert s.release_serving() == 1
    assert [g["deck"] for g in s.data["guests"]] == ["A", "B"] and s.data["serving"] == []


def test_paying_removes_the_seated_guest(tmp_path):
    s = fresh(tmp_path)
    s.add_guest({"deck": "A", "kind": "regular"})
    s.claim_guest()
    s.pay(3, "A", "regular")
    assert s.data["serving"] == [] and s.data["mon"] == 3 and s.data["served_total"] == 1


def test_guests_seated_at_the_end_of_the_day_leave_takeout(tmp_path):
    s = fresh(tmp_path)
    s.add_guest({"deck": "A", "kind": "regular"})
    s.claim_guest()
    s.data["serving"][0]["claimed"] -= 3600  # (from a window that closed long ago)
    s.data["today"]["date"] = "2000-01-01"  # (the day has rolled over)
    s.roll_day()
    assert s.data["serving"] == [] and s.data["takeout"]["count"] == 1 and s.data["mon"] > 0
    assert s.data["credited"]["2000-01-01"] == 0


def test_someone_still_eating_as_the_day_turns_over_pays_for_themselves(tmp_path):
    s = fresh(tmp_path)
    s.add_guest({"deck": "A", "kind": "regular"})
    s.claim_guest()
    s.data["today"]["date"] = "2000-01-01"
    s.roll_day()
    assert len(s.data["serving"]) == 1 and s.data["takeout"]["count"] == 0 and s.data["mon"] == 0
    s.pay(3, "A", "regular")
    assert s.data["mon"] == 3


def test_tips_use_the_pages_roll_and_add_the_perks(tmp_path):
    s = fresh(tmp_path)
    assert s.tip_for({"kind": "regular"}, base=3, dish_bonus=0) == 3
    s.data["owned"] += ["maneki", "shiba"]
    assert s.tip_for({"kind": "regular"}, base=3, dish_bonus=2) == 7
    s.data["owned"].append("tanuki")
    assert s.tip_for({"kind": "golden"}, base=12, dish_bonus=0) == 26


def test_a_page_cannot_roll_a_tip_outside_the_kinds_range(tmp_path):
    s = fresh(tmp_path)
    assert s.tip_for({"kind": "regular"}, base=999, dish_bonus=999) == 8 + 12
    assert s.tip_for({"kind": "golden"}, base=1, dish_bonus=0) == 10


def test_a_hidden_perk_item_does_not_count(tmp_path):
    s = fresh(tmp_path)
    s.data["owned"].append("maneki")
    s.data["hidden"].append("maneki")
    assert s.tip_for({"kind": "regular"}, base=3, dish_bonus=0) == 3


def test_buying_checks_everything(tmp_path):
    s = fresh(tmp_path)
    assert not s.buy("nothing", 99)["ok"]
    assert "Not enough" in s.buy("bonsai", 0)["msg"]
    s.data["mon"] = 100
    assert "level" in s.buy("furin", 0)["msg"]
    assert s.buy("furin", 5)["ok"] and s.data["mon"] == 75
    assert "Already" in s.buy("furin", 5)["msg"]
    assert "puffle" in s.buy("kamakura", 5)["msg"].lower()
    assert "Earned" in s.buy("shinagaki", 5)["msg"]


def test_you_cannot_buy_your_own_starter_pet(tmp_path):
    s = fresh(tmp_path)
    s.choose_starter("cat")
    s.data["mon"] = 5000
    assert not s.buy("mike", 0)["ok"]
    assert s.buy("buncho", 0)["ok"]


def test_serve_all_pays_every_guest(tmp_path):
    s = fresh(tmp_path)
    for _ in range(4):
        s.add_guest({"deck": "A", "kind": "regular"})
    out = s.serve_all()
    assert out["count"] == 4 and s.data["guests"] == [] and s.data["mon"] == out["mon"] >= 8


def test_reviews_synced_in_after_the_day_closed_bring_takeout(tmp_path):
    s = fresh(tmp_path)
    s.data["credited"] = {"2026-09-27": 40, "2026-09-28": 100}
    got = s.backfill({"2026-09-27": 70, "2026-09-28": 100, "2026-09-26": 500}, 10)
    assert got["count"] == 3  # (30 more reviews on the 27th; the 26th wasn't watched; the 28th is unchanged)
    assert s.data["credited"]["2026-09-27"] == 70 and "2026-09-26" not in s.data["credited"]
    assert s.data["takeout"]["count"] == 3 and s.data["takeout"]["mon"] == got["mon"] == s.data["mon"]
    assert s.backfill({"2026-09-27": 70}, 10)["count"] == 0  # (never paid twice)


def test_a_save_with_wrong_kinds_of_values_is_repaired(tmp_path):
    bad = {"pet": {"species": "cat"}, "owned": "oops", "mon": "12", "guests": 5, "today": [], "takeout": None,
           "served_total": None, "extra_key": {"keep": 1}}
    out = statemod._coerce(bad, statemod._defaults())
    assert out["mon"] == 12 and out["owned"] == [] and out["guests"] == [] and out["served_total"] == 0
    assert out["today"]["reviews"] == 0 and out["takeout"] == {"count": 0, "mon": 0}
    assert out["extra_key"] == {"keep": 1}


def test_loading_a_broken_save_keeps_the_kitchen_working(tmp_path):
    folder = tmp_path / "user_files"
    folder.mkdir()
    (folder / "kitchen_test.json").write_text(json.dumps({"pet": {"species": "cat"}, "owned": [], "mon": "lots", "guests": "none"}))
    s = fresh(tmp_path)
    s.earn(5, "tips")
    s.add_guest({"deck": "A", "kind": "regular"})
    assert s.data["mon"] == 5 and len(s.data["guests"]) == 1


def test_a_version_1_save_starts_counting_by_deck_id_without_double_counting(tmp_path):
    folder = tmp_path / "user_files"
    folder.mkdir()
    old = {"version": 1, "pet": {"species": "cat"}, "owned": [], "mon": 10,
           "today": {"date": statemod.anki_today(), "reviews": 30, "by_deck": {"Spanish": 30}},
           "pending": {"Spanish": 4}}
    (folder / "kitchen_test.json").write_text(json.dumps(old))
    s = fresh(tmp_path)
    assert s.data["version"] == SAVE_VERSION and s.data["pending"] == {}
    assert s.sync_today({"11": 30}, 10, {"11": "Spanish"}) == 0  # (starts from here)
    assert s.data["today"]["by_deck"] == {"11": 30}


def test_the_save_is_named_by_a_stable_id_not_the_profile(tmp_path):
    folder = tmp_path / "user_files"
    folder.mkdir()
    (folder / "kitchen_test.json").write_text(json.dumps({"pet": {"species": "cat"}, "owned": [], "mon": 77}))
    config = {}
    mw.col = types.SimpleNamespace(get_config=lambda k, d=None: config.get(k, d), set_config=lambda k, v: config.__setitem__(k, v))
    try:
        s = fresh(tmp_path)
        key = config["onigiri_kitchen_id"]
        assert s.path.endswith(f"kitchen_{key}.json") and s.data["mon"] == 77  # (the old file was carried over)
        s.data["mon"] = 80
        s.save()
        mw.pm.name = "renamed"
        again = KitchenState(str(tmp_path))
        again.load()
        assert again.path == s.path and again.data["mon"] == 80
    finally:
        mw.col = None
        mw.pm.name = "test"


def test_pet_petting_cap_follows_the_ankis_day(tmp_path, monkeypatch):
    s = fresh(tmp_path)
    s.choose_starter("cat")
    monkeypatch.setattr(statemod.petmod, "today_fn", lambda: "2026-01-01")
    for _ in range(25):
        s.pet.action("pet")
    assert s.pet.d["pet_points"] == 20
    monkeypatch.setattr(statemod.petmod, "today_fn", lambda: "2026-01-02")
    s.pet.action("pet")
    assert s.pet.d["pet_points"] == 21
