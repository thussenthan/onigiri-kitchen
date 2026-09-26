"""A wall-clock pomodoro timer (focus -> break -> focus ...).

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
        # Idle pause: focus only counts down while you're actually reviewing.
        self.last_activity = time.time()
        self.idle_paused = False
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
            return max(30.0, float(c.get("idle_pause_minutes", 1)) * 60)
        except (TypeError, ValueError):
            return 60.0

    def _card_goal(self) -> int:
        try:
            return max(0, int(self._conf().get("focus_card_goal", 0)))
        except (TypeError, ValueError):
            return 0

    # ----------------------------------------------------------- controls
    def start_focus(self) -> None:
        self._begin(FOCUS, self._minutes("focus_minutes", 25) * 60)
        self.focus_cards = 0
        self.last_activity = time.time()
        self.idle_paused = False
        self._emit()

    def start_break(self) -> None:
        self.long_break = self.rounds > 0 and self.rounds % self._cycle() == 0
        key, default = ("long_break_minutes", 15) if self.long_break else ("short_break_minutes", 5)
        self._begin(BREAK, self._minutes(key, default) * 60)
        self._emit()

    def pause(self) -> None:
        if self.ends_at is not None:
            self.paused_remaining = max(0.0, self.ends_at - time.time())
            self.ends_at = None
            self._timer.stop()
            self._emit()

    def resume(self) -> None:
        self.idle_paused = False
        self.last_activity = time.time()
        if self.paused_remaining is not None:
            self.ends_at = time.time() + self.paused_remaining
            self.paused_remaining = None
            self._timer.start()
            self._emit()

    def skip(self) -> None:
        if self.phase == FOCUS:
            # Ending focus early goes straight to a break, without the golden guest.
            self._finish_focus(credited=False)
        elif self.phase == BREAK:
            self._finish_break()
        else:
            self.start_focus()

    def reset(self) -> None:
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

    def _finish_focus(self, credited: bool) -> None:
        self.rounds += 1
        cards = self.focus_cards
        self.start_break()
        self._on_event("focus_done", {"credited": credited, "cards": cards, "long": self.long_break})

    def _finish_break(self) -> None:
        was_long = self.long_break
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
        self._on_event("break_done", {"long": was_long})

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
            "paused": self.paused_remaining is not None,
            "idle": self.idle_paused,
            "rounds": self.rounds,
            "cycle": self._cycle(),
            "longBreak": self.long_break,
            "focusCards": self.focus_cards,
            "cardGoal": self._card_goal(),
            "now": int(time.time() * 1000),
        }
