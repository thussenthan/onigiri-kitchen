"""Builds dev/anki_order.html: the kitchen page loaded the way Anki's stdHtml
loads it (scripts in <head> before the body and before OK_INIT).

A *sample* Onigiri palette is used so the preview shows theming; the real
add-on reads each user's own palette at runtime.

    python3 dev/make_preview.py && python3 -m http.server 8791
    open http://localhost:8791/dev/anki_order.html?hour=11&ff=10
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE = {
    "light": {"accent-color": "#89b4fa", "bg": "#e6e9ef", "fg": "#4c4f69", "fg-subtle": "#6c6f85",
              "border": "#bcc0cc", "canvas-inset": "#dce0e8", "highlight-bg": "#ccd0da", "accent-fg": "#1b1b24"},
    "dark": {"accent-color": "#89b4fa", "bg": "#1e1e2e", "fg": "#cdd6f4", "fg-subtle": "#a6adc8",
             "border": "#45475a", "canvas-inset": "#313244", "highlight-bg": "#313244", "accent-fg": "#1b1b24"},
}

# Prefer Onigiri's *real* default theme (read from a local Onigiri install)
# so the preview shows how the kitchen looks inside Onigiri out of the box.
ONIGIRI_DIR = os.path.expanduser("~/Library/Application Support/Anki2/addons21/1011095603")
THEME_VARS = ("accent-color", "bg", "fg", "fg-subtle", "border", "canvas-inset", "highlight-bg")


def onigiri_default_palette():
    import ast
    try:
        tree = ast.parse(open(os.path.join(ONIGIRI_DIR, "config.py"), encoding="utf-8").read())
    except OSError:
        return None
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            for k, v in zip(node.keys, node.values):
                if isinstance(k, ast.Constant) and k.value == "colors" and isinstance(v, ast.Dict):
                    colors = ast.literal_eval(v)
                    out = {}
                    for mode in ("light", "dark"):
                        pal = {name: colors[mode]["--" + name] for name in THEME_VARS if "--" + name in colors[mode]}
                        acc = pal.get("accent-color", "#007aff").lstrip("#")
                        r, g, b = (int(acc[i:i + 2], 16) / 255 for i in (0, 2, 4))
                        pal["accent-fg"] = "#1b1b24" if 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 else "#ffffff"
                        out[mode] = pal
                    return out
    return None


_real = onigiri_default_palette()
if _real:
    SAMPLE = _real
    print("using Onigiri's default theme")


def block(pal):
    return "".join(f"--oni-{k}:{v};" for k, v in pal.items())

theme = ""
if "--plain" not in os.sys.argv:
    theme = (f'<style id="ok-onigiri-theme">:root{{{block(SAMPLE["light"])}}}'
             f'.nightMode,.night_mode,.night-mode{{{block(SAMPLE["dark"])}}}</style>')
    # With Onigiri installed, the sign uses Onigiri's wooden banner. Borrow it
    # from a local Onigiri install for the preview (dev/assets is gitignored,
    # so Onigiri's image is never committed to this repo).
    import shutil
    wood_src = os.path.expanduser(
        "~/Library/Application Support/Anki2/addons21/1011095603/system_files/"
        "gamification_images/restaurant_folder/wooden_bg.png")
    if os.path.exists(wood_src):
        os.makedirs(os.path.join(ROOT, "dev", "assets"), exist_ok=True)
        shutil.copyfile(wood_src, os.path.join(ROOT, "dev", "assets", "wooden_bg.png"))
        theme += "<style>:root{--oni-wood:url('/dev/assets/wooden_bg.png');}</style>"
    else:
        print("note: Onigiri not found locally, so the sign uses the plain fallback")

pre = open(os.path.join(ROOT, "dev", "preview.html"), encoding="utf-8").read()
init = pre[pre.index("<script>") + 8:pre.index("</script>")]
body = open(os.path.join(ROOT, "onigiri_kitchen", "web", "kitchen.html"), encoding="utf-8").read()

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Kitchen preview (Anki load order)</title>
<script>if (new URLSearchParams(location.search).has('noanim')) document.write('<style>*{{animation:none!important;transition:none!important}}</style>');</script>
<link rel="stylesheet" href="../onigiri_kitchen/web/kitchen.css">
{theme}
<script src="../onigiri_kitchen/web/sound.js"></script>
<script src="../onigiri_kitchen/web/kitchen.js"></script>
<script>{init}</script>
<script>if (q.get('night')) document.documentElement.className='nightMode';</script>
</head><body>{body}
<script>if (q.get('night')) document.body.className='nightMode';
window.addEventListener('load',()=>setTimeout(()=>{{ if(q.get('panel')) document.getElementById(q.get('panel')).click(); }},50));</script>
</body></html>"""
open(os.path.join(ROOT, "dev", "anki_order.html"), "w", encoding="utf-8").write(page)
print("wrote dev/anki_order.html")
