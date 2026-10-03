"""Read-only access to Onigiri's restaurant data.

Nothing in this module writes to Onigiri's files or calls Onigiri functions
that write. If Onigiri isn't installed, everything falls back to defaults so
the kitchen still works on its own.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any, Dict, Optional

from aqt import mw

ONIGIRI_ANKIWEB_ID = "1011095603"
DEFAULT_THEME_COLOR = "#D49083"

# Fallback copy of Onigiri's theme colours, used only if its module can't be read.
_FALLBACK_THEMES = {
    "default": "#D49083",
    "focus_dango": "#DC90B8",
    "motivated_mochi": "#6EC170",
    "macha_delights": "#517C58",
    "macaron_maison": "#AFC3D6",
    "coffee_co": "#98693A",
    "grocery_store": "#AD6131",
    "bakery_heaven": "#CD9C57",
    "awesome_boba": "#CD8DCA",
    "awesome_shiny_boba": "#41A59D",
    "santas_coffee": "#CA4D44",
    "lunar_new_year": "#D22B2B",
    "prev_onigiri_heaven": "#445b76",
    "restaurant_evo_i": "#D07A5F",
    "restaurant_evo_ii": "#D07A5F",
    "restaurant_evo_iii": "#D07A5F",
    "restaurant_evo_iv": "#D07A5F",
    "restaurant_evo_legendary": "#445A78",
    "restaurant_evo_garden": "#2F553D",
}

_package_cache: Optional[str] = None


def find_onigiri_package() -> Optional[str]:
    """Return the add-on folder name of Onigiri, or None if it isn't installed."""
    global _package_cache
    if _package_cache is not None:
        return _package_cache or None

    addons_dir = mw.addonManager.addonsFolder()
    candidates = [ONIGIRI_ANKIWEB_ID]
    try:
        candidates += [d for d in mw.addonManager.allAddons() if d != ONIGIRI_ANKIWEB_ID]
    except Exception:
        pass

    for pkg in candidates:
        root = os.path.join(addons_dir, pkg)
        if not os.path.isdir(os.path.join(root, "gamification")):
            continue
        name = ""
        for meta_file in ("manifest.json", "meta.json"):
            try:
                with open(os.path.join(root, meta_file), encoding="utf-8") as f:
                    name = json.load(f).get("name", "") or name
            except Exception:
                pass
        if "onigiri" in name.lower() or pkg == ONIGIRI_ANKIWEB_ID:
            _package_cache = pkg
            return pkg

    _package_cache = ""
    return None


def _xp_for_next(level: int) -> int:
    # Same curve Onigiri uses (gamification/restaurant_level.py).
    return 50 * (2 * level + 1)


def _collapse_xp(total_xp: int):
    level, needed = 0, 0
    while True:
        step = _xp_for_next(level)
        if total_xp < needed + step:
            return level, total_xp - needed, step
        needed += step
        level += 1


def _theme_color(pkg: str, theme_id: str) -> str:
    if theme_id == "default":
        return DEFAULT_THEME_COLOR
    mod = sys.modules.get(f"{pkg}.gamification.restaurant_level")
    if mod is not None:
        for table in ("RESTAURANTS", "EVOLUTIONS"):
            item = getattr(mod, table, {}).get(theme_id)
            if item and item.get("theme"):
                return item["theme"]
    return _FALLBACK_THEMES.get(theme_id, DEFAULT_THEME_COLOR)


def read_progress() -> Dict[str, Any]:
    """Snapshot of Onigiri's restaurant: name, level, XP and theme colour."""
    result: Dict[str, Any] = {
        "found": False,
        "name": "Onigiri Kitchen",
        "level": 0,
        "xpInto": 0,
        "xpNext": _xp_for_next(0),
        "themeColor": DEFAULT_THEME_COLOR,
        "themeId": "default",
    }
    pkg = find_onigiri_package()
    if not pkg:
        return result
    result["found"] = True

    try:
        profile = mw.pm.name
    except Exception:
        profile = "default"
    path = os.path.join(
        mw.addonManager.addonsFolder(), pkg, "user_files", f"gamification_{profile}.json"
    )
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f).get("restaurant_level", {})
    except Exception:
        return result

    total_xp = int(data.get("total_xp", 0) or 0)
    level, into, nxt = _collapse_xp(max(0, total_xp))
    name = str(data.get("name") or "").strip()
    if not name or name == "Restaurant Level":
        name = "Onigiri Kitchen"
    theme_id = str(data.get("current_theme_id") or "default")
    result.update(
        name=name,
        level=level,
        xpInto=into,
        xpNext=nxt,
        themeId=theme_id,
        themeColor=_theme_color(pkg, theme_id),
    )
    if not re.fullmatch(r"#[0-9a-fA-F]{3,8}", result["themeColor"] or ""):
        result["themeColor"] = DEFAULT_THEME_COLOR
    return result


