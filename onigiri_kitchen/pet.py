"""Tama, the shop cat: a gentle virtual pet.

Her needs rise when you study and play, and drift down slowly while you're
away, but only to a floor. She never gets sick, runs off, or holds a grudge.
Missing days just makes her sleepier; she's always happy to see you again.
"""

from __future__ import annotations

import random
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

# Stage thresholds are in *study days* (total, not a streak), so a break
# never sends her backwards.
STAGES: List[Dict[str, Any]] = [
    {"days": 0, "jp": "子猫", "name": "Kitten"},
    {"days": 3, "jp": "若猫", "name": "Young cat"},
    {"days": 10, "jp": "看板猫", "name": "Shop cat"},
    {"days": 25, "jp": "招き猫", "name": "Maneki master"},
]

TRAITS = {
    "classic": {"jp": "三毛", "name": "Classic calico", "desc": "A well-rounded cat with a steady routine."},
    "night": {"jp": "夜更かし", "name": "Night owl", "desc": "Studies late with you. Has a little moon on her forehead."},
    "scrappy": {"jp": "やんちゃ", "name": "Scrappy", "desc": "Has helped you through a lot of leeches. Bent ear, big heart."},
    "chubby": {"jp": "ぽっちゃり", "name": "Well fed", "desc": "Big review days mean lots of scraps. Very round."},
}

# Per-hour drift while you're away, and the floor each need stops at.
DECAY = {"tummy": (3.0, 15), "love": (2.5, 25), "energy": (4.0, 20)}

GIFTS: List[Dict[str, str]] = [
    {"id": "momiji", "jp": "紅葉", "name": "Maple leaf", "desc": "Bright red, carried in very carefully."},
    {"id": "donguri", "jp": "どんぐり", "name": "Acorn", "desc": "Rolled all the way from the garden."},
    {"id": "matsubokkuri", "jp": "松ぼっくり", "name": "Pinecone", "desc": "Slightly chewed."},
    {"id": "button", "jp": "ボタン", "name": "Button", "desc": "Nobody knows whose it is."},
    {"id": "ribbon", "jp": "リボン", "name": "Ribbon", "desc": "She looked very proud of this one."},
    {"id": "hane", "jp": "羽根", "name": "Feather", "desc": "The sparrow's. It's fine, it has others."},
    {"id": "biidama", "jp": "ビー玉", "name": "Marble", "desc": "A glass marble with a blue swirl."},
    {"id": "kaigara", "jp": "貝殻", "name": "Seashell", "desc": "How did she even find this?"},
    {"id": "hanabira", "jp": "花びら", "name": "Petal", "desc": "A sakura petal, a little squished."},
    {"id": "orizuru", "jp": "折り鶴", "name": "Paper crane", "desc": "Folded by a guest. Wished for good grades."},
    {"id": "kosen", "jp": "古銭", "name": "Old coin", "desc": "A real mon! Added to your purse."},
    {"id": "omikuji", "jp": "おみくじ", "name": "Fortune slip", "desc": "A temple fortune. Read it for today's luck."},
]
GIFTS_BY_ID = {g["id"]: g for g in GIFTS}

FORTUNES = [
    ("大吉", "Great blessing. Your cards will stick today."),
    ("中吉", "Middle blessing. Steady reviews bring good things."),
    ("小吉", "Small blessing. Five more cards, then tea."),
    ("吉", "Blessing. An old leech will finally fall."),
    ("末吉", "Future blessing. Today's effort pays off next week."),
]

GIFT_COOLDOWN = 2 * 3600


def defaults() -> Dict[str, Any]:
    now = int(time.time())
    return {
        "name": "Tama",
        "tummy": 60.0,
        "love": 60.0,
        "energy": 60.0,
        "updated": now,
        "last_seen": now,
        "study_days": 0,
        "last_study_day": "",
        "total_reviews": 0,
        "night_reviews": 0,
        "leeches": 0,
        "fish": 3,
        "gifts": {},
        "last_gift": 0,
        "last_brush": 0,
        "times_petted": 0,
    }


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


