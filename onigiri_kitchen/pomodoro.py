"""A wall-clock pomodoro timer (focus -> break -> focus ...).

Endless focus (the ∞ button) is the no-breaks version: the clock counts up,
never stops for a break, and every focus-length of study quietly counts as a
finished session (a dango and a golden guest) without any break pop-ups.

Times are stored as absolute end timestamps, so the countdown stays accurate
even if Qt timers are delayed while Anki is busy.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional

from aqt import mw
from aqt.qt import QTimer

IDLE, FOCUS, BREAK = "idle", "focus", "break"


class Pomodoro:
    def __init__(
        self,
        get_conf: Callable[[], Dict[str, Any]],
        on_change: Callable[[], None],
        on_event: Callable[[str, Dict[str, Any]], None],
    ) -> None:
        self._conf = get_conf
        self._on_change = on_change
        self._on_event = on_event
        self.phase = IDLE
        self.ends_at: Optional[float] = None
        self.paused_remaining: Optional[float] = None
        self.total = 0.0
        self.rounds = 0  # focus sessions finished in the current cycle
        self.long_break = False
        self.focus_cards = 0
        self.last_focus: Optional[Dict[str, Any]] = None  # the last finished session, for the break card
        # Idle pause: focus only counts down while you're actually reviewing.
        self.last_activity = time.time()
        self.idle_paused = False
        # Endless focus: time studied is banked + the running stretch.
        self.endless = False
        self.banked = 0.0
        self.seg_start: Optional[float] = None
        self.blocks_done = 0
        self._timer = QTimer(mw)
        self._timer.setInterval(1000)
        self._timer.timeout.connect(self._tick)

    # ------------------------------------------------------------ config
    def _minutes(self, key: str, default: float) -> float:
        try:
            return max(0.1, float(self._conf().get(key, default)))
        except (TypeError, ValueError):
            return default

    def _cycle(self) -> int:
        try:
            return max(1, int(self._conf().get("rounds_before_long_break", 4)))
        except (TypeError, ValueError):
            return 4

    def _idle_limit(self) -> Optional[float]:
        """Seconds without review activity before focus pauses (None = off)."""
        c = self._conf()
        if not c.get("pause_focus_when_idle", True):
            return None
        try:
            return max(30.0, float(c.get("idle_pause_minutes", 2)) * 60)
        except (TypeError, ValueError):
            return 120.0

    def _card_goal(self) -> int:
        try:
            return max(0, int(self._conf().get("focus_card_goal", 0)))
        except (TypeError, ValueError):
            return 0

    def _block(self) -> float:
        return self._minutes("focus_minutes", 25) * 60

    def _endless_mode(self) -> bool:
        return bool(self._conf().get("endless_focus", False))

    def elapsed(self, now: Optional[float] = None) -> float:
        now = time.time() if now is None else now
        return self.banked + (now - self.seg_start if self.seg_start is not None else 0.0)

    # ----------------------------------------------------------- controls
    def start_focus(self) -> None:
        if self._endless_mode():
            self.start_endless()
            return
        self.endless = False
        self._begin(FOCUS, self._minutes("focus_minutes", 25) * 60)
        self.focus_cards = 0
        self.last_activity = time.time()
        self.idle_paused = False
        self._emit()

    def start_endless(self) -> None:
        self.phase = FOCUS
        self.endless = True
        self.banked = 0.0
        self.seg_start = time.time()
        self.blocks_done = 0
        self.total = self._block()
        self.ends_at = None
        self.paused_remaining = None
        self.focus_cards = 0
        self.last_activity = time.time()
        self.idle_paused = False
        self._timer.start()
        self._emit()

    def set_endless(self, on: bool) -> None:
        """Switch a running focus session between countdown and endless,
        keeping the time you've already put in."""
        if self.phase != FOCUS or on == self.endless:
            return
        now = time.time()
        if on:
            running = self.ends_at is not None
            left = (self.ends_at - now) if running else (self.paused_remaining or 0.0)
            self.banked = max(0.0, self.total - left)
            self.seg_start = now if running else None
            self.blocks_done = 0
            self.endless = True
            self.total = self._block()
            self.ends_at = None
            self.paused_remaining = None
            self._timer.start()
        else:
            block = self._block()
            left = max(60.0, block - (self.elapsed(now) % block))
            running = self.seg_start is not None
            self.endless = False
            self.seg_start = None
            self.banked = 0.0
            self.total = block
            if running:
                self.ends_at = now + left
                self.paused_remaining = None
                self._timer.start()
            else:
                self.ends_at = None
                self.paused_remaining = left
        self._emit()

    def _stop_endless(self) -> None:
        self.endless = False
        self.seg_start = None
        self.banked = 0.0
        self._timer.stop()
        self.phase = IDLE
        self.ends_at = None
        self.paused_remaining = None
        self.idle_paused = False
        self._emit()

    def start_break(self) -> None:
        self.long_break = self.rounds > 0 and self.rounds % self._cycle() == 0
        key, default = ("long_break_minutes", 15) if self.long_break else ("short_break_minutes", 5)
        self._begin(BREAK, self._minutes(key, default) * 60)
        self._emit()

    def pause(self) -> None:
        if self.endless and self.phase == FOCUS:
            if self.seg_start is not None:
                self.banked = self.elapsed()
                self.seg_start = None
                self._emit()
            return
        if self.ends_at is not None:
            self.paused_remaining = max(0.0, self.ends_at - time.time())
            self.ends_at = None
            self._timer.stop()
            self._emit()

    def resume(self) -> None:
        self.idle_paused = False
        self.last_activity = time.time()
        if self.endless and self.phase == FOCUS:
            if self.seg_start is None:
                self.seg_start = time.time()
                self._timer.start()
                self._emit()
            return
        if self.paused_remaining is not None:
            self.ends_at = time.time() + self.paused_remaining
            self.paused_remaining = None
            self._timer.start()
            self._emit()

    def skip(self) -> None:
        if self.endless and self.phase == FOCUS:
            self._stop_endless()  # "skip" ends an endless session (no break)
        elif self.phase == FOCUS:
            # Ending focus early goes straight to a break, without the golden guest.
            self._finish_focus(credited=False)
        elif self.phase == BREAK:
            self._finish_break()
        else:
            self.start_focus()

    def reset(self) -> None:
        self.endless = False
        self.seg_start = None
        self.banked = 0.0
        self.idle_paused = False
        self._timer.stop()
        self.phase = IDLE
        self.ends_at = None
        self.paused_remaining = None
        self.rounds = 0
        self.focus_cards = 0
        self.long_break = False
        self._emit()

    def extend_break(self, minutes: float = 2) -> None:
        if self.phase == BREAK and self.ends_at is not None:
            self.ends_at += minutes * 60
            self.total += minutes * 60
            self._emit()

    def touch(self) -> None:
        """Review activity (a question or answer shown). Resumes an idle pause."""
        self.last_activity = time.time()
        if self.phase == FOCUS and self.idle_paused:
            self.resume()

    def on_review(self) -> None:
        self.touch()
        if self.endless and self.phase == FOCUS:
            self.focus_cards += 1
            return
        if self.phase != FOCUS or self.ends_at is None:
            return
        self.focus_cards += 1
        goal = self._card_goal()
        if goal and self.focus_cards >= goal:
            self._finish_focus(credited=True)

    # ----------------------------------------------------------- internals
    def _begin(self, phase: str, seconds: float) -> None:
        self.phase = phase
        self.total = seconds
        self.ends_at = time.time() + seconds
        self.paused_remaining = None
        self._timer.start()

    def _tick(self) -> None:
        if self.endless and self.phase == FOCUS:
            self._tick_endless()
            return
        if self.phase == FOCUS and self.ends_at is not None:
            limit = self._idle_limit()
            now = time.time()
            if limit and now - self.last_activity > limit:
                # Pause, and give back the idle stretch: remaining time is what
                # was left at the last moment you were reviewing.
                self.paused_remaining = max(0.0, self.ends_at - self.last_activity)
                self.ends_at = None
                self.idle_paused = True
                self._timer.stop()
                self._emit()
                self._on_event("idle_paused", {"minutes": round(limit / 60, 1)})
                return
        if self.ends_at is None or time.time() < self.ends_at:
            return
        if self.phase == FOCUS:
            self._finish_focus(credited=True)
        elif self.phase == BREAK:
            self._finish_break()

    def _tick_endless(self) -> None:
        if self.seg_start is None:
            return
        now = time.time()
        limit = self._idle_limit()
        if limit and now - self.last_activity > limit:
            # idle: stop counting, and give back the idle stretch
            self.banked += max(0.0, self.last_activity - self.seg_start)
            self.seg_start = None
            self.idle_paused = True
            self._emit()
            self._on_event("idle_paused", {"minutes": round(limit / 60, 1)})
            return
        # every focus-length studied counts as a finished session, quietly
        blocks = int(self.elapsed(now) // self._block())
        while self.blocks_done < blocks:
            self.blocks_done += 1
            if self.rounds >= self._cycle():
                self.rounds = 0
            self.rounds += 1
            cards = self.focus_cards
            self.focus_cards = 0
            self._emit()
            self._on_event("endless_block", {"credited": True, "cards": cards, "seconds": self._block()})

    def _left(self) -> float:
        """Seconds left in the current timed phase (0 when it ran out)."""
        if self.ends_at is not None:
            return max(0.0, self.ends_at - time.time())
        return max(0.0, float(self.paused_remaining or 0))

    def _finish_focus(self, credited: bool) -> None:
        self.rounds += 1
        cards = self.focus_cards
        left = self._left()
        studied = max(0.0, float(self.total or 0) - left)
        # for the stats: ran the full time, ended at the card goal, or cut short
        how = "x" if not credited else ("g" if left > 1 else "f")
        self.last_focus = {"seconds": int(studied), "cards": cards, "how": how}
        self.start_break()
        self._on_event("focus_done", {"credited": credited, "cards": cards, "long": self.long_break, "seconds": studied, "how": how})

    def _finish_break(self) -> None:
        was_long = self.long_break
        left = self._left()
        took = max(0.0, float(self.total or 0) - left)
        if was_long:
            self.rounds = 0
        if self._conf().get("auto_start_next_focus", False):
            self.start_focus()
        else:
            self._timer.stop()
            self.phase = IDLE
            self.ends_at = None
            self.paused_remaining = None
            self._emit()
        self._on_event("break_done", {"long": was_long, "seconds": took, "skipped": left > 1})

    def _emit(self) -> None:
        try:
            self._on_change()
        except Exception as e:
            print(f"Onigiri Kitchen: timer update failed: {e}")

    def snapshot(self) -> Dict[str, Any]:
        if self.ends_at is not None:
            remaining = max(0.0, self.ends_at - time.time())
        elif self.paused_remaining is not None:
            remaining = self.paused_remaining
        else:
            remaining = 0.0
        return {
            "phase": self.phase,
            "endsAt": int(self.ends_at * 1000) if self.ends_at else None,
            "remaining": int(remaining * 1000),
            "total": int(self.total * 1000),
            "paused": (self.seg_start is None) if self.endless and self.phase == FOCUS else self.paused_remaining is not None,
            "endless": self.endless and self.phase == FOCUS,
            "elapsed": int(self.elapsed() * 1000) if self.endless else 0,
            "idle": self.idle_paused,
            "rounds": self.rounds,
            "cycle": self._cycle(),
            "longBreak": self.long_break,
            "focusCards": self.focus_cards,
            "lastFocus": self.last_focus,
            "cardGoal": self._card_goal(),
            "now": int(time.time() * 1000),
        }
