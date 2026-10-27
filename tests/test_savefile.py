import datetime
import json
import os

from onigiri_kitchen import savefile

SAVE = {"pet": {"species": "cat"}, "owned": ["bonsai"], "mon": 5}


def write(path, data):
    with open(path, "w", encoding="utf-8") as f:
        f.write(data if isinstance(data, str) else json.dumps(data))


def test_read_statuses(tmp_path):
    p = str(tmp_path / "kitchen_test.json")
    assert savefile.read(p) == ("missing", None)
    write(p, SAVE)
    assert savefile.read(p) == ("ok", SAVE)
    write(p, "{not json")
    assert savefile.read(p) == ("corrupt", None)
    write(p, "[1, 2]")
    assert savefile.read(p)[0] == "corrupt"


def test_unreadable_is_not_corrupt(tmp_path):
    # a folder where the file should be can't be opened as a file: that says nothing about its contents
    p = tmp_path / "kitchen_test.json"
    p.mkdir()
    assert savefile.read(str(p))[0] == "unreadable"


def test_set_aside_keeps_the_damaged_file(tmp_path):
    p = str(tmp_path / "kitchen_test.json")
    write(p, "{broken")
    dest = savefile.set_aside(p, datetime.datetime(2026, 1, 2, 3, 4, 5))
    assert dest.endswith(".corrupt-20260102-030405")
    assert not os.path.exists(p)
    assert open(dest, encoding="utf-8").read() == "{broken"


def test_backup_is_made_once_a_day_and_pruned(tmp_path):
    p = str(tmp_path / "kitchen_test.json")
    write(p, SAVE)
    day = datetime.date(2026, 3, 1)
    assert savefile.rotate_backup(p, day) is not None
    assert savefile.rotate_backup(p, day) is None  # (same day: already done)
    for n in range(2, 9):
        savefile.rotate_backup(p, datetime.date(2026, 3, n))
    kept = savefile.backups(p)
    assert len(kept) == savefile.BACKUPS_KEPT
    assert kept[0].endswith("kitchen_test_20260308.json")  # newest first


def test_a_damaged_save_is_never_backed_up(tmp_path):
    p = str(tmp_path / "kitchen_test.json")
    write(p, SAVE)
    savefile.rotate_backup(p, datetime.date(2026, 3, 1))
    write(p, "{broken")
    assert savefile.rotate_backup(p, datetime.date(2026, 3, 2)) is None
    found = savefile.newest_good_backup(p)
    assert found is not None and found[1] == SAVE
