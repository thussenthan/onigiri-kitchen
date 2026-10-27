"""Onigiri Kitchen: what the Stats window and the home-screen widget read from
Anki's review log (the Records, the missed days and every range's totals).
Needs only the collection, not the kitchen's own save."""
from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional

from aqt import mw

from . import diag

_overdue_cache: Dict[str, Any] = {"key": None, "value": None}

def _new_per_day() -> int:
    """New cards a day your decks let you see: the new-card limits of the
    top-level decks that still have new cards waiting (today's limits, as the
    log doesn't keep past ones). 0 when it can't be worked out."""
    try:
        total = 0
        for entry in mw.col.decks.all_names_and_ids(skip_empty_default=True):
            if "::" in entry.name:
                continue
            ids = list(mw.col.decks.deck_and_child_ids(entry.id))
            marks = ",".join(str(int(i)) for i in ids)
            waiting = mw.col.db.scalar(f"select count() from cards where queue = 0 and (did in ({marks}) or odid in ({marks}))")
            if not waiting:
                continue
            conf = mw.col.decks.config_dict_for_deck_id(entry.id)
            total += int((conf.get("new") or {}).get("perDay", 0))
        return total
    except Exception:
        return 0


def _overdue_days(cutoff: int, today_n: int) -> Dict[str, List[int]]:
    """Day indexes (99999 is today) that you left something undone.
    "reviews": a review card was due but not answered by the day's end.
    "all": that, or a card in its learning steps came round again and wasn't
    answered, or fewer new cards were started than your decks' daily limit.
    Anki keeps no daily due counts, so it is rebuilt from the log: an answer's
    interval says when the card came due, and the days between then and the
    next answer were missed. Cards still overdue now count from their due day
    up to yesterday. The new-card part uses today's limits and assumes there
    were new cards left, so it's approximate. Cached until the day or the log changes."""
    key = (cutoff, today_n)
    if _overdue_cache["key"] == key:
        return _overdue_cache["value"]
    reviews: set = set()
    learning: set = set()
    new_by_day: Dict[int, int] = {}
    try:
        db = mw.col.db
        rows = db.all(
            "select cid, id, cast((id / 1000 - ?) / 86400.0 + 100000 as integer), type, ivl from revlog "
            "where type in (0, 1, 2, 4, 5) order by cid, id", cutoff)
        day = lambda ts: int((ts - cutoff) // 86400) + 100000
        cid_prev = None
        due = None  # the day a review is due
        step = None  # the day a learning step comes round
        for cid, rid, d, t, ivl in rows:
            if cid != cid_prev:
                cid_prev, due, step = cid, None, None
                if t == 0:
                    new_by_day[d] = new_by_day.get(d, 0) + 1
            if t == 1 and due is not None and due < d:
                reviews.update(range(due, d))
            if t in (0, 1, 2) and step is not None and step < d:
                learning.update(range(step, d))
            # a positive interval is days until the next review; a negative one is
            # seconds until the next learning step; a reset leaves neither
            due = d + ivl if t in (0, 1, 2) and ivl > 0 else None
            step = day(rid / 1000 - ivl) if t in (0, 1, 2) and ivl < 0 else None
        sched_today = int(mw.col.sched.today)
        oldest = db.scalar("select min(due) from cards where queue = 2 and due < ?", sched_today)
        if oldest is not None:
            reviews.update(range(99999 - (sched_today - int(oldest)), 99999))
        stuck = db.scalar("select min(due) from cards where queue = 1 and due < ?", cutoff - 86400)
        if stuck is not None:
            learning.update(range(day(int(stuck)), 99999))
    except Exception as e:
        diag.error("couldn't work out overdue days", e)
        return {"reviews": [], "all": []}
    short: set = set()
    limit = _new_per_day()
    if limit and new_by_day:
        short = {d for d in range(min(new_by_day), 99999) if new_by_day.get(d, 0) < limit}
    value = {"reviews": sorted(reviews), "all": sorted(reviews | learning | short)}
    _overdue_cache.update(key=key, value=value)
    return value


def _iso_days(today: datetime.date, idx: List[int]) -> List[str]:
    return [(today - datetime.timedelta(days=99999 - d)).isoformat() for d in idx]


_SESSION_GAP_MS = 300000  # answers further apart than this are different study sessions


def _new_scan(cutoff: int) -> Dict[str, Any]:
    return {"cutoff": cutoff, "n": 0, "last_id": 0, "days": {}, "sessions": [],
            "run": 0, "prev": None, "start": 0, "first_id": 0, "count": 0}


def _scan_rows(scan: Dict[str, Any], rows: List[Any]) -> None:
    """Fold more of the log (in id order) into a scan. The log only ever grows at
    its end, so Records are worked out once and then only the new answers are read."""
    cutoff = scan["cutoff"]
    days = scan["days"]
    day_of = lambda ms: int((ms / 1000 - cutoff) / 86400.0 + 100000)

    def close_session() -> None:
        if scan["count"] >= 5 and scan["prev"] is not None:
            scan["sessions"].append([day_of(scan["first_id"]), round((scan["prev"] - scan["start"]) / 60000, 1), scan["count"]])

    for rid, cid, t, ease, ms in rows:
        d = day_of(rid)
        row = days.setdefault(d, [0, 0, 0, 0, 0, set(), 0])  # t0, t1, t2, t3, review Agains, new cids, best run
        row[t] += 1
        if t == 1 and ease == 1:
            row[4] += 1
        if t == 0:
            row[5].add(cid)
        scan["run"] = 0 if ease == 1 else scan["run"] + 1
        row[6] = max(row[6], scan["run"])
        if scan["prev"] is None or rid - scan["prev"] > _SESSION_GAP_MS:
            close_session()
            scan["start"], scan["first_id"], scan["count"] = rid - (ms or 0), rid, 0
        scan["prev"] = rid
        scan["count"] += 1
        scan["last_id"] = rid
    scan["n"] += len(rows)


_scan: Dict[str, Any] = {}


def _review_records(cutoff: int, today: datetime.date) -> Dict[str, Any]:
    """What the Records page is worked out from: for each day, answers by kind
    (learning, review, relearning, filtered), review Agains, new cards and the
    longest run of answers that weren't Again; and every study session (answers
    less than 5 minutes apart) with its length and card count. Only answers new
    since the last call are read (a fresh pass when the day, or the log's past, changed)."""
    global _scan
    try:
        total, newest = mw.col.db.first("select count(), coalesce(max(id), 0) from revlog where type in (0, 1, 2, 3)") or (0, 0)
        scan = _scan
        if scan.get("cutoff") != cutoff or newest < scan.get("last_id", 0) or total < scan.get("n", 0):
            scan = _new_scan(cutoff)  # (a new day, or reviews were undone or the log was replaced)
        rows = mw.col.db.all("select id, cid, type, ease, time from revlog where type in (0, 1, 2, 3) and id > ? order by id", scan["last_id"])
        if scan["n"] + len(rows) != total:
            scan = _new_scan(cutoff)  # (something in the middle changed: start over)
            rows = mw.col.db.all("select id, cid, type, ease, time from revlog where type in (0, 1, 2, 3) order by id")
        _scan_rows(scan, rows)
        _scan = scan
    except Exception as e:
        diag.error("couldn't read review log for records", e)
        _scan = {}
        return {"days": [], "sessions": []}
    date_of = lambda d: (today - datetime.timedelta(days=99999 - d)).isoformat()
    sessions = [[date_of(d), m, c] for d, m, c in scan["sessions"]]
    if scan["count"] >= 5 and scan["prev"] is not None:  # (the session still open at the end of the log)
        sessions.append([date_of(int((scan["first_id"] / 1000 - cutoff) / 86400.0 + 100000)), round((scan["prev"] - scan["start"]) / 60000, 1), scan["count"]])
    out = [[date_of(d), r[0], r[1], r[2], r[3], r[4], len(r[5]), r[6]] for d, r in sorted(scan["days"].items())]
    return {"days": out, "sessions": sessions}


def review_stats(today: datetime.date) -> Optional[Dict[str, Any]]:
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
            by_type = {int(t): [int(c), int(m or 0), int(f or 0)] for t, c, m, f in db.all(
                f"select type, count(), sum(time), sum(case when ease = 1 then 1 else 0 end) from revlog where {where} group by type", since)}
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
                "byType": [by_type.get(t, [0, 0, 0]) for t in (0, 1, 2, 3)],  # [answers, ms, Again presses]
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
        diag.error("couldn't read review history for stats", e)
        return None
    # day index 99999 is today (Anki's day, with its own rollover hour)
    overdue = _overdue_days(cutoff, sum(int(c) for _, c, _ in rows))
    daily = [[(today - datetime.timedelta(days=99999 - int(d))).isoformat(), int(c), int(ms)] for d, c, ms in rows]
    return {
        "daily": daily,  # [date, reviews, answer ms], every day you reviewed
        # days something was left undone (so every other day since your first review was cleared):
        # "missed" is review cards only, "missedAll" adds learning and new cards
        "missed": _iso_days(today, overdue["reviews"]),
        "missedAll": _iso_days(today, overdue["all"]),
        "ranges": ranges,
        # per day [date, learning, review, relearning, filtered answers, review Agains, new cards, best run of non-Agains]
        # and sessions [date, minutes, cards]: what the Records page works from
        "records": _review_records(cutoff, today),
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
