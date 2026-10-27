"""Checks that a release is consistent before it's built and tagged:

  * the version in main.py is in the manifest, the changelog and the in-app What's new
  * the changelog has a section for it, and the README links no missing file
  * (in CI, on a tag) the tag is that version

    python3 dev/release_check.py
"""
import ast
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda *p: open(os.path.join(ROOT, *p), encoding="utf-8").read()
problems = []

tree = ast.parse(read("onigiri_kitchen", "main.py"))
consts = {}
for node in tree.body:
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("VERSION", "WHATS_NEW"):
        consts[node.targets[0].id] = ast.literal_eval(node.value)
version = consts["VERSION"]

if json.loads(read("onigiri_kitchen", "manifest.json")).get("human_version") != version:
    problems.append(f"manifest.json human_version isn't {version}")
if not re.search(rf"^## {re.escape(version)}$", read("CHANGELOG.md"), re.M):
    problems.append(f"CHANGELOG.md has no '## {version}' section")
if version not in consts["WHATS_NEW"]:
    print(f"note: no in-app What's new note for {version} (fine for a small fix)")
newer = [v for v in consts["WHATS_NEW"] if tuple(map(int, v.split("."))) > tuple(map(int, version.split(".")))]
if newer:
    problems.append(f"WHATS_NEW has notes for a version after {version}: {newer}")

ref = os.environ.get("GITHUB_REF", "")
if ref.startswith("refs/tags/v") and ref[len("refs/tags/v"):] != version:
    problems.append(f"tag {ref} doesn't match VERSION {version}")

for doc in ("README.md", "ANKIWEB.md"):
    for target in re.findall(r"\]\((docs/[^)\s]+)\)", read(doc)):
        if not os.path.exists(os.path.join(ROOT, target)):
            problems.append(f"{doc} links {target}, which doesn't exist")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"release {version} is consistent")