# ------------------------------------------------------------------ theme
# The Onigiri colour tokens the kitchen reuses, so it matches whichever
# Onigiri theme is active (read from Onigiri's settings file, never written).
THEME_VARS = (
    "--accent-color",
    "--bg",
    "--fg",
    "--fg-subtle",
    "--border",
    "--canvas-inset",
    "--highlight-bg",
    "--button-primary-bg",
    "--shadow-sm",
    "--shadow-md",
    "--shadow-lg",
)
_SAFE_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)")

ONIGIRI_FONTS = {
    "nunito": ("Nunito", "Nunito.ttf"),
    "montserrat": ("Montserrat", "Montserrat.ttf"),
    "instrument_serif": ("Instrument Serif", "Instrument.ttf"),
    "space_mono": ("SpaceMono", "SpaceMono.ttf"),
}


def _rgb(color: str) -> Optional[tuple]:
    """(r, g, b) in 0..1 from #hex or rgb()/rgba(), or None."""
    c = color.strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h[:3])
        try:
            return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        except ValueError:
            return None
    m = re.match(r"rgba?\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)", c)
    if not m:
        return None
    vals = []
    for num, pct in ((m.group(1), m.group(2)), (m.group(3), m.group(4)), (m.group(5), m.group(6))):
        v = float(num)
        vals.append(v / 100 if pct else v / 255)
    return tuple(max(0.0, min(1.0, v)) for v in vals)


def _rel_lum(color: str) -> Optional[float]:
    rgb = _rgb(color)
    if rgb is None:
        return None
    lin = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _contrast(a: str, b: str) -> Optional[float]:
    la, lb = _rel_lum(a), _rel_lum(b)
    if la is None or lb is None:
        return None
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def readable(pal: Dict[str, str]) -> Dict[str, str]:
    """Make sure the text colours can be read on the backgrounds they're used
    on. Some Onigiri themes pair, say, white text with a background *image*;
    the kitchen draws the theme's background colour instead, so white text
    could land on a pale colour. If contrast is too low, use a dark or light
    text that suits the background."""
    bg = pal.get("--canvas-inset") or pal.get("--bg")
    if not bg or _rel_lum(bg) is None:
        return pal
    dark_bg = _rel_lum(bg) < 0.25
    fixes = {"--fg": ("#f0ece4", "#212121", 4.5), "--fg-subtle": ("#b8b0a4", "#5d5a55", 3.0)}
    for var, (on_dark, on_light, need) in fixes.items():
        worst = min(
            (r for r in (_contrast(pal.get(var, ""), pal.get(b, "")) for b in ("--bg", "--canvas-inset")) if r is not None),
            default=None,
        )
        if var in pal and worst is not None and worst < need:
            pal[var] = on_dark if dark_bg else on_light
    # text on accent-coloured buttons
    accent = pal.get("--accent-color")
    if accent and _rel_lum(accent) is not None:
        pal["--accent-fg"] = "#1b1b24" if (_contrast(accent, "#1b1b24") or 0) > (_contrast(accent, "#ffffff") or 0) else "#ffffff"
    return pal


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return 0.5
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def read_theme() -> Optional[Dict[str, Any]]:
    """Onigiri's active light/dark palette, font and header image, or None."""
    pkg = find_onigiri_package()
    if not pkg:
        return None
    try:
        profile = mw.pm.name
    except Exception:
        profile = "default"
    root = os.path.join(mw.addonManager.addonsFolder(), pkg)
    try:
        with open(os.path.join(root, "user_files", f"settings_{profile}.json"), encoding="utf-8") as f:
            colors = json.load(f).get("colors", {})
    except Exception:
        colors = {}

    palettes: Dict[str, Dict[str, str]] = {}
    for mode in ("light", "dark"):
        src = colors.get(mode, {}) if isinstance(colors, dict) else {}
        pal = {}
        for var in THEME_VARS:
            value = str(src.get(var, "")).strip()
            if _SAFE_COLOR.fullmatch(value):
                pal[var] = value
        palettes[mode] = readable(pal)

    font = None
    try:
        key = mw.col.get_config("onigiri_font_main", "system")
    except Exception:
        key = "system"
    if key in ONIGIRI_FONTS:
        family, file = ONIGIRI_FONTS[key]
        font = {"family": family, "url": f"/_addons/{pkg}/system_files/fonts/system_fonts/{file}"}
    elif isinstance(key, str) and re.fullmatch(r"[\w .\-]+\.(ttf|otf|woff2?)", key, re.I):
        # A font the user added to Onigiri (stored by file name in its user_files/fonts)
        if os.path.exists(os.path.join(root, "user_files", "fonts", key)):
            font = {"family": "OnigiriUserFont", "url": f"/_addons/{pkg}/user_files/fonts/{key}"}

    wood = os.path.join(root, "system_files", "gamification_images", "restaurant_folder", "wooden_bg.png")
    return {
        "light": palettes["light"],
        "dark": palettes["dark"],
        "font": font,
        "woodBg": f"/_addons/{pkg}/system_files/gamification_images/restaurant_folder/wooden_bg.png" if os.path.exists(wood) else None,
    }


