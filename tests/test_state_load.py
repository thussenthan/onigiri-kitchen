import json
import os

from aqt import mw

from onigiri_kitchen import savefile
from onigiri_kitchen.state import KitchenState

GOOD = {"pet": {"species": "cat", "name": "Tama"}, "owned": ["bonsai"], "mon": 321}


def fresh(tmp_path):
    return KitchenState(str(tmp_path))


def path_of(tmp_path):
    return str(tmp_path / "user_files" / "kitchen_test.json")


def put(tmp_path, data):
    os.makedirs(tmp_path / "user_files", exist_ok=True)
    with open(path_of(tmp_path), "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data))


def test_a_good_save_loads(tmp_path):
    put(tmp_path, GOOD)
    s = fresh(tmp_path)
    s.load()
    assert s.data["mon"] == 321 and not s.protect


def test_a_damaged_save_is_set_aside_and_the_backup_used(tmp_path):
    put(tmp_path, GOOD)
    savefile.rotate_backup(path_of(tmp_path))
    put(tmp_path, "{broken")
    s = fresh(tmp_path)
    s.load()
    assert s.data["mon"] == 321  # (from the backup)
    names = os.listdir(tmp_path / "user_files")
    assert any(".corrupt-" in n for n in names)


def test_a_damaged_save_without_a_backup_starts_fresh_and_keeps_the_file(tmp_path):
    put(tmp_path, "{broken")
    s = fresh(tmp_path)
    s.load()
    assert s.data["mon"] == 0
    assert any(".corrupt-" in n for n in os.listdir(tmp_path / "user_files"))


def test_an_unreadable_save_is_never_overwritten(tmp_path, monkeypatch):
    put(tmp_path, GOOD)
    monkeypatch.setattr(savefile, "read", lambda path: ("unreadable", None))
    s = fresh(tmp_path)
    s.load()
    assert s.protect
    s.data["mon"] = 999
    s.save()
    with open(path_of(tmp_path), encoding="utf-8") as f:
        assert json.load(f)["mon"] == 321


def test_save_writes_and_backs_up_the_previous_one(tmp_path):
    put(tmp_path, GOOD)
    s = fresh(tmp_path)
    s.load()
    s.data["mon"] = 400
    s.save()
    with open(path_of(tmp_path), encoding="utf-8") as f:
        assert json.load(f)["mon"] == 400
    found = savefile.newest_good_backup(path_of(tmp_path))
    assert found is not None and found[1]["mon"] == 321
