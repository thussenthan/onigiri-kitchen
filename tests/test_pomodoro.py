import pytest

from onigiri_kitchen import pomodoro
from onigiri_kitchen.pomodoro import Pomodoro


class Clock:
    now = 1_000_000.0

    def time(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(pomodoro.time, "time", c.time)
    return c


def make(clock, **conf):
    settings = {"focus_minutes": 25, "short_break_minutes": 5, "long_break_minutes": 15,
                "rounds_before_long_break": 2, "pause_focus_when_idle": False, "idle_pause_minutes": 2}
    settings.update(conf)
    events = []
    p = Pomodoro(lambda: settings, lambda: None, lambda kind, info: events.append((kind, info)))
    return p, events, settings


def advance(clock, p, seconds, step=1):
    for _ in range(int(seconds / step)):
        clock.now += step
        p._tick()


def test_a_full_focus_session_is_credited_and_a_break_starts(clock):
    p, events, _ = make(clock)
    p.start_focus()
    advance(clock, p, 25 * 60 + 1)
    assert events[0][0] == "focus_done" and events[0][1]["credited"] and events[0][1]["how"] == "f"
    assert p.phase == "break" and not p.long_break and p.rounds == 1


def test_the_long_break_comes_after_the_last_round_of_the_cycle(clock):
    p, events, _ = make(clock)
    for _ in range(2):
        p.start_focus()
        advance(clock, p, 25 * 60 + 1)
        advance(clock, p, 15 * 60 + 1)
    kinds = [(k, i.get("long")) for k, i in events]
    assert ("focus_done", False) in kinds and ("focus_done", True) in kinds
    assert p.rounds == 0 and p.phase == "idle"


def test_pausing_keeps_the_time_left(clock):
    p, _, _ = make(clock)
    p.start_focus()
    advance(clock, p, 600)
    p.pause()
    left = p.paused_remaining
    clock.now += 3600
    p.resume()
    assert abs(p.ends_at - (clock.now + left)) < 1e-6
    assert abs(left - 900) < 2


def test_a_long_pause_is_not_mistaken_for_the_computer_sleeping(clock):
    p, events, _ = make(clock)
    p.start_focus()
    advance(clock, p, 60)
    p.pause()
    clock.now += 7200
    p.resume()
    advance(clock, p, 10)
    assert abs((p.ends_at - clock.now) - (25 * 60 - 70)) < 2 and not events


def test_time_the_computer_slept_does_not_count_when_the_idle_pause_is_off(clock):
    p, events, _ = make(clock)
    p.start_focus()
    advance(clock, p, 60)
    clock.now += 3 * 3600  # (the lid was closed)
    p._tick()
    assert not events and p.phase == "focus"
    assert abs((p.ends_at - clock.now) - (25 * 60 - 61)) < 3


def test_going_quiet_pauses_focus_and_gives_the_time_back(clock):
    p, events, _ = make(clock, pause_focus_when_idle=True, idle_pause_minutes=2)
    p.start_focus()
    advance(clock, p, 60)
    p.touch()
    advance(clock, p, 200)
    assert p.idle_paused and events[-1][0] == "idle_paused"
    assert abs(p.paused_remaining - (25 * 60 - 60)) < 3  # (the quiet stretch is not counted)
    p.touch()  # (your next card)
    assert not p.idle_paused and p.ends_at is not None


def test_ending_focus_early_gives_no_credit(clock):
    p, events, _ = make(clock)
    p.start_focus()
    advance(clock, p, 300)
    p.skip()
    kind, info = events[0]
    assert kind == "focus_done" and not info["credited"] and info["how"] == "x" and 295 <= info["seconds"] <= 301


def test_the_card_goal_ends_focus_when_reached(clock):
    p, events, _ = make(clock, focus_card_goal=3)
    p.start_focus()
    advance(clock, p, 60)
    for _ in range(3):
        p.on_review()
    assert events and events[0][1]["how"] == "g" and events[0][1]["cards"] == 3


def test_endless_focus_credits_every_focus_length_quietly(clock):
    p, events, settings = make(clock, endless_focus=True)
    p.start_focus()
    assert p.endless
    advance(clock, p, 25 * 60 * 2 + 5, step=5)
    assert [k for k, _ in events] == ["endless_block", "endless_block"]
    assert p.phase == "focus"
    p.skip()
    assert p.phase == "idle"


def test_switching_to_endless_keeps_the_time_already_put_in(clock):
    p, _, _ = make(clock)
    p.start_focus()
    advance(clock, p, 600)
    p.set_endless(True)
    assert abs(p.elapsed() - 600) < 2
    p.set_endless(False)
    assert p.phase == "focus" and p.ends_at is not None and not p.endless


def test_a_break_can_be_extended_and_skipped(clock):
    p, events, _ = make(clock)
    p.start_break()
    before = p.ends_at
    p.extend_break()
    assert p.ends_at == before + 120
    p.skip()
    assert events[-1][0] == "break_done" and events[-1][1]["skipped"] and p.phase == "idle"


def test_reset_clears_the_cycle(clock):
    p, _, _ = make(clock)
    p.start_focus()
    advance(clock, p, 25 * 60 + 1)
    p.reset()
    assert p.phase == "idle" and p.rounds == 0
