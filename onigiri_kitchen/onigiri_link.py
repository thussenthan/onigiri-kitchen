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
        accent = pal.get("--accent-color")
        if accent and accent.startswith("#"):
            pal["--accent-fg"] = "#1b1b24" if _luminance(accent) > 0.55 else "#ffffff"
        palettes[mode] = pal

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

    css = f":root{{{block(theme['light'])}}}"
    css += f".nightMode,.night_mode,.night-mode,:root.night-mode{{{block(theme['dark'])}}}"
    if theme.get("font"):
        fam = theme["font"]["family"]
        css += f"@font-face{{font-family:'{fam}';src:url('{theme['font']['url']}');}}"
        css += f":root{{--oni-font:'{fam}';}}"
    if theme.get("woodBg"):
        css += f":root{{--oni-wood:url('{theme['woodBg']}');}}"
    return f"<style id=\"ok-onigiri-theme\">{css}</style>"