def theme_css() -> str:
    """A <style> block defining --oni-* variables from Onigiri's theme."""
    theme = read_theme()
    if not theme:
        return ""

    def block(pal: Dict[str, str]) -> str:
        return "".join(f"--oni-{k[2:]}:{v};" for k, v in pal.items())

    light, dark = theme["light"], dict(theme["dark"])
    # A colour the dark palette doesn't set would otherwise be inherited from
    # the light one (a white background with light text, for example); unset
    # it so the kitchen's own dark default is used instead.
    for key in light:
        dark.setdefault(key, "initial")
    css = f":root{{{block(light)}}}"
    css += f".nightMode,.night_mode,.night-mode,:root.night-mode{{{block(dark)}}}"
    if theme.get("font"):
        fam = theme["font"]["family"]
        css += f"@font-face{{font-family:'{fam}';src:url('{theme['font']['url']}');}}"
        css += f":root{{--oni-font:'{fam}';}}"
    if theme.get("woodBg"):
        css += f":root{{--oni-wood:url('{theme['woodBg']}');}}"
    return f"<style id=\"ok-onigiri-theme\">{css}</style>"


# ---------------------------------------------------------------- specials
# Onigiri's "Specials Book": every Daily Special you've finished. The kitchen
# serves those dishes, so the menu grows as the Book does. Read-only, like
# everything else here.
_SPECIALS_CACHE: Dict[str, Any] = {"key": None, "dishes": None}


def _restaurant_dishes(pkg: str, theme_id: str) -> list:
    """The dish list Onigiri uses for a restaurant (same lookup as Onigiri:
    evolutions use the default list, unknown ids fall back to it too)."""
    path = os.path.join(mw.addonManager.addonsFolder(), pkg, "web", "gamification", "restaurant_level", "special_dishes.js")
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return []
    if _SPECIALS_CACHE["key"] != (path, mtime):
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read()
        except OSError:
            return []
        lists: Dict[str, list] = {}
        for m in re.finditer(r'"([\w\-]+)"\s*:\s*\[', content):
            depth, start = 0, m.end() - 1
            for i in range(start, len(content)):
                if content[i] == "[":
                    depth += 1
                elif content[i] == "]":
                    depth -= 1
                    if depth == 0:
                        body = content[start + 1:i]
                        break
            else:
                continue
            dishes = []
            for obj in re.finditer(r"\{(.*?)\}", body, re.S):
                fields = dict(re.findall(r'["\']?(\w+)["\']?\s*:\s*["\']?(.*?)["\']?\s*,?\s*$', obj.group(1), re.M))
                if fields.get("name"):
                    dishes.append(fields)
            lists[m.group(1)] = dishes
        _SPECIALS_CACHE.update(key=(path, mtime), dishes=lists)
    lists = _SPECIALS_CACHE["dishes"] or {}
    rid = "default" if (not theme_id or theme_id.startswith("restaurant_evo_")) else theme_id
    return lists.get(rid) or lists.get("default") or []


