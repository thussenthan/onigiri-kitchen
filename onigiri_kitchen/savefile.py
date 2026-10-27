"""Onigiri Kitchen: reading and protecting the kitchen's save file. Pure Python
(no Anki), so it can be tested on its own.

A save that can't be read is never overwritten: a damaged one is set aside and
the newest daily backup is used instead, and one that is only locked for the
moment (antivirus, a cloud-sync folder) is left alone for the session."""
from __future__ import annotations

import datetime
import json
import os
import shutil
from typing import Any, Dict, List, Optional, Tuple

BACKUPS_KEPT = 5


def looks_like_a_save(data: Any) -> bool:
    return isinstance(data, dict) and isinstance(data.get("pet"), dict) and isinstance(data.get("owned"), list)


def read(path: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """("ok", data), ("missing", None), ("corrupt", None: it isn't a kitchen save) or
    ("unreadable", None: couldn't be opened, so say nothing about what's in it)."""
    try:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
    except FileNotFoundError:
        return "missing", None
    except OSError:
        return "unreadable", None
    try:
        data = json.loads(raw)
    except ValueError:
        return "corrupt", None
    return ("ok", data) if isinstance(data, dict) else ("corrupt", None)


def set_aside(path: str, now: Optional[datetime.datetime] = None) -> str:
    """Keep a damaged save under another name, so nothing is lost for good."""
    now = now or datetime.datetime.now()
    dest = f"{path}.corrupt-{now:%Y%m%d-%H%M%S}"
    try:
        os.replace(path, dest)
    except OSError:
        shutil.copy2(path, dest)
    return dest


def backup_folder(path: str) -> str:
    return os.path.join(os.path.dirname(path), "backups")


def backups(path: str) -> List[str]:
    """This save's daily backups, newest first."""
    stem = os.path.splitext(os.path.basename(path))[0]
    folder = backup_folder(path)
    try:
        names = [n for n in os.listdir(folder) if n.startswith(stem + "_") and n.endswith(".json")]
    except OSError:
        return []
    return [os.path.join(folder, n) for n in sorted(names, reverse=True)]


def rotate_backup(path: str, today: Optional[datetime.date] = None, keep: int = BACKUPS_KEPT) -> Optional[str]:
    """Copy the save as it stands (once a day), then drop all but the newest few.
    Only a save that reads properly is copied, so a bad file never pushes out a good backup."""
    today = today or datetime.date.today()
    status, data = read(path)
    if status != "ok" or not looks_like_a_save(data):
        return None
    stem = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(backup_folder(path), f"{stem}_{today:%Y%m%d}.json")
    made = None
    try:
        if not os.path.exists(dest):
            os.makedirs(backup_folder(path), exist_ok=True)
            shutil.copy2(path, dest)
            made = dest
        for old in backups(path)[keep:]:
            os.remove(old)
    except OSError:
        pass
    return made


def newest_good_backup(path: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    for b in backups(path):
        status, data = read(b)
        if status == "ok" and looks_like_a_save(data):
            return b, data  # type: ignore[return-value]
    return None
