"""Wires the kitchen into Anki: hooks, menu, the kitchen window and the timer chip."""

from __future__ import annotations

import datetime
import json
import os
from typing import Any, Dict, Optional, Tuple

from aqt import gui_hooks, mw
from aqt.deckbrowser import DeckBrowser
from aqt.overview import Overview
from aqt.qt import QAction, QDialog, QKeySequence, QShortcut, Qt, QTimer, QVBoxLayout
from aqt.reviewer import Reviewer
from aqt.utils import openLink, restoreGeom, saveGeom, tooltip
from aqt.webview import AnkiWebView

from . import onigiri_link
from . import pet as petmod
from .pomodoro import Pomodoro
from .state import BIRD_COLORS, CATALOG, CATALOG_BY_ID, anki_today, earned_rewards, PUFFLE_COLOR_PRICE, PUFFLE_COLORS, PUFFLE_COLORS_BY_ID, KitchenState

ADDON_DIR = os.path.dirname(__file__)
PACKAGE = mw.addonManager.addonFromModule(__name__)
CMD_PREFIX = "okitchen:"
VERSION = "1.8.0"
REPO_URL = "https://github.com/thussenthan/onigiri-kitchen"

DEFAULT_CONF: Dict[str, Any] = {
    "focus_minutes": 25,
    "short_break_minutes": 5,
    "long_break_minutes": 15,
    "rounds_before_long_break": 4,
    "focus_card_goal": 0,
    "daily_card_goal": 100,
    "auto_open_kitchen_on_break": True,
    "auto_start_next_focus": False,
    "endless_focus": False,
    "clock_style": "analog",
    "theme_mode": "anki",  # anki, auto (light by day, dark at night), light or dark
    "widget_click_opens_kitchen": True,
    "show_timer_chip": True,
    "show_timer_chip_in_reviewer": True,
    "reviews_per_guest": 10,
    "sound": True,
    "volume": 0.5,
    "shortcut": "Ctrl+Shift+K",
    "show_home_widget_without_onigiri": True,
    "celebrate_deck_finish": True,
    "pause_focus_when_idle": True,
    "idle_pause_minutes": 1,
}

state = KitchenState(ADDON_DIR)
_dialog: Optional["KitchenDialog"] = None


def conf() -> Dict[str, Any]:
    stored = mw.addonManager.getConfig(__name__) or {}
    merged = dict(DEFAULT_CONF)
    merged.update(stored)
    return merged


def write_conf(updates: Dict[str, Any]) -> None:
    current = conf()
    for key, value in updates.items():
        if key not in DEFAULT_CONF:
            continue
        default = DEFAULT_CONF[key]
        try:
            if isinstance(default, bool):
                value = bool(value)
            elif isinstance(default, int):
                value = int(value)
            elif isinstance(default, float):
                value = float(value)
            elif key == "clock_style" and value not in ("analog", "flip"):
                continue
            elif key == "theme_mode" and value not in ("anki", "auto", "light", "dark"):
                continue
        except (TypeError, ValueError):
            continue
        current[key] = value
    mw.addonManager.writeConfig(__name__, current)


# --------------------------------------------------------------------- timer
def _on_timer_change() -> None:
    push_timer()


def _special_cheer(specials: Dict[str, Any]) -> bool:
    """True once a day, the first time the kitchen learns that today's
    special is done in Onigiri (the chef cheers and makes it for the tray)."""
    t = specials.get("today")
    today = state.data["today"]
    if not (t and t.get("done")) or today.get("special_cheered"):
        return False
    today["special_cheered"] = True
    state.save_soon()
    return True


def _focus_credit() -> Dict[str, Any]:
    """Credit a finished focus session, and tell the kitchen what it earned:
    the daruma's wish (4th session today) and whether today's special is
    done in Onigiri (golden guests tip more for it)."""
    daruma = state.focus_completed()
    _specials_cache["value"] = None  # re-read Onigiri for the golden guest's order
    specials = cached_specials()
    today = specials.get("today")
    return {
        "daruma": daruma,
        "specialCheer": _special_cheer(specials),
        "focusDone": int(state.data["today"].get("focus_done", 0)),
        "mon": state.data["mon"],
        "specialDone": bool(today and today.get("done")),
    }


def _on_timer_event(kind: str, info: Dict[str, Any]) -> None:
    c = conf()
    if kind == "focus_done":
        state.log_focus(info.get("seconds", 0), info.get("cards", 0), info.get("how", "f"))
        if info.get("credited"):
            info.update(_focus_credit())
        msg = "休憩 Short break! Your restaurant is open."
        if info.get("long"):
            msg = "休憩 Long break! Your restaurant is open."
        if c.get("auto_open_kitchen_on_break", True):
            open_kitchen(reason="break")
        else:
            tooltip(msg, period=4000)
        _eval_kitchen(f"OK.onFocusDone({json.dumps(info)})")
    elif kind == "endless_block":
        # Endless focus: a focus-length studied, credited quietly (no break,
        # no pop-up): a dango on the skewer and a golden guest.
        state.log_focus(info.get("seconds", 0), info.get("cards", 0), "e")
        info.update(_focus_credit())
        _eval_kitchen(f"window.OK && OK.onEndlessBlock({json.dumps(info)})")
    elif kind == "idle_paused":
        state.log_count("idle")
        mins = info.get("minutes", 1)
        tooltip(
            f"集中 Focus paused: no reviews for {mins:g} min.<br>It resumes when you answer your next card.",
            period=5000,
        )
    elif kind == "break_done":
        state.log_break(info.get("seconds", 0), bool(info.get("long")), bool(info.get("skipped")))
        if _dialog is not None:
            _eval_kitchen("OK.onBreakDone()")
        else:
            tooltip("Break's over. Back to the books! 頑張って (you've got this!)", period=4000)


pomo = Pomodoro(conf, _on_timer_change, _on_timer_event)


def timer_payload() -> Dict[str, Any]:
    c = conf()
    return {
        "pomo": pomo.snapshot(),
        "kitchenOpen": _dialog is not None,
        "endlessMode": bool(c.get("endless_focus", False)),
        "sound": bool(c.get("sound", True)),
        "volume": float(c.get("volume", 0.5)),
    }


