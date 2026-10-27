import datetime
import types

from aqt import mw

from onigiri_kitchen import review_stats

TODAY = datetime.date(2026, 9, 29)
CUTOFF = 1_800_000_000  # the end of today, in seconds


class DB:
    def __init__(self, rows):
        self.rows = rows

    def first(self, q):
        return (len(self.rows), max(r[0] for r in self.rows))

    def all(self, q):
        return self.rows


def at(days_ago, minutes):
    """A revlog id: `minutes` into the day that was `days_ago` before today."""
    return int((CUTOFF - 86400 * (days_ago + 1) + minutes * 60) * 1000)


def run(rows):
    review_stats._records_cache.clear()
    mw.col = types.SimpleNamespace(db=DB(rows))
    return review_stats._review_records(CUTOFF, TODAY)


def test_days_count_each_kind_and_the_best_run():
    rows = [(at(1, m), 100 + m, 1, 1 if m == 2 else 3, 5000) for m in range(6)]  # reviews, one Again
    rows += [(at(1, 30 + m), 200 + m, 0, 3, 4000) for m in range(5)]  # new cards, 30 minutes later
    rows += [(at(0, 5), 300, 2, 3, 3000)]
    out = run(rows)
    yesterday = next(d for d in out["days"] if d[0] == "2026-09-28")
    assert yesterday[1:] == [5, 6, 0, 0, 1, 5, 8]  # learning, review, relearn, filtered, Agains, new, best run
    assert out["days"][-1][0] == "2026-09-29"


def test_answers_close_together_make_one_session():
    rows = [(at(1, 10 + m), 100 + m, 1, 3, 4000) for m in range(6)]
    rows += [(at(1, 120 + m), 200 + m, 1, 3, 4000) for m in range(5)]  # an hour later: another session
    sessions = run(rows)["sessions"]
    assert [s[2] for s in sessions] == [6, 5]
    assert all(s[0] == "2026-09-28" for s in sessions)


def test_tiny_sessions_are_left_out():
    assert run([(at(1, m), 100 + m, 1, 3, 4000) for m in range(3)])["sessions"] == []


def test_the_result_is_reused_until_the_log_changes():
    rows = [(at(1, m), 100 + m, 1, 3, 4000) for m in range(6)]
    first = run(rows)
    assert review_stats._review_records(CUTOFF, TODAY) is first
    mw.col.db.rows = rows + [(at(0, 1), 999, 1, 3, 4000)]
    assert review_stats._review_records(CUTOFF, TODAY) is not first
