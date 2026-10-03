"""Persistent kitchen state: mon (coins), decor, and the guest queue.

Stored per Anki profile in this add-on's own user_files folder, which Anki
keeps when the add-on is updated.
"""

from __future__ import annotations

import copy
import datetime
import json
import os
import random
import re
import time
from typing import Any, Dict, List, Optional

from aqt import mw
from aqt.qt import QTimer

from . import pet as petmod

# There's no cap on waiting guests: people can study in one big batch and
# catch up later. Guests last for the Anki day; at rollover anyone still
# waiting takes their food to go and leaves their tip, so nothing is lost.
MAX_LEECH_GUESTS_PER_DAY = 3

# Decor you can buy with mon. `level` is the Onigiri restaurant level needed.
CATALOG: List[Dict[str, Any]] = [
    {"id": "bonsai", "name": "Bonsai", "jp": "盆栽", "level": 0, "price": 15,
     "desc": "A patient little pine. Grows a new tuft every week you study."},
    {"id": "furin", "name": "Wind chime", "jp": "風鈴", "level": 2, "price": 25,
     "desc": "Glass fūrin by the window. Tap it, or let the breeze ring it."},
    {"id": "kakejiku", "name": "Hanging scroll", "jp": "掛け軸", "level": 4, "price": 35,
     "desc": "Calligraphy of 継続 (keizoku), meaning 'keep going'."},
    {"id": "maneki", "name": "Maneki-neko", "jp": "招き猫", "level": 6, "price": 50,
     "desc": "The beckoning cat. Every guest tips +1 mon."},
    {"id": "daruma", "name": "Daruma", "jp": "達磨", "level": 8, "price": 45,
     "desc": "Paints one eye after your first focus session today, both after four: a wish granted, +30 mon."},
    {"id": "kingyo", "name": "Goldfish bowl", "jp": "金魚鉢", "level": 10, "price": 60,
     "desc": "Two goldfish. Tap to feed them."},
    {"id": "sakura", "name": "Sakura branch", "jp": "桜の枝", "level": 12, "price": 70,
     "desc": "A blossoming branch by the door. Petals drift through the shop."},
    {"id": "radio", "name": "Radio", "jp": "ラジオ", "level": 15, "price": 80,
     "desc": "Plays a soft, endless koto melody while it's switched on."},
    {"id": "matsuri", "name": "Festival lanterns", "jp": "祭り提灯", "level": 18, "price": 90,
     "desc": "A second string of lanterns, festival style."},
    {"id": "tanuki", "name": "Tanuki statue", "jp": "信楽狸", "level": 20, "price": 120,
     "desc": "A Shigaraki tanuki for good fortune. Golden guests tip double."},
    # "puffle": only sold once you have a puffle (part of the puffle extras).
    {"id": "kamakura", "name": "Igloo lamp", "jp": "かまくら", "level": 0, "price": 40, "puffle": True,
     "desc": "A little kamakura snow hut for the counter, igloo style. A candle glows inside after dark."},
]
# The three starter pets are also sold as companions, so everyone can have
# all three. The one matching your starter isn't sold (you already have it).
PETS: List[Dict[str, Any]] = [
    {"id": "mike", "kind": "pet", "species": "cat", "name": "Calico cat", "jp": "三毛猫", "level": 0, "price": 1000,
     "desc": "A calico who loves a sunny spot and a nap.",
     "perk": "An extra treat is saved for your pet with every guest you serve."},
    {"id": "puffle", "kind": "pet", "species": "puffle", "name": "Puffle", "jp": "パフル", "level": 0, "price": 1000,
     "desc": "A round, fluffy puffle that bounces around the shop. Comes in the colour of your choice.",
     "perk": "Your pet's energy never drops below 40."},
    {"id": "buncho", "kind": "pet", "species": "bird", "name": "Java sparrow", "jp": "文鳥", "level": 0, "price": 1000,
     "desc": "A buncho with a big pink beak who flies about and sings. Comes in the colour of your choice.",
     "perk": "Your pet's tummy never drops below 40."},
]
PET_FOR_SPECIES = {p["species"]: p["id"] for p in PETS}