def push_timer() -> None:
    payload = json.dumps(timer_payload())
    for web in _main_webviews():
        try:
            web.eval(f"window.OKChip && OKChip.update({payload});")
        except Exception:
            pass
    _eval_kitchen(f"window.OK && OK.onTimer({payload})")


def _main_webviews():
    # deckBrowser, overview and reviewer usually share mw.web; dedupe so we
    # don't update (or chime) the same page three times.
    views = []
    for attr in ("deckBrowser", "overview", "reviewer"):
        obj = getattr(mw, attr, None)
        web = getattr(obj, "web", None) if obj else None
        if web is not None and all(web is not v for v in views):
            views.append(web)
    return views


def _eval_kitchen(js: str) -> None:
    if _dialog is not None:
        try:
            _dialog.web.eval(js)
        except Exception:
            pass


# ------------------------------------------------------------------- reviews
def on_answer(reviewer: Reviewer, card: Any, ease: int) -> None:
    try:
        deck = mw.col.decks.name(card.odid or card.did)
    except Exception:
        deck = "Deck"
    leech_success = False
    if ease > 1:
        try:
            leech_success = card.note().has_tag("leech")
        except Exception:
            leech_success = False
    new_guest = state.add_review(deck, leech_success, conf().get("reviews_per_guest", 10), todays_reviews_by_deck())
    pomo.on_review()
    check_daily_goal()
    grew = getattr(state, "pet_grew", None)
    if grew is not None:
        stage = state.pet.stages()[grew]
        name = state.pet.d.get("name", "Tama")
        tooltip(f"🐾 {name} grew up! Now a {stage['jp']} {stage['name']}.", period=5000)
        _eval_kitchen(f"window.OK && OK.onPet({json.dumps(state.pet.snapshot())}, true)")
    if new_guest:
        _eval_kitchen(f"window.OK && OK.onGuests({len(state.data['guests'])})")


# -------------------------------------------------------------------- window
def _sync_with_log() -> None:
    counts = todays_reviews_by_deck()
    if counts is not None:
        state.sync_today(counts, conf().get("reviews_per_guest", 10))


def on_undo(*_args: Any) -> None:
    # An undone review disappears from Anki's log, so re-count from it.
    _sync_with_log()
    _eval_kitchen(f"window.OK && OK.onGuests({len(state.data['guests'])})")


def todays_reviews_by_deck() -> Optional[Dict[str, int]]:
    """Today's reviews per deck from Anki's review log (respects the day
    rollover). None if the log couldn't be read (callers then skip syncing)."""
    try:
        start = (mw.col.sched.day_cutoff - 86400) * 1000
        rows = mw.col.db.all(
            "select case when c.odid != 0 then c.odid else c.did end as d, count() "
            "from revlog r join cards c on c.id = r.cid "
            "where r.id >= ? and r.type in (0, 1, 2, 3) group by d",
            start,
        )
    except Exception as e:
        print(f"Onigiri Kitchen: couldn't read today's reviews: {e}")
        return None
    out: Dict[str, int] = {}
    for did, count in rows:
        try:
            name = mw.col.decks.name(did)
        except Exception:
            name = "Deck"
        out[name] = out.get(name, 0) + int(count)
    return out


def check_daily_goal() -> None:
    """Reach your daily card goal and the restaurant throws a little party."""
    goal = int(conf().get("daily_card_goal", 0) or 0)
    today = state.data["today"]
    if goal <= 0 or today.get("goal_hit") or int(today.get("reviews", 0)) < goal:
        return
    today["goal_hit"] = goal
    state.save_soon()
    # No pop-up while you study: the party waits for your next visit (or
    # starts right away if the kitchen happens to be open).
    if _dialog is not None:
        today["goal_seen"] = True
        _eval_kitchen(f"window.OK && OK.onGoal({goal})")


def init_payload(reason: str = "") -> Dict[str, Any]:
    state.roll_day()
    _sync_with_log()
    check_daily_goal()
    today = state.data["today"]
    goal_party = int(today.get("goal_hit") or 0) if not today.get("goal_seen") else 0
    if goal_party:
        today["goal_seen"] = True
    # Onigiri: the Specials Book (the menu and its rewards) and level-ups
    _specials_cache["value"] = None
    specials = cached_specials()
    for rid in earned_rewards(specials.get("book") or []):
        if rid not in state.data["owned"]:
            state.data["owned"].append(rid)
    # dishes that joined the menu since your last visit (the chef announces
    # them); the first time, just remember what's already there
    names = [d["name"] for d in specials.get("book") or []]
    seen = state.data.get("menu_seen")
    new_dishes = [n for n in names if n not in seen] if isinstance(seen, list) else []
    state.data["menu_seen"] = names
    special_cheer = _special_cheer(specials)
    progress = restaurant_progress()
    last_level = state.data.get("last_level")
    state.data["last_level"] = int(progress.get("level", 0))
    level_up = {"from": int(last_level), "to": int(progress["level"])} if last_level is not None and progress.get("level", 0) > last_level else None
    away = state.pet.seen()
    # Anyone who already had all 12 keepsakes gets the set bonus once.
    set_bonus_now = False
    if state.pet.check_set_bonus():
        state.earn(petmod.SET_BONUS_MON, "keepsakes")
        if "takaramono" not in state.data["owned"]:
            state.data["owned"].append("takaramono")
        set_bonus_now = True
    state.save_soon()
    return {
        "reason": reason,
        "pet": state.pet.snapshot(),
        "petAway": away,
        "petStages": state.pet.stages(),
        "petSpecies": petmod.species_payload(),
        "puffleColors": PUFFLE_COLORS,
        "birdColors": BIRD_COLORS,
        "puffleColorPrice": PUFFLE_COLOR_PRICE,
        "petGifts": petmod.GIFTS,
        "petRareGifts": petmod.RARE_GIFTS,
        "petMilestones": {k: {"kind": v[0], "need": v[1]} for k, v in petmod.MILESTONES.items()},
        "petsPerDay": petmod.PETS_PER_DAY,
        "setBonusNow": set_bonus_now,
        "onigiri": progress,
        "specials": specials,
        "levelUp": level_up,
        "newDishes": new_dishes,
        "specialCheer": special_cheer,
        "goalParty": goal_party,
        "state": state.snapshot(),
        "takeout": state.pop_takeout(),
        "catalog": CATALOG,
        "conf": conf(),
        "timer": timer_payload(),
        "version": VERSION,
    }


