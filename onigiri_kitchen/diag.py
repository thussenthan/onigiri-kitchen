"""Onigiri Kitchen: a small rolling log in user_files/debug_log.txt, so a problem
leaves a trace. It can contain file paths, so it's never sent anywhere."""
from __future__ import annotations

import datetime
import os
from typing import Optional

KEEP = 200
_dir: Optional[str] = None


def _path() -> str:
    folder = _dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_files")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "debug_log.txt")


def log(msg: str) -> None:
    try:
        path = _path()
        lines = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                lines = f.read().splitlines()[-(KEEP - 1):]
        lines.append(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass  # (a log that can't be written must never get in the way)


def error(where: str, exc: BaseException) -> None:
    """Note a problem that was handled (and printed, for Anki's debug console)."""
    print(f"Onigiri Kitchen: {where}: {exc}")
    log(f"ERROR {where}: {exc!r}")