def read_specials() -> Dict[str, Any]:
    """Your Specials Book (finished specials, newest first) and today's
    Daily Special with its progress, from Onigiri."""
    result: Dict[str, Any] = {"found": False, "book": [], "today": None}
    pkg = find_onigiri_package()
    if not pkg:
        return result
    try:
        profile = mw.pm.name
    except Exception:
        profile = "default"
    try:
        with open(os.path.join(mw.addonManager.addonsFolder(), pkg, "user_files", f"gamification_{profile}.json"), encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return result
    result["found"] = True
    seen = set()
    book = []
    specials = [s for s in (data.get("daily_specials") or []) if isinstance(s, dict) and s.get("completed")]
    specials.sort(key=lambda s: str(s.get("completed_date") or ""), reverse=True)
    for s in specials:
        name = str(s.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        book.append({
            "name": name[:60],
            "desc": str(s.get("description") or "")[:160],
            "rarity": str(s.get("difficulty") or "common")[:12],
        })
    result["book"] = book

    # Today's special: Onigiri picks it by day of the year from the current
    # restaurant's list; its progress is in restaurant_level.daily_special.
    rl = data.get("restaurant_level") or {}
    # the on/off switch lives in Onigiri's per-profile settings file
    try:
        with open(os.path.join(mw.addonManager.addonsFolder(), pkg, "user_files", f"settings_{profile}.json"), encoding="utf-8") as f:
            settings = json.load(f)
        ds_conf = settings.get("daily_special") or (settings.get("achievements") or {}).get("daily_special") or {}
        enabled = bool(ds_conf.get("enabled", True))  # Onigiri's own default is on
    except Exception:
        enabled = True
    dishes = _restaurant_dishes(pkg, str(rl.get("current_theme_id") or "default"))
    if enabled and dishes:
        import datetime as _dt

        now = _dt.datetime.now()
        day_of_year = (now - _dt.datetime(now.year, 1, 1)).days + 1
        dish = dishes[day_of_year % len(dishes)]
        ds = rl.get("daily_special") or {}
        target = int(ds.get("target") or 0)
        progress = int(ds.get("current_progress") or 0)
        result["today"] = {
            "name": str(dish.get("name"))[:60],
            "desc": str(dish.get("description") or "")[:160],
            "rarity": str(dish.get("difficulty") or "common")[:12],
            "target": target,
            "progress": progress,
            "done": bool(target) and progress >= target,
        }
    return result


# ------------------------------------------------- quieter Onigiri pop-ups
PROGRESS_POPUP_PREFIX = "daily_special_progress_"


def hide_progress_popups(allow: "Callable[[], bool]") -> bool:
    """Onigiri pops up "Daily Special: 25% / 50% / 75% complete!" while you study
    (the unlock pop-up at 100% is a different one). Wrap its dispatcher so only
    those percentage ones are dropped, unless `allow()` says they're wanted.
    Nothing in Onigiri's files is changed; this lasts until Anki closes."""
    import importlib

    pkg = find_onigiri_package()
    if not pkg:
        return False
    try:
        mod = importlib.import_module(f"{pkg}.gamification.restaurant_level")
        cls = mod.RestaurantLevelManager
        original = cls._dispatch_notifications
    except Exception:
        return False
    if getattr(original, "_ok_wrapped", False):
        return True

    def wrapped(self: Any, notifications: Any) -> Any:
        try:
            if notifications and not allow():
                notifications = [n for n in notifications if not str((n or {}).get("id", "")).startswith(PROGRESS_POPUP_PREFIX)]
        except Exception:
            pass
        return original(self, notifications)

    wrapped._ok_wrapped = True  # type: ignore[attr-defined]
    cls._dispatch_notifications = wrapped
    return True