# Puffle colours. The first one is free (picked with the puffle); more cost
# PUFFLE_COLOR_PRICE each and can be swapped any time once owned.
PUFFLE_COLOR_PRICE = 250
PUFFLE_COLORS: List[Dict[str, Any]] = [
    {"id": "blue", "name": "Blue", "jp": "青", "hex": "#3d7fd6", "starter": True},
    {"id": "red", "name": "Red", "jp": "赤", "hex": "#d8403a", "starter": True},
    {"id": "pink", "name": "Pink", "jp": "桃", "hex": "#f28dbb", "starter": True},
    {"id": "black", "name": "Black", "jp": "黒", "hex": "#34343c", "starter": True},
    {"id": "green", "name": "Green", "jp": "緑", "hex": "#4fb04a", "starter": True},
    {"id": "purple", "name": "Purple", "jp": "紫", "hex": "#9a5bc8", "starter": True},
    {"id": "yellow", "name": "Yellow", "jp": "黄", "hex": "#f2cf3a", "starter": True},
    {"id": "white", "name": "White", "jp": "白", "hex": "#eef2f6", "starter": True},
    {"id": "orange", "name": "Orange", "jp": "橙", "hex": "#f08a2e", "starter": True},
    {"id": "brown", "name": "Brown", "jp": "茶", "hex": "#8a5a34", "starter": True},
    {"id": "gold", "name": "Gold", "jp": "金", "hex": "#e8c25a", "starter": False},
    {"id": "rainbow", "name": "Rainbow", "jp": "虹", "hex": "#e0508a", "starter": False},
]
PUFFLE_COLORS_BY_ID = {c["id"]: c for c in PUFFLE_COLORS}

# Java sparrow (文鳥) colours, after the real buncho varieties. Same deal as
# the puffle: the first is free, more cost PUFFLE_COLOR_PRICE each.
BIRD_COLORS: List[Dict[str, Any]] = [
    {"id": "grey", "name": "Grey", "jp": "並", "hex": "#8f949f", "starter": True},
    {"id": "white", "name": "White", "jp": "白", "hex": "#f4f1ea", "starter": True},
    {"id": "sakura", "name": "Sakura", "jp": "桜", "hex": "#7d828d", "starter": True},
    {"id": "cinnamon", "name": "Cinnamon", "jp": "シナモン", "hex": "#c9a58a", "starter": True},
    {"id": "silver", "name": "Silver", "jp": "シルバー", "hex": "#b8bfcc", "starter": False},
    {"id": "cream", "name": "Cream", "jp": "クリーム", "hex": "#eadcc4", "starter": False},
]
BIRD_COLORS_BY_ID = {c["id"]: c for c in BIRD_COLORS}

# kind -> (colours by id, owned key, current key, shop pet id, default, noun)
COLOR_KINDS = {
    "puffle": (PUFFLE_COLORS_BY_ID, "puffle_colors", "puffle_color", "puffle", "blue", "puffle"),
    "bird": (BIRD_COLORS_BY_ID, "bird_colors", "bird_color", "buncho", "grey", "Java sparrow"),
}
# Animal companions: big milestone purchases that live in the restaurant.
# A review earns about 0.35 mon on average (a ~3-mon guest per 10 reviews,
# plus golden/sour-plum guests), so prices are set so the rabbit takes about
# 4k reviews and the whole set (37,000 mon) takes about 3 months at 1,200
# reviews a day, and under a year at 300 a day.
# Each has a small perk (applied in tip_for / focus_completed / roll_day /
# pet love floor, and the golden guest per finished deck in main.py).
ANIMALS: List[Dict[str, Any]] = [
    {"id": "usagi", "kind": "animal", "name": "Rabbit", "jp": "兎", "level": 0, "price": 1500,
     "desc": "A fluffy white rabbit who hops about the tatami.",
     "perk": "+5 mon for every finished focus session (she pounds celebration mochi)."},
    {"id": "kuro", "kind": "animal", "name": "Black cat", "jp": "黒猫", "level": 3, "price": 2500,
     "desc": "Your pet's best friend. They nap together.",
     "perk": "Your pet's love never drops below 40."},
    {"id": "shiba", "kind": "animal", "name": "Shiba", "jp": "柴犬", "level": 5, "price": 4000,
     "desc": "A cheerful shiba inu who greets everyone at the door.",
     "perk": "+1 tip from every guest."},
    {"id": "kitsune", "kind": "animal", "name": "Fox", "jp": "狐", "level": 10, "price": 6000,
     "desc": "A clever kitsune with a snow-tipped tail.",
     "perk": "Sour-plum (leech) guests tip double."},
    {"id": "tanuki_friend", "kind": "animal", "name": "Tanuki", "jp": "狸", "level": 15, "price": 9000,
     "desc": "A round, mischievous tanuki who drums on its belly.",
     "perk": "End-of-day takeout tips are doubled."},
    {"id": "tsuru", "kind": "animal", "name": "Crane", "jp": "鶴", "level": 20, "price": 14000,
     "desc": "An elegant red-crowned crane, a symbol of luck and long life.",
     "perk": "Every deck you finish brings a golden guest."},
]
# The 達磨 daruma (decor) gets its second eye after this many focus sessions
# in a day, and grants the wish: a one-time bonus (about 2.5 golden guests' worth).
DARUMA_SESSIONS = 4
DARUMA_BONUS = 30

