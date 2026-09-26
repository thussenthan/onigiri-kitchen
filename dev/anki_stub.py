"""Minimal stand-ins for Anki's `aqt`/`anki` modules so the add-on's Python can
be imported and exercised outside Anki (for quick logic checks).

    import sys; sys.path.insert(0, "dev")
    import anki_stub
    env = anki_stub.setup()           # temp addons folder with a copy of the add-on
    main = env.import_("main")        # onigiri_kitchen.main, fully set up

Nothing here touches your real Anki or Onigiri files.
"""

import importlib
import os
import shutil
import sys
import tempfile
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _Sig:
    def __init__(self):
        self.f = []

    def connect(self, f):
        self.f.append(f)


class QTimer:
    singleShot = staticmethod(lambda ms, f: f())

    def __init__(self, *a):
        self.timeout = _Sig()
        self.active = False

    def setInterval(self, i):
        pass

    def setSingleShot(self, b):
        pass

    def start(self, *a):
        self.active = True

    def stop(self):
        self.active = False


class _Dummy:
    def __init__(self, *a, **k):
        pass


class _Hook(list):
    pass


HOOKS = [
    "profile_did_open", "profile_will_close", "reviewer_did_answer_card", "webview_will_set_content",
    "webview_did_receive_js_message", "main_window_did_init", "deck_browser_will_render_content",
    "state_will_change", "reviewer_did_show_question", "reviewer_did_show_answer", "state_did_undo",
]


def wrap(old, new, pos="after"):
    """Same semantics as anki.hooks.wrap."""
    def repl(*args, **kwargs):
        if pos == "around":
            return new(*args, _old=old, **kwargs)
        if pos == "before":
            new(*args, **kwargs)
            return old(*args, **kwargs)
        r = old(*args, **kwargs)
        new(*args, **kwargs)
        return r
    return repl


class Env:
    def __init__(self, addons, mw, hooks):
        self.addons = addons
        self.mw = mw
        self.hooks = hooks

    def import_(self, name):
        return importlib.import_module(f"onigiri_kitchen.{name}")

    @property
    def user_files(self):
        return os.path.join(self.addons, "onigiri_kitchen", "user_files")


def setup(profile="Test"):
    addons = tempfile.mkdtemp(prefix="okitchen-addons-")
    shutil.copytree(os.path.join(ROOT, "onigiri_kitchen"), os.path.join(addons, "onigiri_kitchen"),
                    ignore=shutil.ignore_patterns("__pycache__", "kitchen_*.json", "debug_log.txt"))

    class AM:
        def addonsFolder(self, *a):
            return addons

        def allAddons(self):
            return os.listdir(addons)

        def addonFromModule(self, n):
            return n.split(".")[0]

        def getConfig(self, n):
            import json
            with open(os.path.join(addons, "onigiri_kitchen", "config.json")) as f:
                return json.load(f)

        def writeConfig(self, n, c):
            pass

        def setWebExports(self, *a):
            pass

    class Sched:
        day_cutoff = 4_102_444_800  # far future

    mw = types.SimpleNamespace(
        addonManager=AM(), pm=types.SimpleNamespace(name=profile), state="deckBrowser",
        col=types.SimpleNamespace(sched=Sched(), get_config=lambda k, d=None: d,
                                  decks=types.SimpleNamespace(name=lambda did: "Deck", current=lambda: {"name": "Deck"}),
                                  db=types.SimpleNamespace(all=lambda *a: [])),
        form=types.SimpleNamespace(menuTools=types.SimpleNamespace(addAction=lambda a: None)),
    )
    aqt = types.ModuleType("aqt")
    aqt.mw = mw
    qt = types.ModuleType("aqt.qt")
    qt.QTimer = QTimer
    for name in ["QAction", "QDialog", "QKeySequence", "QVBoxLayout", "QShortcut"]:
        setattr(qt, name, _Dummy)
    qt.Qt = types.SimpleNamespace(WidgetAttribute=types.SimpleNamespace(WA_DeleteOnClose=1),
                                  ShortcutContext=types.SimpleNamespace(WindowShortcut=1))
    hooks = types.ModuleType("aqt.gui_hooks")
    for n in HOOKS:
        setattr(hooks, n, _Hook())
    aqt.gui_hooks = hooks
    for mod, cls in {"aqt.deckbrowser": "DeckBrowser", "aqt.overview": "Overview",
                     "aqt.reviewer": "Reviewer", "aqt.webview": "AnkiWebView"}.items():
        m = types.ModuleType(mod)
        setattr(m, cls, type(cls, (object,), {}))
        sys.modules[mod] = m
    utils = types.ModuleType("aqt.utils")
    utils.restoreGeom = utils.saveGeom = utils.tooltip = utils.openLink = lambda *a, **k: None
    anki = types.ModuleType("anki")
    anki_hooks = types.ModuleType("anki.hooks")
    anki_hooks.wrap = wrap
    sys.modules.update({"aqt": aqt, "aqt.qt": qt, "aqt.gui_hooks": hooks, "aqt.utils": utils,
                        "anki": anki, "anki.hooks": anki_hooks})
    sys.path.insert(0, addons)
    for k in [k for k in sys.modules if k.startswith("onigiri_kitchen")]:
        del sys.modules[k]
    return Env(addons, mw, hooks)