class KitchenDialog(QDialog):
    def __init__(self, reason: str = "") -> None:
        super().__init__(mw)
        self._closed = False
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setWindowTitle("Onigiri Kitchen · おにぎり食堂")
        self.setMinimumSize(720, 520)
        self.resize(1000, 700)
        restoreGeom(self, "onigiriKitchen")

        self.web = AnkiWebView(self)
        self.web.set_bridge_command(self._on_bridge, self)
        # Cmd+W (Ctrl+W elsewhere) should close the window. Without this the web
        # page handles it and closes itself, leaving an empty grey dialog.
        self._close_shortcut = QShortcut(QKeySequence(QKeySequence.StandardKey.Close), self)
        self._close_shortcut.setContext(Qt.ShortcutContext.WindowShortcut)
        self._close_shortcut.activated.connect(self.close_soon)
        try:
            self.web.page().windowCloseRequested.connect(self.close_soon)
        except Exception:
            pass
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web)
        self.setLayout(layout)

        base = f"/_addons/{PACKAGE}/web"
        head = onigiri_link.theme_css() + (
            "<script>window.OK_INIT = "
            + json.dumps(init_payload(reason), ensure_ascii=False).replace("</", "<\\/")
            + ";</script>"
        )
        with open(os.path.join(ADDON_DIR, "web", "kitchen.html"), encoding="utf-8") as f:
            body = f.read()
        self.web.stdHtml(
            body,
            css=[f"{base}/kitchen.css"],
            js=[f"{base}/sound.js", f"{base}/kitchen.js"],
            head=head,
            context=self,
        )

    def _on_bridge(self, message: str) -> Any:
        if not message.startswith(CMD_PREFIX):
            return None
        cmd, _, arg = message[len(CMD_PREFIX):].partition(":")
        return handle_kitchen_cmd(cmd, arg, self)

    def close_soon(self) -> None:
        """Close once the current event (e.g. a call from the web page) has
        finished. Closing synchronously from inside a page callback tears the
        page down mid-call and leaves an empty grey window (the Cmd+W bug)."""
        QTimer.singleShot(0, self.close)

    def reject(self) -> None:
        # Esc closes the window (and frees it) instead of just hiding it.
        self.close_soon()

    def closeEvent(self, event: Any) -> None:
        self._cleanup()
        # Accept directly: QDialog.closeEvent would call reject() again.
        event.accept()

    def _cleanup(self) -> None:
        global _dialog
        if self._closed:
            return
        self._closed = True
        saveGeom(self, "onigiriKitchen")
        state.pet.seen()
        state.save()
        if _dialog is self:
            _dialog = None
        try:
            self.web.cleanup()
        except Exception:
            pass


def _version_info() -> str:
    import platform

    try:
        from anki.buildinfo import version as anki_version
    except Exception:
        anki_version = "unknown"
    onigiri_pkg = onigiri_link.find_onigiri_package()
    onigiri_version = "not installed"
    if onigiri_pkg:
        onigiri_version = "installed"
        try:
            path = os.path.join(mw.addonManager.addonsFolder(), onigiri_pkg, "manifest.json")
            with open(path, encoding="utf-8") as f:
                onigiri_version = json.load(f).get("version") or onigiri_version
        except Exception:
            pass
    return (
        f"- Onigiri Kitchen: {VERSION}\n"
        f"- Anki: {anki_version}\n"
        f"- Onigiri: {onigiri_version}\n"
        f"- OS: {platform.system()} {platform.release()}\n"
    )


def feedback_url(kind: str) -> str:
    """A pre-filled GitHub issue. Only version info is included, nothing personal."""
    from urllib.parse import quote

    if kind == "idea":
        title, label = "Idea: ", "enhancement"
        body = (
            "**What would you like to see?**\n\n\n"
            "**Why would it help you?**\n\n\n"
            "---\n" + _version_info()
        )
    else:
        title, label = "Bug: ", "bug"
        body = (
            "**What happened?**\n\n\n"
            "**What did you expect?**\n\n\n"
            "**Steps to reproduce**\n1. \n2. \n\n"
            "---\n" + _version_info()
        )
    return f"{REPO_URL}/issues/new?labels={label}&title={quote(title)}&body={quote(body)}"


def open_kitchen(reason: str = "") -> None:
    global _dialog
    if _dialog is not None:
        if reason:
            _eval_kitchen(f"window.OK && OK.onReason({json.dumps(reason)})")
        _dialog.show()
        _dialog.raise_()
        _dialog.activateWindow()
        return
    _dialog = KitchenDialog(reason)
    _dialog.show()