# Earned (not bought) by collecting Onigiri Daily Specials in its Specials Book.
REWARDS: List[Dict[str, Any]] = [
    {"id": "shinagaki", "kind": "reward", "name": "Specials board", "jp": "品書き", "level": 0, "price": 0,
     "need": {"total": 10}, "desc": "A wooden board by the door listing how many specials you've collected."},
    {"id": "kin_hachimaki", "kind": "reward", "name": "Golden headband", "jp": "金の鉢巻", "level": 0, "price": 0,
     "need": {"total": 25}, "desc": "The chef ties on a golden hachimaki."},
    {"id": "kin_gaku", "kind": "reward", "name": "Golden frame", "jp": "金の額", "level": 0, "price": 0,
     "need": {"epic": 1}, "desc": "Your first Epic special, framed in gold on the wall."},
    {"id": "densetsu_bocho", "kind": "reward", "name": "Legendary knife", "jp": "伝説の包丁", "level": 0, "price": 0,
     "need": {"legendary": 1}, "desc": "A gleaming knife on display, for your first Legendary special."},
]
REWARDS_BY_ID = {r["id"]: r for r in REWARDS}


def earned_rewards(book: List[Dict[str, Any]]) -> List[str]:
    total = len(book)
    count = {}
    for d in book:
        count[d.get("rarity")] = count.get(d.get("rarity"), 0) + 1
    out = []
    for r in REWARDS:
        need = r["need"]
        if all((total if k == "total" else count.get(k, 0)) >= v for k, v in need.items()):
            out.append(r["id"])
    return out


CATALOG += PETS + ANIMALS + REWARDS
CATALOG_BY_ID = {item["id"]: item for item in CATALOG}


def anki_today() -> str:
    try:
        cutoff = mw.col.sched.day_cutoff
        return datetime.date.fromtimestamp(cutoff - 86400).isoformat()
    except Exception:
        return datetime.date.today().isoformat()


def _defaults() -> Dict[str, Any]:
    return {
        "version": 1,
        "mon": 0,
        "owned": [],
        "hidden": [],
        "pending": {},  # deck name -> reviews not yet turned into a guest
        "guests": [],  # queue of guests waiting outside
        "takeout": {"count": 0, "mon": 0},  # overflow while the queue was full
        "served_total": 0,
        "served_by_deck": {},
        "onigiri_made": 0,
        "fish_fed": 0,
        "first_seen": anki_today(),
        "tutorial_done": False,
        "puffle_colors": [],  # owned puffle colours
        "puffle_color": "",
        "bird_colors": [],  # owned Java sparrow colours
        "bird_color": "",
        "today": {"date": "", "reviews": 0, "focus_done": 0, "leech_guests": 0},
        "pet": petmod.defaults(),
        # for the 統計 Stats window, recorded from this version on
        "log": {
            "since": anki_today(),
            "focus": [],  # [end time, seconds studied, cards, how]: f full, g card goal, x ended early, e endless
            "breaks": [],  # [end time, seconds, long 0/1, skipped 0/1]
            "idle": 0,
            "resets": 0,
            "mon_earned": 0,
            "mon_spent": 0,
            "mon_by": {},  # where mon came from: tips, takeout, daruma, rabbit, gifts, keepsakes
            "guests_by_kind": {},
            "days": {},  # date -> {guests, mon, spent}
        },
    }


