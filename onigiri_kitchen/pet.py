"""Your shop pet (Tama the cat, a puffle or a Java sparrow): a gentle virtual pet.

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
STAGE_DAYS = [0, 3, 10, 25]

# The starter pet is chosen once, like a starter Pokémon. Needs, gifts and
# milestones work the same for every species; only the look and words change.
SPECIES: Dict[str, Dict[str, Any]] = {
    "cat": {
        "jp": "猫", "name": "Cat", "defaultName": "Tama",
        "they": "she", "them": "her", "their": "her",
        "food": "fish", "foods": "fish", "foodJp": "魚", "toy": "Feather toy", "idle": "Purring",
        "tricks": ["Paw wave", "Beckon", "Roll over"],
        "desc": "A calico shop cat who naps in the sun and beckons guests in.",
        "stages": [("子猫", "Kitten"), ("若猫", "Young cat"), ("看板猫", "Shop cat"), ("招き猫", "Maneki master")],
        "traits": {
            "classic": ("三毛", "Classic calico", "A well-rounded cat with a steady routine."),
            "night": ("夜更かし", "Night owl", "Studies late with you. Has a little moon on her forehead."),
            "scrappy": ("やんちゃ", "Scrappy", "Has helped you through a lot of leeches. Bent ear, big heart."),
            "chubby": ("ぽっちゃり", "Well fed", "Big review days mean lots of scraps. Very round."),
        },
    },
    "puffle": {
        "jp": "パフル", "name": "Puffle", "defaultName": "Puff",
        "they": "it", "them": "it", "their": "its",
        "food": "puffle O", "foods": "puffle O's", "foodJp": "O", "toy": "Bouncy ball", "idle": "Humming",
        "tricks": ["Bounce", "Spin", "Backflip"],
        "desc": "A round, fluffy puffle that bounces everywhere. Pick its colour!",
        "stages": [("ちびパフル", "Baby puffle"), ("パフル", "Puffle"), ("看板パフル", "Shop puffle"), ("伝説パフル", "Legendary puffle")],
        "traits": {
            "classic": ("元気", "Bouncy", "Happiest when it's bouncing off the walls."),
            "night": ("夜更かし", "Night owl", "Studies late with you. Has a little moon in its fluff."),
            "scrappy": ("やんちゃ", "Scrappy", "Has helped you through a lot of leeches. Extra-wild tuft."),
            "chubby": ("ぽっちゃり", "Well fed", "Big review days mean lots of puffle O's. Very round."),
        },
    },
    "bird": {
        "jp": "文鳥", "name": "Java sparrow", "defaultName": "Piyo",
        "they": "it", "them": "it", "their": "its",
        "food": "millet spray", "foods": "millet sprays", "foodJp": "粟", "toy": "Bell toy", "idle": "Chirping",
        "tricks": ["Wing wave", "Song", "Loop"],
        "desc": "A buncho with a big pink beak who flies about the restaurant and sings. Pick its colour!",
        "stages": [("雛", "Chick"), ("若鳥", "Fledgling"), ("看板鳥", "Shop bird"), ("福鳥", "Lucky bird")],
        "traits": {
            "classic": ("桜文鳥", "Classic grey", "A tidy little bird with a steady routine."),
            "night": ("夜更かし", "Night owl", "Studies late with you. Has a little moon on its cap."),
            "scrappy": ("やんちゃ", "Scrappy", "Has helped you through a lot of leeches. A ruffled crest."),
            "chubby": ("ぽっちゃり", "Well fed", "Big review days mean lots of millet. Very round."),
        },
    },
}


def species_info(species: Optional[str]) -> Dict[str, Any]:
    return SPECIES.get(species or "cat", SPECIES["cat"])


def stages_for(species: Optional[str]) -> List[Dict[str, Any]]:
    return [{"days": d, "jp": jp, "name": name} for d, (jp, name) in zip(STAGE_DAYS, species_info(species)["stages"])]


def species_payload() -> Dict[str, Any]:
    """Everything the page needs to word and draw each species."""
    out = {}
    for sid, sp in SPECIES.items():
        out[sid] = {k: v for k, v in sp.items() if k not in ("stages", "traits")}
        out[sid]["stages"] = stages_for(sid)
        out[sid]["traits"] = {k: {"jp": jp, "name": n, "desc": d} for k, (jp, n, d) in sp["traits"].items()}
    return out


STAGES = stages_for("cat")  # kept for older callers
TRAITS = {k: {"jp": jp, "name": n, "desc": d} for k, (jp, n, d) in SPECIES["cat"]["traits"].items()}

# Per-hour drift while you're away, and the floor each need stops at.
DECAY = {"tummy": (3.0, 15), "love": (2.5, 25), "energy": (4.0, 20)}

GIFTS: List[Dict[str, str]] = [
    {"id": "momiji", "jp": "紅葉", "name": "Maple leaf", "desc": "Bright red, carried in very carefully."},
    {"id": "donguri", "jp": "どんぐり", "name": "Acorn", "desc": "Rolled all the way from the garden."},
    {"id": "matsubokkuri", "jp": "松ぼっくり", "name": "Pinecone", "desc": "Slightly chewed."},
    {"id": "button", "jp": "ボタン", "name": "Button", "desc": "Nobody knows whose it is."},
    {"id": "ribbon", "jp": "リボン", "name": "Ribbon", "desc": "Brought in looking very proud."},
    {"id": "hane", "jp": "羽根", "name": "Feather", "desc": "The sparrow's. It's fine, it has others."},
    {"id": "biidama", "jp": "ビー玉", "name": "Marble", "desc": "A glass marble with a blue swirl."},
    {"id": "kaigara", "jp": "貝殻", "name": "Seashell", "desc": "Where did this even come from?"},
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

# Rare golden keepsakes: only possible when Tama is very happy (love 90+).
# A bonus on top of the 12 regular ones (not needed for the set bonus).
RARE_GIFTS: List[Dict[str, str]] = [
    {"id": "omamori", "jp": "招き猫お守り", "name": "Lucky cat charm", "desc": "A golden maneki-neko charm. Rare!", "rare": "1"},
    {"id": "koban", "jp": "小判", "name": "Gold koban", "desc": "An old gold coin. Worth 25 mon!", "rare": "1"},
    {"id": "kanzashi", "jp": "簪", "name": "Kanzashi", "desc": "A delicate hairpin with a tiny sakura. Rare!", "rare": "1"},
]
RARE_CHANCE = 0.2
SET_BONUS_MON = 500

# Care milestones unlock accessories. Petting counts at most PETS_PER_DAY
# times a day toward these (so they reward daily care, not clicking).
PETS_PER_DAY = 20
MILESTONES = {
    "collar": ("pets", 50),
    "bandana": ("pets", 200),
    "bell": ("pets", 500),
    "fancy_bed": ("fish", 25),
    "kotatsu": ("fish", 100),
}
COLLAR_COLORS = ["red", "indigo", "matcha", "sakura"]
HAPPY_AT = 70


def defaults() -> Dict[str, Any]:
    now = int(time.time())
    return {
        "species": None,  # chosen on first visit; older saves become "cat"
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
        "pet_points": 0,  # pets counted toward milestones (max PETS_PER_DAY a day)
        "pets_today": {"date": "", "count": 0},
        "fish_fed": 0,
        "set_bonus": False,
        "style": {"collar": "red", "bandana": False, "bell": False, "bed": "zabuton"},
    }


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


class Pet:
    def __init__(self, data: Dict[str, Any]) -> None:
        # `data` is the "pet" dict inside the kitchen save file.
        self.d = data
        # Need floors raised by companions (black cat, puffle, Java sparrow).
        self.floors: Dict[str, float] = {}

    # ------------------------------------------------------------- needs
    def tick(self) -> None:
        now = time.time()
        hours = max(0.0, (now - float(self.d.get("updated", now))) / 3600.0)
        if hours > 0:
            for key, (rate, floor) in DECAY.items():
                floor = max(floor, self.floors.get(key, 0))
                value = float(self.d.get(key, 60))
                if value > floor:
                    self.d[key] = max(floor, value - rate * hours)
        for key, floor in self.floors.items():
            if float(self.d.get(key, 60)) < floor:
                self.d[key] = float(floor)
        self.d["updated"] = int(now)

    def _add(self, key: str, amount: float) -> None:
        self.d[key] = _clamp(float(self.d.get(key, 60)) + amount)

    # ----------------------------------------------------------- species
    @property
    def species(self) -> str:
        return self.d.get("species") or "cat"

    def info(self) -> Dict[str, Any]:
        return species_info(self.species)

    def stages(self) -> List[Dict[str, Any]]:
        return stages_for(self.species)

    def choose(self, species: str) -> bool:
        """Pick the starter pet (only once)."""
        if self.d.get("species") or species not in SPECIES:
            return False
        self.d["species"] = species
        if self.d.get("name", "Tama") == "Tama":
            self.d["name"] = SPECIES[species]["defaultName"]
        return True

    # ------------------------------------------------------------ growth
    def stage(self) -> int:
        days = int(self.d.get("study_days", 0))
        idx = 0
        for i, need in enumerate(STAGE_DAYS):
            if days >= need:
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
        # The chef sets aside a little treat (fish, puffle O, millet) with every guest.
        self.d["fish"] = min(20, int(self.d.get("fish", 0)) + 1)

    def on_focus_done(self) -> None:
        self.tick()
        self._add("energy", 35)

    def action(self, kind: str) -> Dict[str, Any]:
        self.tick()
        now = time.time()
        msg = ""
        ok = True
        sp = self.info()
        they = sp["they"].capitalize()
        if kind == "pet":
            self._add("love", 5)
            self.d["times_petted"] = int(self.d.get("times_petted", 0)) + 1
            today = datetime.now().strftime("%Y-%m-%d")
            pt = self.d.setdefault("pets_today", {"date": "", "count": 0})
            if pt.get("date") != today:
                pt.update(date=today, count=0)
            if pt["count"] < PETS_PER_DAY:
                pt["count"] += 1
                self.d["pet_points"] = int(self.d.get("pet_points", 0)) + 1
        elif kind == "brush":
            fresh = now - float(self.d.get("last_brush", 0)) > 300
            self._add("love", 10 if fresh else 2)
            self.d["last_brush"] = int(now)
            msg = "So fluffy!" if fresh else f"{they}'s already very tidy."
        elif kind == "feed":
            if int(self.d.get("fish", 0)) <= 0:
                ok, msg = False, f"No {sp['foods']} left. Every guest you serve saves {sp['them']} one."
            elif float(self.d.get("tummy", 0)) >= 95:
                ok, msg = False, f"{they}'s full! Maybe later."
            else:
                self.d["fish"] = int(self.d["fish"]) - 1
                self.d["fish_fed"] = int(self.d.get("fish_fed", 0)) + 1
                self._add("tummy", 18)
                self._add("love", 3)
        elif kind == "play":
            if float(self.d.get("energy", 0)) < 22:
                ok, msg = False, f"{they}'s too sleepy to play. A focus session will perk {sp['them']} up."
            else:
                self._add("energy", -8)
                self._add("love", 8)
        elif kind == "trick":
            if self.stage() < 1:
                ok, msg = False, f"{self.stages()[0]['name']}s don't know tricks yet. {they} learns one at each stage."
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
        """Occasionally, a happy, fed pet brings you something."""
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
        if float(self.d.get("love", 0)) >= 90 and random.random() < RARE_CHANCE:
            gift = dict(random.choice(RARE_GIFTS))
        else:
            gift = dict(random.choice(pool))
        gifts = self.d.setdefault("gifts", {})
        gifts[gift["id"]] = int(gifts.get(gift["id"], 0)) + 1
        self.d["last_gift"] = int(now)
        if gift["id"] == "omikuji":
            jp, text = random.choice(FORTUNES)
            gift["fortune"] = {"jp": jp, "text": text}
        if self.check_set_bonus():
            gift["setBonus"] = SET_BONUS_MON
        return gift

    # ------------------------------------------------------------ rewards
    def happy(self) -> bool:
        """Happy-pet bonus: all three needs at HAPPY_AT or more."""
        return all(float(self.d.get(k, 0)) >= HAPPY_AT for k in ("tummy", "love", "energy"))

    def check_set_bonus(self) -> bool:
        """True the first time all 12 regular keepsakes have been found."""
        if self.d.get("set_bonus"):
            return False
        gifts = self.d.get("gifts", {})
        if all(gifts.get(g["id"]) for g in GIFTS):
            self.d["set_bonus"] = True
            return True
        return False

    def unlocks(self) -> Dict[str, bool]:
        have = {"pets": int(self.d.get("pet_points", 0)), "fish": int(self.d.get("fish_fed", 0))}
        return {key: have[kind] >= need for key, (kind, need) in MILESTONES.items()}

    def set_style(self, key: str, value: Any) -> Dict[str, Any]:
        un = self.unlocks()
        style = self.d.setdefault("style", {"collar": "red", "bandana": False, "bell": False, "bed": "zabuton"})
        if key == "collar" and un["collar"] and value in COLLAR_COLORS:
            style["collar"] = value
        elif key == "bandana" and un["bandana"]:
            style["bandana"] = bool(value)
        elif key == "bell" and un["bell"]:
            style["bell"] = bool(value)
        elif key == "bed" and value in ("zabuton", "fancy", "kotatsu"):
            if value == "zabuton" or (value == "fancy" and un["fancy_bed"]) or (value == "kotatsu" and un["kotatsu"]):
                style["bed"] = value
        return dict(style)

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
        stages = self.stages()
        nxt = stages[st + 1]["days"] if st + 1 < len(stages) else None
        trait = self.trait()
        tjp, tname, tdesc = self.info()["traits"][trait]
        return {
            "species": self.d.get("species"),
            "name": self.d.get("name", "Tama"),
            "tummy": round(float(self.d.get("tummy", 60)), 1),
            "love": round(float(self.d.get("love", 60)), 1),
            "energy": round(float(self.d.get("energy", 60)), 1),
            "stage": st,
            "stageJp": stages[st]["jp"],
            "stageName": stages[st]["name"],
            "studyDays": int(self.d.get("study_days", 0)),
            "nextStageDays": nxt,
            "trait": trait,
            "traitInfo": {"jp": tjp, "name": tname, "desc": tdesc},
            "fish": int(self.d.get("fish", 0)),
            "gifts": dict(self.d.get("gifts", {})),
            "timesPetted": int(self.d.get("times_petted", 0)),
            "happy": self.happy(),
            "petPoints": int(self.d.get("pet_points", 0)),
            "petsToday": int((self.d.get("pets_today") or {}).get("count", 0))
            if (self.d.get("pets_today") or {}).get("date") == datetime.now().strftime("%Y-%m-%d") else 0,
            "fishFed": int(self.d.get("fish_fed", 0)),
            "unlocks": self.unlocks(),
            "style": dict(self.d.get("style") or {}),
            "setBonus": bool(self.d.get("set_bonus")),
        }