def handle_kitchen_cmd(cmd: str, arg: str, dialog: Optional[KitchenDialog]) -> Any:
    if cmd == "claim":
        return state.claim_guest()
    if cmd == "pay":
        try:
            info = json.loads(arg or "{}")
        except ValueError:
            info = {}
        state.pay(int(info.get("amount", 0)), info.get("deck"), info.get("kind"))
        return state.snapshot()
    if cmd == "buy":
        level = restaurant_progress()["level"]
        result = state.buy(arg, level)
        result["state"] = state.snapshot()
        return result
    if cmd == "toggle":
        state.toggle(arg)
        return state.snapshot()
    if cmd == "pet":
        return state.pet_action(arg)
    if cmd == "petgift":
        gift = state.pet_gift()
        return {"gift": gift, "pet": state.pet.snapshot(), "state": state.snapshot()}
    if cmd == "petname":
        return state.pet_rename(arg)
    if cmd == "petstyle":
        try:
            info = json.loads(arg or "{}")
        except ValueError:
            info = {}
        return state.pet_style(str(info.get("key", "")), info.get("value"))
    if cmd == "choose":
        try:
            info = json.loads(arg or "{}")
        except ValueError:
            info = {}
        ok = state.choose_starter(str(info.get("species", "")), str(info.get("color", "")))
        return {"ok": ok, "pet": state.pet.snapshot(), "stages": state.pet.stages(), "state": state.snapshot()}
    if cmd == "pufflecolor":
        result = state.puffle_color(arg)
        result["state"] = state.snapshot()
        return result
    if cmd == "petcolor":
        try:
            info = json.loads(arg or "{}")
        except ValueError:
            info = {}
        result = state.pet_color(str(info.get("kind", "")), str(info.get("color", "")))
        result["state"] = state.snapshot()
        return result
    if cmd == "bump":
        state.bump(arg)
        return None
    if cmd == "timer":
        action = {
            "start": pomo.start_focus,
            "pause": pomo.pause,
            "resume": pomo.resume,
            "skip": pomo.skip,
            "reset": pomo.reset,
            "extend": pomo.extend_break,
            "break": pomo.start_break,
        }.get(arg)
        if action:
            if arg == "reset" and pomo.phase != "idle":
                state.log_count("resets")
            action()
        elif arg == "endless":
            # the ∞ switch: remember the mode, and switch a running session over
            on = not bool(conf().get("endless_focus", False))
            write_conf({"endless_focus": on})
            pomo.set_endless(on)
            push_timer()
        return timer_payload()
    if cmd == "stats":
        open_stats()
        return None
    if cmd == "conf":
        try:
            write_conf(json.loads(arg or "{}"))
        except ValueError:
            pass
        push_timer()
        return conf()
    if cmd == "study":
        if dialog is not None:
            dialog.close_soon()
        if pomo.phase != "focus":
            pomo.start_focus()
        try:
            mw.moveToState("review")
        except Exception:
            mw.moveToState("overview")
        return None
    if cmd == "report":
        openLink(feedback_url("bug"))
        return None
    if cmd == "idea":
        openLink(feedback_url("idea"))
        return None
    if cmd == "serveall":
        result = state.serve_all()
        result["state"] = state.snapshot()
        result["pet"] = state.pet.snapshot()
        return result
    if cmd == "tutorial":
        state.set_tutorial_done(arg != "reset")
        return None
    if cmd == "close":
        if dialog is not None:
            dialog.close_soon()
        return None
    return None


# --------------------------------------------------- Onigiri home-screen widget
_stats_cache: Dict[str, Any] = {"key": None, "value": None}


def lifetime_stats(today_total: int) -> Optional[Dict[str, Any]]:
    """All-time reviews, days studied, the average per study day and the
    longest streak, from Anki's review log. Days follow Anki's own rollover.
    Cached until today's review count (or the day) changes."""
    try:
        cutoff = int(mw.col.sched.day_cutoff)
    except Exception:
        return None
    key = (cutoff, today_total)
    if _stats_cache["key"] == key:
        return _stats_cache["value"]
    try:
        # +100000 keeps the day index positive so the integer cast floors it.
        rows = mw.col.db.all(
            "select cast((id / 1000 - ?) / 86400.0 + 100000 as integer) as d, count() "
            "from revlog where type in (0, 1, 2, 3) group by d order by d",
            cutoff,
        )
    except Exception as e:
        print(f"Onigiri Kitchen: couldn't read review history: {e}")
        return None
    total = sum(int(c) for _, c in rows)
    days = len(rows)
    best = run = 0
    prev = None
    for d, _ in rows:
        run = run + 1 if prev is not None and d == prev + 1 else 1
        best = max(best, run)
        prev = d
    value = {
        "total": total,
        "days": days,
        "average": round(total / days) if days else 0,
        "bestStreak": best,
    }
    _stats_cache.update(key=key, value=value)
    return value