class KitchenState:
    def __init__(self, addon_dir: str) -> None:
        self.addon_dir = addon_dir
        self.data: Dict[str, Any] = _defaults()
        self.path: Optional[str] = None
        self.pet = petmod.Pet(self.data["pet"])
        self._save_timer: Optional[QTimer] = None
        # Extra tip for what a guest orders (rarer Onigiri specials pay more);
        # set by main.py, used when guests are served in bulk or take out.
        self.menu_bonus: Optional[Any] = None

    # ------------------------------------------------------------------ io
    def load(self) -> None:
        try:
            profile = mw.pm.name or "default"
        except Exception:
            profile = "default"
        safe = re.sub(r"[^\w\-]+", "_", profile)
        folder = os.path.join(self.addon_dir, "user_files")
        os.makedirs(folder, exist_ok=True)
        self.path = os.path.join(folder, f"kitchen_{safe}.json")

        data = _defaults()
        try:
            with open(self.path, encoding="utf-8") as f:
                stored = json.load(f)
            if isinstance(stored, dict):
                if isinstance(stored.get("pet"), dict) and "species" not in stored["pet"]:
                    # Saves from before the starter choice already have Tama.
                    stored["pet"]["species"] = "cat"
                for key, value in stored.items():
                    if key in data and isinstance(data[key], dict) and isinstance(value, dict):
                        data[key].update(value)
                    else:
                        data[key] = value
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Onigiri Kitchen: could not read save file, starting fresh: {e}")
        self.data = data
        self.pet = petmod.Pet(self.data["pet"])
        self.apply_companion_perks()
        self.roll_day()

    def save(self) -> None:
        if not self.path:
            return
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=1)
            os.replace(tmp, self.path)
        except Exception as e:
            print(f"Onigiri Kitchen: could not save: {e}")

    def save_soon(self) -> None:
        """Debounced save so reviewing quickly doesn't write on every card."""
        if self._save_timer is None:
            self._save_timer = QTimer(mw)
            self._save_timer.setSingleShot(True)
            self._save_timer.timeout.connect(self.save)
        self._save_timer.start(1500)

    # --------------------------------------------------------------- daily
    def roll_day(self) -> None:
        today = anki_today()
        if self.data["today"].get("date") == today:
            return
        # Yesterday's guests go home with takeout, tips still count.
        leftover = self.data.get("guests") or []
        if leftover and self.data["today"].get("date"):
            tips = sum(self.tip_for(g) for g in leftover)
            if self.shown("tanuki_friend"):
                tips *= 2
            self.earn(tips, "takeout")
            self.data["takeout"]["count"] += len(leftover)
            self.data["takeout"]["mon"] += tips
        self.data["guests"] = []
        self.data["pending"] = {}
        self.data["today"] = {"date": today, "reviews": 0, "focus_done": 0, "leech_guests": 0, "by_deck": {}}
        self.save_soon()

    # -------------------------------------------------------------- guests
    def add_guest(self, guest: Dict[str, Any]) -> bool:
        """Queue a guest (no limit; they last until Anki's day rolls over)."""
        guests = self.data["guests"]
        guest.setdefault("ts", int(time.time()))
        if guest.get("kind") == "golden":
            guests.insert(0, guest)
        else:
            guests.append(guest)
        return True

    def add_review(self, deck: str, leech_success: bool, reviews_per_guest: int,
                   db_counts: Optional[Dict[str, int]] = None) -> bool:
        """A card was just answered. Anki's review log (`db_counts`, today's
        reviews per deck) is the source of truth for counting; this only adds
        what the log can't tell us (leech guests). Returns True if a guest arrived."""
        self.roll_day()
        self.pet_grew = None
        today = self.data["today"]
        new_guest = False
        if leech_success:
            self.pet.d["leeches"] = int(self.pet.d.get("leeches", 0)) + 1
            if today["leech_guests"] < MAX_LEECH_GUESTS_PER_DAY:
                today["leech_guests"] += 1
                self.add_guest({"deck": deck, "kind": "leech", "reviews": 1})
                new_guest = True
        if db_counts is not None:
            if self.sync_today(db_counts, reviews_per_guest) > 0:
                new_guest = True
        else:
            # Couldn't read the review log: count this one answer directly.
            self.pet_grew = self.pet.on_review(today["date"], False)
            today["reviews"] += 1
            by_deck = today.get("by_deck")
            if isinstance(by_deck, dict):
                by_deck[deck] = by_deck.get(deck, 0) + 1
            pending = self.data["pending"]
            pending[deck] = pending.get(deck, 0) + 1
            n = max(1, int(reviews_per_guest))
            if pending[deck] >= n:
                pending[deck] -= n
                self.add_guest({"deck": deck, "kind": "regular", "reviews": n})
                new_guest = True
        self.save_soon()
        return new_guest

    def claim_guest(self) -> Optional[Dict[str, Any]]:
        if not self.data["guests"]:
            return None
        guest = self.data["guests"].pop(0)
        self.save_soon()
        return guest

    def pop_takeout(self) -> Dict[str, int]:
        takeout = copy.deepcopy(self.data["takeout"])
        self.data["takeout"] = {"count": 0, "mon": 0}
        if takeout["count"]:
            self.save_soon()
        return takeout

    # ---------------------------------------------------------------- mon
    # ---------------------------------------------------------- stats log
    MAX_LOG = 20000

    def _log(self) -> Dict[str, Any]:
        log = self.data.setdefault("log", {})
        for key, empty in (("focus", []), ("breaks", []), ("mon_by", {}), ("guests_by_kind", {}), ("days", {})):
            if not isinstance(log.get(key), type(empty)):
                log[key] = empty
        log.setdefault("since", anki_today())
        return log

    def _log_day(self) -> Dict[str, Any]:
        return self._log()["days"].setdefault(anki_today(), {})

    def earn(self, amount: int, source: str) -> None:
        amount = int(amount)
        if amount <= 0:
            return
        self.data["mon"] += amount
        log = self._log()
        log["mon_earned"] = int(log.get("mon_earned", 0)) + amount
        log["mon_by"][source] = int(log["mon_by"].get(source, 0)) + amount
        day = self._log_day()
        day["mon"] = int(day.get("mon", 0)) + amount

    def spend(self, amount: int) -> None:
        self.data["mon"] -= amount
        log = self._log()
        log["mon_spent"] = int(log.get("mon_spent", 0)) + amount
        day = self._log_day()
        day["spent"] = int(day.get("spent", 0)) + amount

    def log_focus(self, seconds: float, cards: int, how: str) -> None:
        focus = self._log()["focus"]
        focus.append([int(time.time()), int(round(seconds)), int(cards), how])
        del focus[: max(0, len(focus) - self.MAX_LOG)]
        self.save_soon()

    def log_break(self, seconds: float, long: bool, skipped: bool) -> None:
        breaks = self._log()["breaks"]
        breaks.append([int(time.time()), int(round(seconds)), int(bool(long)), int(bool(skipped))])
        del breaks[: max(0, len(breaks) - self.MAX_LOG)]
        self.save_soon()

    def log_count(self, key: str) -> None:
        log = self._log()
        log[key] = int(log.get(key, 0)) + 1
        self.save_soon()

    def pay(self, amount: int, deck: Optional[str], kind: Optional[str] = None) -> None:
        amount = max(0, min(int(amount), 100))
        self.earn(amount, "tips")
        kind = kind if kind in ("regular", "golden", "leech") else "regular"
        by_kind = self._log()["guests_by_kind"]
        by_kind[kind] = int(by_kind.get(kind, 0)) + 1
        day = self._log_day()
        day["guests"] = int(day.get("guests", 0)) + 1
        self.data["served_total"] += 1
        self.pet.on_guest_served()
        if self.shown("mike"):
            self.pet.on_guest_served()  # 三毛猫 perk: an extra treat
        if deck:
            by_deck = self.data["served_by_deck"]
            by_deck[deck] = by_deck.get(deck, 0) + 1
        self.save_soon()

    def buy(self, item_id: str, onigiri_level: int) -> Dict[str, Any]:
        item = CATALOG_BY_ID.get(item_id)
        if not item:
            return {"ok": False, "msg": "That item doesn't exist."}
        if item.get("kind") == "reward":
            return {"ok": False, "msg": "Earned by collecting specials in Onigiri, not bought."}
        if item_id in self.data["owned"]:
            return {"ok": False, "msg": "Already in your restaurant."}
        if item.get("puffle") and not self.has_puffle():
            return {"ok": False, "msg": "Adopt a puffle first!"}
        if item.get("kind") == "pet" and item.get("species") == self.pet.species:
            return {"ok": False, "msg": "That's your starter pet: already in your restaurant."}
        if onigiri_level < item["level"]:
            return {"ok": False, "msg": f"Reach restaurant level {item['level']} to unlock."}
        if self.data["mon"] < item["price"]:
            return {"ok": False, "msg": "Not enough mon yet. Keep serving guests!"}
        self.spend(item["price"])
        self.data["owned"].append(item_id)
        self.apply_companion_perks()
        self.save()
        return {"ok": True, "msg": f"{item['jp']} {item['name']} added!"}

    def toggle(self, item_id: str) -> None:
        hidden = self.data["hidden"]
        if item_id in hidden:
            hidden.remove(item_id)
        elif item_id in self.data["owned"]:
            hidden.append(item_id)
        self.apply_companion_perks()
        self.save_soon()

    def sync_today(self, db_counts: Dict[str, int], reviews_per_guest: int) -> int:
        """Match today's reviews and guests to Anki's review log, which is the
        source of truth: it includes reviews from other devices (once synced)
        and drops reviews you undid. Returns the change in waiting guests."""
        self.roll_day()
        today = self.data["today"]
        if not isinstance(today.get("by_deck"), dict):
            # Save from an older version: start tracking from here without
            # double-counting the reviews it already saw today.
            today["by_deck"] = {d: int(c) for d, c in db_counts.items()}
            today["reviews"] = sum(today["by_deck"].values())
            self.save_soon()
            return 0
        by_deck = today["by_deck"]
        n = max(1, int(reviews_per_guest))
        before = len(self.data["guests"])
        pending = self.data["pending"]
        changed = False
        for deck in set(db_counts) | set(by_deck):
            count = int(db_counts.get(deck, 0))
            diff = count - int(by_deck.get(deck, 0))
            if diff == 0:
                continue
            changed = True
            if count:
                by_deck[deck] = count
            else:
                by_deck.pop(deck, None)
            pending[deck] = pending.get(deck, 0) + diff
            if diff > 0:
                for _ in range(diff):
                    grew = self.pet.on_review(today["date"], False)
                    if grew is not None:
                        self.pet_grew = grew
                while pending[deck] >= n:
                    pending[deck] -= n
                    self.add_guest({"deck": deck, "kind": "regular", "reviews": n})
            else:
                # Reviews were undone: if that un-earns a guest who hasn't been
                # seated yet, they leave the queue. Nothing else is taken away.
                while pending[deck] < 0:
                    idx = next((i for i in range(len(self.data["guests"]) - 1, -1, -1)
                                if self.data["guests"][i].get("deck") == deck
                                and self.data["guests"][i].get("kind") == "regular"), None)
                    if idx is None:
                        pending[deck] = 0
                        break
                    self.data["guests"].pop(idx)
                    pending[deck] += n
            if pending.get(deck) == 0:
                pending.pop(deck, None)
        total = sum(int(c) for c in db_counts.values())
        if today.get("reviews") != total:
            today["reviews"] = total
            changed = True
        if changed:
            self.save_soon()
        return len(self.data["guests"]) - before

    # --------------------------------------------------------- catch-up
    def shown(self, item_id: str) -> bool:
        return item_id in self.data["owned"] and item_id not in self.data["hidden"]

    def tip_for(self, guest: Dict[str, Any]) -> int:
        """Same tip rules as the animated service in kitchen.js (tipFor).

        Tips vary a little (averages: regular ~3, sour plum 6.5, golden 12.5),
        with a rare generous regular who leaves 8."""
        kind = guest.get("kind")
        if kind == "golden":
            amount = random.randint(10, 15)
        elif kind == "leech":
            amount = random.randint(5, 8)
        else:
            amount = random.choices([2, 3, 4, 8], weights=[35, 45, 15, 5])[0]
        if kind == "golden" and self.shown("tanuki"):
            amount *= 2
        if kind == "leech" and self.shown("kitsune"):
            amount *= 2
        if self.shown("maneki"):
            amount += 1
        if self.shown("shiba"):
            amount += 1
        if self.pet.happy():
            amount += 1  # happy-cat bonus: Tama beckons guests in
        if self.menu_bonus:
            try:
                amount += int(self.menu_bonus(guest))
            except Exception:
                pass
        return amount

    def apply_companion_perks(self) -> None:
        """Perks that live outside tips (kept in sync whenever ownership changes)."""
        floors = {}
        if self.shown("kuro"):
            floors["love"] = 40
        if self.shown("puffle"):
            floors["energy"] = 40
        if self.shown("buncho"):
            floors["tummy"] = 40
        self.pet.floors = floors

    def serve_all(self) -> Dict[str, Any]:
        """Serve every waiting guest at once (after a big study session)."""
        guests = self.data["guests"]
        self.data["guests"] = []
        total = 0
        kinds: Dict[str, int] = {}
        decks: Dict[str, int] = {}
        for g in guests:
            tip = self.tip_for(g)
            total += tip
            kinds[g.get("kind", "regular")] = kinds.get(g.get("kind", "regular"), 0) + 1
            if g.get("deck"):
                decks[g["deck"]] = decks.get(g["deck"], 0) + 1
            self.pay(tip, g.get("deck"), g.get("kind"))
        self.save()
        return {"count": len(guests), "mon": total, "kinds": kinds, "decks": decks}

    def set_tutorial_done(self, done: bool = True) -> None:
        self.data["tutorial_done"] = bool(done)
        self.save_soon()

    def bump(self, key: str) -> None:
        if key in ("onigiri_made", "fish_fed"):
            self.data[key] = int(self.data.get(key, 0)) + 1
            self.save_soon()

    def focus_completed(self) -> int:
        """A focus session was finished. Returns the 達磨 daruma bonus paid
        (once a day, when the second eye is painted), or 0."""
        self.roll_day()
        self.data["today"]["focus_done"] += 1
        self.pet.on_focus_done()
        if self.shown("usagi"):
            self.earn(5, "rabbit")
        self.add_guest({"deck": None, "kind": "golden", "reviews": 0})
        bonus = 0
        if self.shown("daruma") and self.data["today"]["focus_done"] == DARUMA_SESSIONS:
            bonus = DARUMA_BONUS
            self.earn(bonus, "daruma")
        self.save_soon()
        return bonus

    # ---------------------------------------------------------------- pet
    def pet_action(self, kind: str) -> Dict[str, Any]:
        result = self.pet.action(kind)
        self.save_soon()
        result["pet"] = self.pet.snapshot()
        return result

    def pet_gift(self) -> Optional[Dict[str, Any]]:
        gift = self.pet.maybe_gift()
        if gift:
            if gift["id"] == "kosen":
                self.earn(5, "gifts")
            if gift["id"] == "koban":
                self.earn(25, "gifts")
            if gift.get("setBonus"):
                # all 12 keepsakes: one-time mon + the treasure shelf
                self.earn(int(gift["setBonus"]), "keepsakes")
                if "takaramono" not in self.data["owned"]:
                    self.data["owned"].append("takaramono")
            self.save_soon()
        return gift

    # ------------------------------------------- starter & pet colours
    def choose_starter(self, species: str, color: str = "") -> bool:
        if not self.pet.choose(species):
            return False
        if species in COLOR_KINDS:
            by_id, *_rest = COLOR_KINDS[species]
            c = by_id.get(color)
            self.grant_first_color(species, color if c and c["starter"] else COLOR_KINDS[species][4])
        self.save()
        return True

    def has_kind(self, kind: str) -> bool:
        """You have a puffle / Java sparrow (as your starter or from the shop)."""
        return self.pet.species == kind or COLOR_KINDS[kind][3] in self.data["owned"]

    def has_puffle(self) -> bool:
        return self.has_kind("puffle")

    def grant_first_color(self, kind: str, color: str) -> bool:
        """The first colour comes free with the pet (starter colours only)."""
        by_id, owned_key, current_key, *_rest = COLOR_KINDS[kind]
        c = by_id.get(color)
        if not c or not c["starter"] or self.data.get(owned_key) or not self.has_kind(kind):
            return False
        self.data[owned_key] = [color]
        self.data[current_key] = color
        return True

    def pet_color(self, kind: str, color: str) -> Dict[str, Any]:
        """Wear an owned colour, take the free first one, or buy a new one."""
        if kind not in COLOR_KINDS:
            return {"ok": False, "msg": "That pet doesn't come in colours."}
        by_id, owned_key, current_key, _pid, _default, noun = COLOR_KINDS[kind]
        c = by_id.get(color)
        if not c:
            return {"ok": False, "msg": "That colour doesn't exist."}
        if not self.has_kind(kind):
            return {"ok": False, "msg": f"Get a {noun} first!"}
        owned = self.data.setdefault(owned_key, [])
        if color in owned:
            self.data[current_key] = color
            self.save_soon()
            return {"ok": True, "msg": f"{c['jp']} {c['name']} {noun}!"}
        if self.grant_first_color(kind, color):
            self.save()
            return {"ok": True, "msg": f"{c['jp']} {c['name']} {noun}!"}
        if self.data["mon"] < PUFFLE_COLOR_PRICE:
            return {"ok": False, "msg": "Not enough mon yet. Keep serving guests!"}
        self.spend(PUFFLE_COLOR_PRICE)
        owned.append(color)
        self.data[current_key] = color
        self.save()
        return {"ok": True, "msg": f"{c['jp']} {c['name']} unlocked!"}

    def swap_pet(self, species: str) -> Dict[str, Any]:
        """Make another pet you own your main one (the one with the care card).
        The old one moves to the shop-pet spot, so you still have both. Care,
        growth, keepsakes and the bed carry over; each pet keeps its own name."""
        cur = self.pet.d.get("species")
        new_id = PET_FOR_SPECIES.get(species)
        if not cur or not new_id or species == cur:
            return {"ok": False, "msg": "That's already your pet."}
        owned = self.data["owned"]
        if new_id not in owned:
            return {"ok": False, "msg": "Adopt that pet from the shop first."}
        names = self.data.setdefault("pet_names", {})
        names[cur] = self.pet.d.get("name") or petmod.species_info(cur)["defaultName"]
        owned.remove(new_id)
        if new_id in self.data["hidden"]:
            self.data["hidden"].remove(new_id)
        if PET_FOR_SPECIES[cur] not in owned:
            owned.append(PET_FOR_SPECIES[cur])
        self.pet.d["species"] = species
        self.pet.d["name"] = names.get(species) or petmod.species_info(species)["defaultName"]
        for kind in COLOR_KINDS:
            # a pet that came from the shop starts with its free first colour
            if self.has_kind(kind) and not self.data.get(COLOR_KINDS[kind][1]):
                self.grant_first_color(kind, COLOR_KINDS[kind][4])
        self.apply_companion_perks()
        self.save()
        return {"ok": True, "msg": f"{self.pet.d['name']} is your pet now."}

    def puffle_color(self, color: str) -> Dict[str, Any]:
        return self.pet_color("puffle", color)

    def pet_style(self, key: str, value: Any) -> Dict[str, Any]:
        self.pet.set_style(key, value)
        self.save_soon()
        return self.pet.snapshot()

    def pet_rename(self, name: str) -> Dict[str, Any]:
        self.pet.rename(name)
        self.save_soon()
        return self.pet.snapshot()

    def snapshot(self) -> Dict[str, Any]:
        d = self.data
        return {
            "mon": d["mon"],
            "owned": list(d["owned"]),
            "hidden": list(d["hidden"]),
            "guestsWaiting": len(d["guests"]),
            "servedTotal": d["served_total"],
            "onigiriMade": d.get("onigiri_made", 0),
            "today": dict(d["today"]),
            "firstSeen": d.get("first_seen"),
            "tutorialDone": bool(d.get("tutorial_done", False)),
            "puffleColor": d.get("puffle_color") or "",
            "puffleColors": list(d.get("puffle_colors") or []),
            "birdColor": d.get("bird_color") or "",
            "birdColors": list(d.get("bird_colors") or []),
            "petNames": dict(d.get("pet_names") or {}),
        }
