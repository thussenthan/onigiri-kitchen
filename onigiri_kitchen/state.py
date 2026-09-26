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
     "desc": "Paints one eye after your first focus session today, both after four."},
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
]
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
     "desc": "Tama's best friend. They nap together.",
     "perk": "Tama's love never drops below 40."},
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
CATALOG += ANIMALS
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
        "today": {"date": "", "reviews": 0, "focus_done": 0, "leech_guests": 0},
        "pet": petmod.defaults(),
    }


class KitchenState:
    def __init__(self, addon_dir: str) -> None:
        self.addon_dir = addon_dir
        self.data: Dict[str, Any] = _defaults()
        self.path: Optional[str] = None
        self.pet = petmod.Pet(self.data["pet"])
        self._save_timer: Optional[QTimer] = None

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
            self.data["mon"] += tips
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

    def add_review(self, deck: str, leech_success: bool, reviews_per_guest: int) -> bool:
        """Count one review. Returns True if it brought a new guest."""
        self.roll_day()
        self.pet_grew = self.pet.on_review(self.data["today"]["date"], leech_success)
        today = self.data["today"]
        today["reviews"] += 1
        by_deck = today.get("by_deck")
        if isinstance(by_deck, dict):
            by_deck[deck] = by_deck.get(deck, 0) + 1
        pending = self.data["pending"]
        pending[deck] = pending.get(deck, 0) + 1
        new_guest = False

        if leech_success and today["leech_guests"] < MAX_LEECH_GUESTS_PER_DAY:
            today["leech_guests"] += 1
            self.add_guest({"deck": deck, "kind": "leech", "reviews": 1})
            new_guest = True

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
    def pay(self, amount: int, deck: Optional[str]) -> None:
        amount = max(0, min(int(amount), 100))
        self.data["mon"] += amount
        self.data["served_total"] += 1
        self.pet.on_guest_served()
        if deck:
            by_deck = self.data["served_by_deck"]
            by_deck[deck] = by_deck.get(deck, 0) + 1
        self.save_soon()

    def buy(self, item_id: str, onigiri_level: int) -> Dict[str, Any]:
        item = CATALOG_BY_ID.get(item_id)
        if not item:
            return {"ok": False, "msg": "That item doesn't exist."}
        if item_id in self.data["owned"]:
            return {"ok": False, "msg": "Already in your restaurant."}
        if onigiri_level < item["level"]:
            return {"ok": False, "msg": f"Reach restaurant level {item['level']} to unlock."}
        if self.data["mon"] < item["price"]:
            return {"ok": False, "msg": "Not enough mon yet. Keep serving guests!"}
        self.data["mon"] -= item["price"]
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
        """Match today's guests to Anki's review log (catches reviews done on
        other devices, or before the add-on was installed). Returns new guests."""
        self.roll_day()
        today = self.data["today"]
        if not isinstance(today.get("by_deck"), dict):
            # Save from an older version: start tracking from here without
            # double-counting the reviews it already saw today.
            today["by_deck"] = dict(db_counts)
            self.save_soon()
            return 0
        by_deck = today["by_deck"]
        n = max(1, int(reviews_per_guest))
        before = len(self.data["guests"])
        for deck, count in db_counts.items():
            missing = int(count) - int(by_deck.get(deck, 0))
            if missing <= 0:
                continue
            by_deck[deck] = int(count)
            today["reviews"] += missing
            for _ in range(missing):
                self.pet.on_review(today["date"], False)
            pending = self.data["pending"]
            pending[deck] = pending.get(deck, 0) + missing
            while pending[deck] >= n:
                pending[deck] -= n
                self.add_guest({"deck": deck, "kind": "regular", "reviews": n})
        added = len(self.data["guests"]) - before
        if added:
            self.save_soon()
        return added

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
        return amount

    def apply_companion_perks(self) -> None:
        """Perks that live outside tips (kept in sync whenever ownership changes)."""
        self.pet.love_floor = 40 if self.shown("kuro") else None

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
            self.pay(tip, g.get("deck"))
        self.save()
        return {"count": len(guests), "mon": total, "kinds": kinds, "decks": decks}

    def set_tutorial_done(self, done: bool = True) -> None:
        self.data["tutorial_done"] = bool(done)
        self.save_soon()

    def bump(self, key: str) -> None:
        if key in ("onigiri_made", "fish_fed"):
            self.data[key] = int(self.data.get(key, 0)) + 1
            self.save_soon()

    def focus_completed(self) -> None:
        self.roll_day()
        self.data["today"]["focus_done"] += 1
        self.pet.on_focus_done()
        if self.shown("usagi"):
            self.data["mon"] += 5
        self.add_guest({"deck": None, "kind": "golden", "reviews": 0})
        self.save_soon()

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
                self.data["mon"] += 5
            self.save_soon()
        return gift

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
        }
