"""Checks that the parts of Anki this add-on reaches into still exist, against a real
`aqt` (pip install aqt). Run on its own, not through pytest (which uses stand-ins):

    QT_QPA_PLATFORM=offscreen python tests/anki_compat.py

Anki changes its internals now and then. The add-on already copes with a missing
optional hook, but a missing required one would break it silently, so CI runs this against
the oldest and the newest Anki it supports."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
source = (ROOT / "onigiri_kitchen" / "main.py").read_text(encoding="utf-8")

import anki.lang  # noqa: E402

anki.lang.set_lang("en")  # (Anki's own screens translate their text when they're defined)

from aqt import gui_hooks  # noqa: E402
from aqt.deckbrowser import DeckBrowser  # noqa: E402
from aqt.overview import Overview  # noqa: E402
from aqt.reviewer import Reviewer  # noqa: E402
from aqt.webview import AnkiWebView  # noqa: E402
import aqt.utils  # noqa: E402
import anki.hooks  # noqa: E402

problems = []

# hooks the add-on appends to directly (the others are looked up with hasattr, so they may be missing)
required = set(re.findall(r"gui_hooks\.(\w+)\.append", source))
optional = set(re.findall(r'for name in \(([^)]*)\):', source))
optional = {n for group in optional for n in re.findall(r'"(\w+)"', group)}
for name in sorted(required - {"state_did_undo"}):
    if not hasattr(gui_hooks, name):
        problems.append(f"required hook missing: gui_hooks.{name}")
for name in sorted(optional | {"state_did_undo"}):
    if not hasattr(gui_hooks, name):
        print(f"note: optional hook missing in this Anki: {name}")

for what, ok in {
    "Overview._show_finished_screen (the confetti wraps it)": hasattr(Overview, "_show_finished_screen"),
    "AnkiWebView.set_bridge_command": hasattr(AnkiWebView, "set_bridge_command"),
    "AnkiWebView.stdHtml": hasattr(AnkiWebView, "stdHtml"),
    "AnkiWebView.cleanup": hasattr(AnkiWebView, "cleanup"),
    "AnkiWebView.evalWithCallback": hasattr(AnkiWebView, "evalWithCallback"),
    "DeckBrowser, Reviewer classes": bool(DeckBrowser and Reviewer),
    "anki.hooks.wrap": hasattr(anki.hooks, "wrap"),
    **{f"aqt.utils.{n}": hasattr(aqt.utils, n) for n in ("openLink", "restoreGeom", "saveGeom", "tooltip", "askUser")},
}.items():
    if not ok:
        problems.append(f"missing: {what}")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"Anki's side is as expected ({len(required)} hooks used)")