# ------------------------------------------------------------ 統計 stats
def _anki_day(ts: float, today: datetime.date, cutoff: Optional[int]) -> datetime.date:
    """The Anki day a moment belongs to (days roll over at Anki's hour, 4am by default)."""
    if cutoff:
        return today + datetime.timedelta(days=int((ts - cutoff) // 86400) + 1)
    return datetime.datetime.fromtimestamp(ts).date()


def _pomo_stats(today: datetime.date) -> Dict[str, Any]:
    """The raw session and break log (the page works out every range itself)."""
    log = state._log()
    try:
        cutoff: Optional[int] = int(mw.col.sched.day_cutoff)
    except Exception:
        cutoff = None
    sessions = []
    for f in log["focus"]:
        if not (isinstance(f, list) and len(f) >= 4):
            continue
        ts, secs, cards, how = f[:4]
        mid = ts - secs / 2  # the middle of the session
        moment = datetime.datetime.fromtimestamp(mid)
        day = _anki_day(mid, today, cutoff)
        sessions.append([day.isoformat(), moment.hour, day.weekday(), int(secs), int(cards), how])
    breaks = []
    for b in log["breaks"]:
        if isinstance(b, list) and len(b) >= 4:
            breaks.append([_anki_day(b[0], today, cutoff).isoformat(), int(b[1]), int(b[2]), int(b[3])])
    return {
        "since": log.get("since"),
        "sessions": sessions,  # [date, hour, weekday (Mon 0), seconds, cards, how]
        "breaks": breaks,  # [date, seconds, long, skipped]
        "idlePauses": int(log.get("idle", 0)),
        "resets": int(log.get("resets", 0)),
    }


def _review_stats(today: datetime.date) -> Optional[Dict[str, Any]]:
    """Anki's review history: every day's count, and for each range (7 and 30
    days, a year, all time) the answer buttons, retention, time and a
    weekday × hour grid."""
    try:
        cutoff = int(mw.col.sched.day_cutoff)
        db = mw.col.db
        rows = db.all(
            "select cast((id / 1000 - ?) / 86400.0 + 100000 as integer) as d, count(), coalesce(sum(time), 0) "
            "from revlog where type in (0, 1, 2, 3) group by d order by d",
            cutoff,
        )
        ranges: Dict[str, Any] = {}
        for key, days in (("7", 7), ("30", 30), ("365", 365), ("all", None)):
            since = (cutoff - days * 86400) * 1000 if days else 0
            where = "type in (0, 1, 2, 3) and id > ?"
            buttons = {int(e): int(c) for e, c in db.all(f"select ease, count() from revlog where {where} group by ease", since) if e}
            mature = db.first("select count(), sum(case when ease = 1 then 1 else 0 end) from revlog where type = 1 and id > ?", since) or (0, 0)
            ms = db.scalar(f"select coalesce(sum(time), 0) from revlog where {where}", since) or 0
            new = db.scalar("select count(distinct cid) from revlog where type = 0 and id > ?", since) or 0
            # answers and time by kind: 0 learning (new cards), 1 review, 2 relearning, 3 filtered deck
            by_type = {int(t): [int(c), int(m or 0)] for t, c, m in db.all(
                f"select type, count(), sum(time) from revlog where {where} group by type", since)}
            grid = [0] * 168
            for wd, h, c in db.all(
                "select cast(strftime('%w', id / 1000, 'unixepoch', 'localtime') as integer), "
                "cast(strftime('%H', id / 1000, 'unixepoch', 'localtime') as integer), count() "
                f"from revlog where {where} group by 1, 2",
                since,
            ):
                if wd is not None and h is not None:
                    grid[((int(wd) + 6) % 7) * 24 + int(h)] = int(c)  # rows Monday first
            ranges[key] = {
                "buttons": [buttons.get(i, 0) for i in (1, 2, 3, 4)],
                "reviewAnswers": int(mature[0] or 0),
                "fails": int(mature[1] or 0),
                "ms": int(ms),
                "newCards": int(new),
                "byType": [by_type.get(t, [0, 0]) for t in (0, 1, 2, 3)],
                "grid": grid,
            }
        cards = db.first(
            "select count(), sum(case when type = 0 then 1 else 0 end), "
            "sum(case when type = 2 and ivl >= 21 then 1 else 0 end), "
            "sum(case when type = 2 and ivl < 21 then 1 else 0 end), "
            "sum(case when type in (1, 3) then 1 else 0 end), "
            "sum(case when queue = -1 then 1 else 0 end), "
            "avg(case when type = 2 then ivl end), avg(case when type = 2 and factor > 0 then factor end) from cards"
        ) or (0,) * 8
        notes = db.scalar("select count() from notes") or 0
        try:
            decks = len(mw.col.decks.all_names_and_ids())
        except Exception:
            decks = None
    except Exception as e:
        print(f"Onigiri Kitchen: couldn't read review history for stats: {e}")
        return None
    # day index 99999 is today (Anki's day, with its own rollover hour)
    daily = [[(today - datetime.timedelta(days=99999 - int(d))).isoformat(), int(c), int(ms)] for d, c, ms in rows]
    return {
        "daily": daily,  # [date, reviews, answer ms], every day you reviewed
        "ranges": ranges,
        "collection": {
            "cards": int(cards[0] or 0),
            "new": int(cards[1] or 0),
            "mature": int(cards[2] or 0),
            "young": int(cards[3] or 0),
            "learning": int(cards[4] or 0),
            "suspended": int(cards[5] or 0),
            "avgInterval": round(float(cards[6]), 1) if cards[6] else None,
            "avgEase": round(float(cards[7]) / 10) if cards[7] else None,
            "notes": int(notes),
            "decks": decks,
        },
    }


def _kitchen_stats() -> Dict[str, Any]:
    d = state.data
    log = state._log()
    pet = state.pet.snapshot()
    progress = restaurant_progress()
    try:
        book = len(cached_specials().get("book") or [])
    except Exception:
        book = 0
    decks = sorted((d.get("served_by_deck") or {}).items(), key=lambda kv: -kv[1])[:8]
    try:
        first = datetime.date.fromisoformat(d.get("first_seen") or "")
        days_open = (datetime.date.fromisoformat(anki_today()) - first).days + 1
    except ValueError:
        days_open = None
    owned = [i for i in d.get("owned", []) if i in CATALOG_BY_ID]
    days = sorted((k, v) for k, v in (log.get("days") or {}).items() if isinstance(v, dict))
    return {
        "since": log.get("since"),
        "days": [[k, int(v.get("guests", 0)), int(v.get("mon", 0)), int(v.get("spent", 0))] for k, v in days],
        "served": int(d.get("served_total", 0)),
        "byKind": log.get("guests_by_kind", {}),
        "mon": int(d.get("mon", 0)),
        "earned": int(log.get("mon_earned", 0)),
        "spent": int(log.get("mon_spent", 0)),
        "bySource": log.get("mon_by", {}),
        "topDecks": decks,
        "onigiriMade": int(d.get("onigiri_made", 0)),
        "fishFed": int(d.get("fish_fed", 0)),
        "daysOpen": days_open,
        "firstSeen": d.get("first_seen"),
        "items": len([i for i in owned if CATALOG_BY_ID[i].get("kind") not in ("pet", "reward")]),
        "pets": len([i for i in owned if CATALOG_BY_ID[i].get("kind") == "pet"]),
        "rewards": len([i for i in owned if CATALOG_BY_ID[i].get("kind") == "reward"]),
        "catalog": len([c for c in CATALOG if c.get("kind") not in ("pet", "reward")]),
        "level": int(progress.get("level", 0)),
        "levelFrom": progress.get("levelFrom", "onigiri"),
        "specials": book,
        "pet": {
            "name": pet.get("name"),
            "species": pet.get("species"),
            "stage": f"{pet.get('stageJp', '')} {pet.get('stageName', '')}".strip(),
            "studyDays": pet.get("studyDays", 0),
            "petted": pet.get("timesPetted", 0),
            "gifts": len([g for g, n in (pet.get("gifts") or {}).items() if n]),
            "giftsTotal": len(petmod.GIFTS) + len(petmod.RARE_GIFTS),
        },
    }


def stats_payload() -> Dict[str, Any]:
    state.roll_day()
    today = datetime.date.fromisoformat(anki_today())
    return {
        "today": today.isoformat(),
        "pomo": _pomo_stats(today),
        "reviews": _review_stats(today),
        "kitchen": _kitchen_stats(),
        "studyToday": study_today(),
        "themeMode": conf().get("theme_mode", "anki"),
        "version": VERSION,
    }


class StatsDialog(QDialog):
    """統計: every number the kitchen keeps, in its own window."""

    def __init__(self) -> None:
        super().__init__(mw)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setWindowTitle("Onigiri Kitchen · 統計 Stats")
        self.setMinimumSize(640, 480)
        self.resize(980, 760)
        restoreGeom(self, "onigiriKitchenStats")
        self.web = AnkiWebView(self)
        shortcut = QShortcut(QKeySequence(QKeySequence.StandardKey.Close), self)
        shortcut.activated.connect(self.close)
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web)
        self.setLayout(layout)
        base = f"/_addons/{PACKAGE}/web"
        head = onigiri_link.theme_css() + (
            "<script>window.OKS = "
            + json.dumps(stats_payload(), ensure_ascii=False).replace("</", "<\\/")
            + ";</script>"
        )
        self.web.stdHtml(_read_web("stats.html"), css=[f"{base}/stats.css"], js=[f"{base}/stats.js"], head=head, context=self)

    def closeEvent(self, event: Any) -> None:
        global _stats_dialog
        saveGeom(self, "onigiriKitchenStats")
        _stats_dialog = None
        super().closeEvent(event)


_stats_dialog: Optional[StatsDialog] = None


def open_stats() -> None:
    global _stats_dialog
    if _stats_dialog is not None:
        _stats_dialog.close()
    _stats_dialog = StatsDialog()
    _stats_dialog.show()


# Without Onigiri there's no restaurant level to read, so shop items that need
# a level would stay locked forever. Instead the level grows with the days
# you've studied (from Anki's review log): one level every DAYS_PER_LEVEL days.
DAYS_PER_LEVEL = 3
MAX_STUDY_LEVEL = 30


def restaurant_progress() -> Dict[str, Any]:
    progress = onigiri_link.read_progress()
    if progress.get("found"):
        return progress
    stats = lifetime_stats(int(state.data["today"].get("reviews", 0))) or {}
    days = int(stats.get("days", 0))
    level = min(MAX_STUDY_LEVEL, days // DAYS_PER_LEVEL)
    progress.update(
        level=level,
        xpInto=0 if level >= MAX_STUDY_LEVEL else days % DAYS_PER_LEVEL,
        xpNext=DAYS_PER_LEVEL,
        levelFrom="study",
        studyDays=days,
        daysPerLevel=DAYS_PER_LEVEL,
    )
    return progress


_today_cache: Dict[str, Any] = {"key": None, "value": None}


def study_today() -> Optional[Dict[str, Any]]:
    """Today's studying (cards, time, pace, retention) and what's still due,
    with an estimate of how long it will take at your own pace: seconds per
    answer by card type and answers per new card, from the last 30 days (all
    time if that's empty)."""
    try:
        cutoff = int(mw.col.sched.day_cutoff)
        db = mw.col.db
        start_ms = (cutoff - 86400) * 1000
        today_n = int(db.scalar("select count() from revlog where type in (0, 1, 2, 3) and id > ?", start_ms) or 0)
    except Exception:
        return None
    key = (cutoff, today_n, mw.col.mod if hasattr(mw.col, "mod") else 0)
    if _today_cache["key"] == key:
        return _today_cache["value"]
    try:
        ms = int(db.scalar("select coalesce(sum(time), 0) from revlog where type in (0, 1, 2, 3) and id > ?", start_ms) or 0)
        rev = db.first("select count(), sum(case when ease = 1 then 1 else 0 end) from revlog where type = 1 and id > ?", start_ms) or (0, 0)
        new_today = int(db.scalar("select count(distinct cid) from revlog where type = 0 and id > ?", start_ms) or 0)

        def paces(since: int) -> Dict[int, Tuple[int, int]]:
            return {int(t): (int(c), int(m or 0)) for t, c, m in db.all(
                "select type, count(), sum(time) from revlog where type in (0, 1, 2) and id > ? group by type", since)}

        month = paces((cutoff - 30 * 86400) * 1000)
        if not month:
            month = paces(0)
        new_seen = db.scalar("select count(distinct cid) from revlog where type = 0 and id > ?", (cutoff - 30 * 86400) * 1000) or 0

        def per(t: int, default: float) -> float:
            c, m = month.get(t, (0, 0))
            return m / 1000 / c if c else default

        learn_s = per(0, 8.0)
        review_s = per(1, 8.0)
        relearn_s = per(2, learn_s)
        answers_per_new = (month.get(0, (0, 0))[0] / new_seen) if new_seen else 2.5
        tree = mw.col.sched.deck_due_tree()
        due_new, due_learn, due_review = int(tree.new_count), int(tree.learn_count), int(tree.review_count)
    except Exception as e:
        print(f"Onigiri Kitchen: couldn't estimate today's time: {e}")
        return None
    estimate = due_new * answers_per_new * learn_s + due_learn * relearn_s + due_review * review_s
    value = {
        "cards": today_n,
        "seconds": round(ms / 1000),
        "pace": round(ms / 1000 / today_n, 1) if today_n else None,
        "retention": round(100 * (1 - (rev[1] or 0) / rev[0]), 1) if rev[0] else None,
        "newCards": new_today,
        "due": {"new": due_new, "learn": due_learn, "review": due_review, "total": due_new + due_learn + due_review},
        "estimateSeconds": round(estimate),
        "paces": {"learning": round(learn_s, 1), "review": round(review_s, 1), "relearning": round(relearn_s, 1), "answersPerNew": round(answers_per_new, 1)},
    }
    _today_cache.update(key=key, value=value)
    return value


def widget_payload() -> Dict[str, Any]:
    _sync_with_log()
    progress = onigiri_link.read_progress()
    per = max(1, int(conf().get("reviews_per_guest", 10)))
    pending = state.data.get("pending") or {}
    best = max(pending.values()) if pending else 0
    return {
        "guests": len(state.data.get("guests", [])),
        "nextIn": max(1, per - int(best)),
        "reviews": int(state.data["today"].get("reviews", 0)),
        "focusDone": int(state.data["today"].get("focus_done", 0)),
        "stats": lifetime_stats(int(state.data["today"].get("reviews", 0))),
        "studyToday": study_today(),
        "mon": int(state.data.get("mon", 0)),
        "pet": state.pet.snapshot(),
        "puffleColor": (PUFFLE_COLORS_BY_ID.get(state.data.get("puffle_color") or "blue") or PUFFLE_COLORS[0])["hex"],
        "birdColor": state.data.get("bird_color") or "grey",
        "theme": progress.get("themeColor") or onigiri_link.DEFAULT_THEME_COLOR,
        "timer": timer_payload(),
    }


def kitchen_widget(deck_browser: Any, content: Any) -> None:
    """With Onigiri: Onigiri collects this and lists it in its layout editor, so
    users place it on their home grid (or leave it archived).
    Without Onigiri: it shows under the deck list on Anki's main screen,
    unless turned off in the config."""
    plain = not onigiri_link.find_onigiri_package()
    if plain and not conf().get("show_home_widget_without_onigiri", True):
        return
    try:
        data = json.dumps(widget_payload(), ensure_ascii=False).replace("</", "<\\/")
    except Exception as e:
        print(f"Onigiri Kitchen: widget failed: {e}")
        return
    content.stats += (
        f'<div class="okw{" okw-plain" if plain else ""}" role="button" tabindex="0" title="Open Onigiri Kitchen">'
        f'<script type="application/json" class="okw-data">{data}</script>'
        '<div class="okw-in"><canvas class="okw-scene" width="64" height="40"></canvas>'
        '<div class="okw-info"></div></div></div>'
    )


# Onigiri's layout editor shows the text before the first "." as the widget's
# name; for AnkiWeb installs the real module is just a number, so name it here.
kitchen_widget.__module__ = "Onigiri Kitchen · おにぎり食堂.widget"


# ------------------------------------------------------ main-screen injection
def _read_web(name: str) -> str:
    try:
        with open(os.path.join(ADDON_DIR, "web", name), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def on_webview_content(web_content: Any, context: Any) -> None:
    is_deck_browser = isinstance(context, DeckBrowser)
    is_overview = isinstance(context, Overview)
    is_reviewer = isinstance(context, Reviewer)
    if not (is_deck_browser or is_overview or is_reviewer):
        return
    if is_overview and _finishing is not None and not _finishing["injected"]:
        # This is the congrats page being built right now: put the confetti in it.
        _finishing["injected"] = True
        web_content.head += "<script>" + _celebration_script(_finishing["opts"], on_load=True).replace("</", "<\\/") + "</script>"
        debug_log("confetti built into the congrats page")
    c = conf()
    show_chip = bool(c.get("show_timer_chip", True)) and (
        not is_reviewer or bool(c.get("show_timer_chip_in_reviewer", True))
    )
    init = {
        "chip": show_chip,
        "widget": is_deck_browser and bool(c.get("widget_click_opens_kitchen", True)),
        "timer": timer_payload(),
    }
    web_content.head += (
        f"<style>{_read_web('chip.css')}</style>"
        f"<script>window.OK_CHIP_INIT = {json.dumps(init)};</script>"
        f"<script>{_read_web('sound.js')}</script>"
        f"<script>{_read_web('chip.js')}</script>"
    )
    if is_deck_browser:
        web_content.head += (
            f"<style>{_read_web('widget.css')}</style>"
            f"<script>{_read_web('widget.js')}</script>"
        )


def on_js_message(handled: tuple, message: str, context: Any) -> tuple:
    if not isinstance(message, str) or not message.startswith(CMD_PREFIX):
        return handled
    cmd, _, arg = message[len(CMD_PREFIX):].partition(":")
    if cmd == "open":
        open_kitchen()
        return (True, None)
    if cmd == "timer":
        return (True, handle_kitchen_cmd("timer", arg, None))
    return handled


# ------------------------------------------------ 紙吹雪 deck-finished confetti
_celebrate_next = False
_finishing: Optional[Dict[str, Any]] = None  # set while the finished screen is being drawn
# Anki redraws the congrats screen a couple of times right after a review
# session ends; the celebration stays armed briefly so it survives redraws.
_celebration: Optional[Dict[str, Any]] = None  # {"opts", "until", "id"}
CELEBRATION_WINDOW = 4.0


def debug_log(msg: str) -> None:
    """Small rolling log in user_files/debug_log.txt to diagnose issues."""
    import datetime as _dt

    path = os.path.join(ADDON_DIR, "user_files", "debug_log.txt")
    try:
        lines = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                lines = f.read().splitlines()[-199:]
        lines.append(f"{_dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass


def on_state_will_change(new_state: str, old_state: str) -> None:
    # Only celebrate when the congrats screen follows a review session, not
    # when you open a deck that's already finished.
    global _celebrate_next
    _celebrate_next = old_state == "review" and new_state == "overview"
    if old_state == "review" or new_state == "overview":
        debug_log(f"state {old_state} -> {new_state} (celebrate next: {_celebrate_next})")


def _celebration_script(opts: Dict[str, Any], on_load: bool) -> str:
    call = f"OKCelebrate({json.dumps(opts, ensure_ascii=False)});"
    if on_load:
        # built into the page: wait until it has loaded and laid out
        call = (
            "(function(){function go(){setTimeout(function(){" + call + "},350);}"
            "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',go);}else{go();}})();"
        )
    return _read_web("sound.js") + "\n" + _read_web("celebrate.js") + "\n" + call


def _celebration_opts() -> Dict[str, Any]:
    c = conf()
    try:
        deck = mw.col.decks.current()["name"].split("::")[-1]
    except Exception:
        deck = ""
    accent = None
    try:
        theme = onigiri_link.read_theme()
        if theme:
            accent = theme["light"].get("--accent-color")
    except Exception:
        pass
    return {"deck": deck, "accent": accent, "sound": bool(c.get("sound", True)), "volume": float(c.get("volume", 0.5))}


def around_finished_screen(overview: Any, _old: Any) -> Any:
    """Wraps Anki's (or Onigiri's) 'Congratulations, you finished' screen."""
    global _celebrate_next, _finishing, _celebration
    import time as _time

    celebrate = _celebrate_next
    _celebrate_next = False
    now = _time.time()
    if celebrate:
        if state.shown("tsuru"):
            # 鶴 crane perk: every finished deck brings a golden guest
            state.add_guest({"deck": None, "kind": "golden", "reviews": 0})
            state.save_soon()
        if conf().get("celebrate_deck_finish", True):
            _celebration = {"opts": _celebration_opts(), "until": now + CELEBRATION_WINDOW, "id": str(int(now * 1000))}
    active = _celebration is not None and now <= _celebration["until"]
    if _celebration is not None and not active:
        _celebration = None
    debug_log(f"finished screen shown (after reviewing: {celebrate}, celebration armed: {active})")
    if active:
        opts = dict(_celebration["opts"], id=_celebration["id"])
        _finishing = {"opts": opts, "injected": False}
    try:
        return _old(overview)
    finally:
        pending, _finishing = _finishing, None
        if pending and not pending["injected"]:
            # The page wasn't built through stdHtml (e.g. plain Anki's own
            # congrats page), so send the script once it has loaded.
            try:
                overview.web.eval(_celebration_script(pending["opts"], on_load=False))
                debug_log("confetti sent to the page after it loaded (fallback)")
            except Exception as e:
                debug_log(f"confetti failed: {e!r}")


def _install_celebration() -> None:
    from anki.hooks import wrap

    if hasattr(Overview, "_show_finished_screen"):
        # "around" keeps Anki's (or Onigiri's) finished screen as-is and adds confetti on top.
        Overview._show_finished_screen = wrap(Overview._show_finished_screen, around_finished_screen, "around")
        debug_log("celebration hook installed")
    else:
        debug_log("Overview._show_finished_screen not found: no confetti hook")


# ------------------------------------------------------------- the menu
# Extra mon for rarer Onigiri specials, matching kitchen.js (RARITY bonus and
# how often each is ordered), for guests served in bulk or at day's end.
RARITY_BONUS = {"common": 0, "uncommon": 1, "rare": 2, "epic": 4, "legendary": 6}
# Golden guests tip this much more for today's special once you've finished it
# in Onigiri (kitchen.js TODAY_DONE_BONUS).
TODAY_DONE_BONUS = 3
RARITY_WEIGHT = {"common": 1, "uncommon": 0.8, "rare": 0.6, "epic": 0.45, "legendary": 0.3}
_specials_cache: Dict[str, Any] = {"at": 0.0, "value": None}


def cached_specials() -> Dict[str, Any]:
    import time as _time

    if _specials_cache["value"] is None or _time.time() - _specials_cache["at"] > 60:
        try:
            _specials_cache["value"] = onigiri_link.read_specials()
        except Exception:
            _specials_cache["value"] = {"found": False, "book": [], "today": None}
        _specials_cache["at"] = _time.time()
    return _specials_cache["value"]


def menu_bonus(guest: Dict[str, Any]) -> int:
    import random as _random

    sp = cached_specials()
    kind = guest.get("kind")
    if kind == "leech":
        return 0  # sour plums order a plum onigiri
    if kind == "golden":
        today = sp.get("today")
        if not today:
            return 0
        return RARITY_BONUS.get(today.get("rarity", ""), 0) + (TODAY_DONE_BONUS if today.get("done") else 0)
    book = sp.get("book") or []
    if not book or _random.random() >= 0.75:
        return 0  # a house onigiri
    weights = [RARITY_WEIGHT.get(d.get("rarity"), 1) for d in book]
    dish = _random.choices(book, weights=weights)[0]
    return RARITY_BONUS.get(dish.get("rarity"), 0)


# --------------------------------------------------------------------- setup
def on_profile_open() -> None:
    state.load()
    state.menu_bonus = menu_bonus


def on_profile_close() -> None:
    if _dialog is not None:
        _dialog.close()
    pomo.reset()
    state.save()


def _add_menu() -> None:
    menu = mw.form.menuTools
    open_action = QAction("Onigiri Kitchen", mw)
    shortcut = str(conf().get("shortcut") or "").strip()
    if shortcut:
        open_action.setShortcut(QKeySequence(shortcut))
    open_action.triggered.connect(lambda: open_kitchen())
    menu.addAction(open_action)

    focus_action = QAction("Onigiri Kitchen: Start Focus Timer", mw)
    focus_action.triggered.connect(lambda: pomo.start_focus())
    menu.addAction(focus_action)


def setup() -> None:
    mw.addonManager.setWebExports(__name__, r"web/.*\.(css|js|html|png|svg)")
    gui_hooks.profile_did_open.append(on_profile_open)
    gui_hooks.profile_will_close.append(on_profile_close)
    gui_hooks.reviewer_did_answer_card.append(on_answer)
    gui_hooks.webview_will_set_content.append(on_webview_content)
    gui_hooks.webview_did_receive_js_message.append(on_js_message)
    gui_hooks.main_window_did_init.append(_add_menu)
    gui_hooks.state_will_change.append(on_state_will_change)
    if hasattr(gui_hooks, "state_did_undo"):
        gui_hooks.state_did_undo.append(on_undo)
    # Seeing a question/answer counts as activity for the focus timer's idle pause.
    gui_hooks.reviewer_did_show_question.append(lambda card: pomo.touch())
    gui_hooks.reviewer_did_show_answer.append(lambda card: pomo.touch())
    # After all add-ons (including Onigiri) have set up their own congrats page.
    gui_hooks.main_window_did_init.append(_install_celebration)
    # Must be registered at load time so Onigiri can pick it up.
    gui_hooks.deck_browser_will_render_content.append(kitchen_widget)