class Pet:
    def __init__(self, data: Dict[str, Any]) -> None:
        # `data` is the "pet" dict inside the kitchen save file.
        self.d = data
        self.love_floor: Optional[float] = None  # raised by the black cat companion

    # ------------------------------------------------------------- needs
    def tick(self) -> None:
        now = time.time()
        hours = max(0.0, (now - float(self.d.get("updated", now))) / 3600.0)
        if hours > 0:
            for key, (rate, floor) in DECAY.items():
                if key == "love" and self.love_floor:
                    floor = max(floor, self.love_floor)
                value = float(self.d.get(key, 60))
                if value > floor:
                    self.d[key] = max(floor, value - rate * hours)
        if self.love_floor and float(self.d.get("love", 60)) < self.love_floor:
            self.d["love"] = float(self.love_floor)
        self.d["updated"] = int(now)

    def _add(self, key: str, amount: float) -> None:
        self.d[key] = _clamp(float(self.d.get(key, 60)) + amount)

    # ------------------------------------------------------------ growth
    def stage(self) -> int:
        days = int(self.d.get("study_days", 0))
        idx = 0
        for i, s in enumerate(STAGES):
            if days >= s["days"]:
                idx = i
        return idx

    def trait(self) -> str:
        total = int(self.d.get("total_reviews", 0))
        days = max(1, int(self.d.get("study_days", 0)))
        if self.stage() == 0:
            return "classic"
        if total >= 150 and self.d.get("night_reviews", 0) / max(1, total) >= 0.35:
            return "night"
        if self.d.get("leeches", 0) >= 8:
            return "scrappy"
        if total / days >= 150:
            return "chubby"
        return "classic"

    # ------------------------------------------------------------ events
    def on_review(self, today: str, leech_success: bool) -> Optional[int]:
        """Returns the new stage index if she just grew up."""
        before = self.stage()
        self.tick()
        self._add("tummy", 0.6)
        self.d["total_reviews"] = int(self.d.get("total_reviews", 0)) + 1
        hour = datetime.now().hour
        if hour >= 22 or hour < 4:
            self.d["night_reviews"] = int(self.d.get("night_reviews", 0)) + 1
        if leech_success:
            self.d["leeches"] = int(self.d.get("leeches", 0)) + 1
        if self.d.get("last_study_day") != today:
            self.d["last_study_day"] = today
            self.d["study_days"] = int(self.d.get("study_days", 0)) + 1
        after = self.stage()
        return after if after > before else None

    def on_guest_served(self) -> None:
        # The chef sets aside a little fish for her with every guest.
        self.d["fish"] = min(20, int(self.d.get("fish", 0)) + 1)

    def on_focus_done(self) -> None:
        self.tick()
        self._add("energy", 35)

    def action(self, kind: str) -> Dict[str, Any]:
        self.tick()
        now = time.time()
        msg = ""
        ok = True
        if kind == "pet":
            self._add("love", 5)
            self.d["times_petted"] = int(self.d.get("times_petted", 0)) + 1
        elif kind == "brush":
            fresh = now - float(self.d.get("last_brush", 0)) > 300
            self._add("love", 10 if fresh else 2)
            self.d["last_brush"] = int(now)
            msg = "So fluffy!" if fresh else "She's already very tidy."
        elif kind == "feed":
            if int(self.d.get("fish", 0)) <= 0:
                ok, msg = False, "No fish left. Every guest you serve saves her one."
            elif float(self.d.get("tummy", 0)) >= 95:
                ok, msg = False, "She's full! Maybe later."
            else:
                self.d["fish"] = int(self.d["fish"]) - 1
                self._add("tummy", 18)
                self._add("love", 3)
        elif kind == "play":
            if float(self.d.get("energy", 0)) < 22:
                ok, msg = False, "She's too sleepy to play. A focus session will perk her up."
            else:
                self._add("energy", -8)
                self._add("love", 8)
        elif kind == "trick":
            if self.stage() < 1:
                ok, msg = False, "Kittens don't know tricks yet. She learns one at each stage."
            else:
                self._add("love", 4)
        else:
            ok, msg = False, "Unknown action."
        return {"ok": ok, "msg": msg}

    def rename(self, name: str) -> None:
        name = " ".join(str(name).split())[:16]
        if name:
            self.d["name"] = name

    def maybe_gift(self) -> Optional[Dict[str, Any]]:
        """Occasionally, a happy, fed cat brings you something."""
        self.tick()
        now = time.time()
        if now - float(self.d.get("last_gift", 0)) < GIFT_COOLDOWN:
            return None
        if float(self.d.get("love", 0)) < 55 or float(self.d.get("tummy", 0)) < 45:
            return None
        if random.random() > 0.6:
            self.d["last_gift"] = int(now - GIFT_COOLDOWN / 2)  # try again in an hour
            return None
        month = datetime.now().month
        pool = [g for g in GIFTS if not (g["id"] == "momiji" and month not in (9, 10, 11))
                and not (g["id"] == "hanabira" and month not in (3, 4, 5))]
        gift = dict(random.choice(pool))
        gifts = self.d.setdefault("gifts", {})
        gifts[gift["id"]] = int(gifts.get(gift["id"], 0)) + 1
        self.d["last_gift"] = int(now)
        if gift["id"] == "omikuji":
            jp, text = random.choice(FORTUNES)
            gift["fortune"] = {"jp": jp, "text": text}
        return gift

    def seen(self) -> int:
        """Mark that you visited; returns seconds since the previous visit."""
        now = int(time.time())
        away = now - int(self.d.get("last_seen", now))
        self.d["last_seen"] = now
        return max(0, away)

    # ---------------------------------------------------------- snapshot
    def snapshot(self) -> Dict[str, Any]:
        self.tick()
        st = self.stage()
        nxt = STAGES[st + 1]["days"] if st + 1 < len(STAGES) else None
        trait = self.trait()
        return {
            "name": self.d.get("name", "Tama"),
            "tummy": round(float(self.d.get("tummy", 60)), 1),
            "love": round(float(self.d.get("love", 60)), 1),
            "energy": round(float(self.d.get("energy", 60)), 1),
            "stage": st,
            "stageJp": STAGES[st]["jp"],
            "stageName": STAGES[st]["name"],
            "studyDays": int(self.d.get("study_days", 0)),
            "nextStageDays": nxt,
            "trait": trait,
            "traitInfo": TRAITS[trait],
            "fish": int(self.d.get("fish", 0)),
            "gifts": dict(self.d.get("gifts", {})),
            "timesPetted": int(self.d.get("times_petted", 0)),
        }
