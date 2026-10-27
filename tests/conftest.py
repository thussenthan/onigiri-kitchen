"""Stand-ins for Anki (aqt), so the add-on's plain-Python parts can be tested
without Anki running."""
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class FakeTimer:
    def __init__(self, *a, **k):
        pass

    def setSingleShot(self, v):
        pass

    def start(self, ms):
        pass

    @property
    def timeout(self):
        return types.SimpleNamespace(connect=lambda fn: None)


class FakeMw:
    """What the tests set up: `col` (a collection with `db` and `sched`) and the profile manager."""
    col = None
    pm = types.SimpleNamespace(name="test")


aqt = types.ModuleType("aqt")
aqt.mw = None  # (the package only loads the whole add-on when there's a main window)
aqt_qt = types.ModuleType("aqt.qt")
aqt_qt.QTimer = FakeTimer
sys.modules["aqt"] = aqt
sys.modules["aqt.qt"] = aqt_qt

import onigiri_kitchen  # noqa: E402,F401

aqt.mw = FakeMw()  # (set after the package import, before the modules that read it)
