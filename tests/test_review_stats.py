import datetime
import types

from aqt import mw

from onigiri_kitchen import review_stats

TODAY = datetime.date(2026, 9, 29)
CUTOFF = 1_800_000_000  # the end of today, in seconds


class DB:
    """A revlog: the count/newest query, and the rows after a given id."""

    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def first(self, q):
        return (len(self.rows), max((r[0] for r in self.rows), default=0))

    def all(self, q, after=0):
        self.queries.append(after)
        return [r for r in sorted(self.rows) if r[0] > after]


def at(days_ago, minutes):
    """A revlog id: `minutes` into the day that was `days_ago` before today."""
    return int((CUTOFF - 86400 * (days_ago + 1) + minutes * 60) * 1000)


def run(rows):
    review_stats._scan = {}
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


def test_only_new_answers_are_read_after_the_first_pass():
    rows = [(at(1, m), 100 + m, 1, 3, 4000) for m in range(6)]
    run(rows)
    db = mw.col.db
    db.rows = rows + [(at(0, 1), 999, 1, 3, 4000)]
    db.queries.clear()
    out = review_stats._review_records(CUTOFF, TODAY)
    assert db.queries == [rows[-1][0]]  # (read only what came after the last answer seen)
    assert out["days"][-1][0] == "2026-09-29" and out["days"][-1][2] == 1


def test_incremental_result_matches_a_full_pass():
    rows = [(at(2, m), 100 + m, 1, 1 if m % 4 == 0 else 3, 3000) for m in range(12)]
    rows += [(at(1, 200 + m), 300 + m, 0, 3, 3000) for m in range(7)]
    rows += [(at(0, 30 + m), 500 + m, 2, 3, 3000) for m in range(5)]
    full = run(rows)
    review_stats._scan = {}
    run(rows[:9])
    mw.col.db.rows = rows
    assert review_stats._review_records(CUTOFF, TODAY) == full


def test_an_undone_review_starts_the_scan_over():
    rows = [(at(1, m), 100 + m, 1, 3, 4000) for m in range(6)]
    run(rows)
    mw.col.db.rows = rows[:-1]  # the newest answer was undone
    out = review_stats._review_records(CUTOFF, TODAY)
    assert out["days"][0][2] == 5


def test_a_new_day_starts_the_scan_over():
    rows = [(at(1, m), 100 + m, 1, 3, 4000) for m in range(6)]
    run(rows)
    out = review_stats._review_records(CUTOFF + 86400, TODAY + datetime.timedelta(days=1))
    assert out["days"][0][0] == "2026-09-28"
