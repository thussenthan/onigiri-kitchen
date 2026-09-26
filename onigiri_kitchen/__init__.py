"""Onigiri Kitchen - a cozy pixel-art restaurant and pomodoro timer for Onigiri.

A companion add-on: it only *reads* Onigiri's data (restaurant name, level,
theme colour) and keeps all of its own progress in its own user_files folder.
"""

from aqt import mw

if mw is not None:
    from . import main

    main.setup()
