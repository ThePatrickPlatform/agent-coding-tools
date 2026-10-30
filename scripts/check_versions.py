"""Check plugin and skill versions and stages against VERSIONING.md.

Usage:
  python scripts/check_versions.py                    check the working tree
  python scripts/check_versions.py --base origin/main also require a version
                                                      bump for anything changed
                                                      since that ref
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PREFIXES = {
    "in-progress": "In progress: ",
    "alpha": "Alpha: ",
    "beta": "Beta: ",
    "release": "",
}

errors = []


def error(path, message):
    errors.append(f"{path}: {message}")


def parse_version(text):
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", text or ""):
        return None
    return tuple(int(part) for part in text.split("."))


def stage_from_description(description):
    for stage, prefix in PREFIXES.items():
        if prefix and description.startswith(prefix):
            return stage
    return "release"


def stage_problem(version_text, stage):
    version = parse_version(version_text)
    if version is None:
        return f"version {version_text!r} is not MAJOR.MINOR.PATCH"
    major, minor, _ = version
    if stage == "in-progress" and (major, minor) != (0, 0):
        return f"in-progress needs a 0.0.x version, not {version_text}"
    if stage in ("alpha", "beta") and (major != 0 or minor < 1):
        return f"{stage} needs a 0.y.z version with y >= 1, not {version_text}"
    if stage == "release" and major < 1:
        return f"release needs version 1.0.0 or higher, not {version_text}"
    return None


def check_stage(path, version_text, stage):
    problem = stage_problem(version_text, stage)
    if problem:
        error(path, problem)


def read_skill(text):
    match = re.match(r"---\n(.*?)\n---\n", text, re.S)
    frontmatter = match.group(1) if match else ""

    def field(pattern):
        found = re.search(pattern, frontmatter, re.M)
        return found.group(1) if found else None

    description = field(r"^description:\s*[\"']?(.*?)[\"']?\s*$")
    return {
        "description": description or "",
        "version": field(r"^  version:\s*\"?([^\"\s]*)\"?\s*$"),
        "lifecycle": field(r"^  lifecycle:\s*\"?([^\"\s]*)\"?\s*$"),
    }


def check_plugin(plugin_dir, marketplace):
    name = plugin_dir.name
    manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
    if not manifest_path.exists():
        error(plugin_dir.relative_to(ROOT), "needs a .claude-plugin/plugin.json manifest")
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rel = manifest_path.relative_to(ROOT)

    description = manifest.get("description", "")
    stage = stage_from_description(description)
    check_stage(rel, manifest.get("version"), stage)

    entry = marketplace.get(name)
    if entry is None:
        error(".claude-plugin/marketplace.json", f"no entry for plugin {name}")
    elif entry.get("description") != description:
        error(".claude-plugin/marketplace.json", f"description for {name} differs from {rel}")

    for skill_path in sorted(plugin_dir.glob("skills/*/SKILL.md")):
        skill = read_skill(skill_path.read_text(encoding="utf-8"))
        skill_rel = skill_path.relative_to(ROOT)
        lifecycle = skill["lifecycle"]
        if lifecycle not in PREFIXES:
            error(skill_rel, f"metadata.lifecycle must be one of {', '.join(PREFIXES)}")
            continue
        check_stage(skill_rel, skill["version"], lifecycle)
        if stage_from_description(skill["description"]) != lifecycle:
            prefix = PREFIXES[lifecycle] or "no stage prefix"
            error(skill_rel, f"description must start with {prefix!r} for {lifecycle}")


def git(*args):
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else None


def check_bumps(base):
    if git("rev-parse", "--verify", base) is None:
        error("--base", f"unknown ref {base}")
        return
    changed = (git("diff", "--name-only", base, "--", "plugins") or "").split()

    def require_bump(folder, version_file, read_metadata):
        if not any(path.startswith(folder + "/") for path in changed):
            return
        old_text = git("show", f"{base}:{version_file}")
        if old_text is None:
            return  # new since base
        new_path = ROOT / version_file
        if not new_path.exists():
            return  # removed
        old_version, old_stage = read_metadata(old_text)
        if stage_problem(old_version, old_stage):
            return  # base predates versioning, nothing to compare against
        new_version, _ = read_metadata(new_path.read_text(encoding="utf-8"))
        old, new = parse_version(old_version), parse_version(new_version)
        if new and new <= old:
            error(version_file, f"changed since {base} but version was not bumped")

    def plugin_metadata(text):
        manifest = json.loads(text)
        return manifest.get("version"), stage_from_description(manifest.get("description", ""))

    def skill_metadata(text):
        skill = read_skill(text)
        return skill["version"], skill["lifecycle"]

    for plugin_dir in sorted(ROOT.glob("plugins/*/")):
        folder = plugin_dir.relative_to(ROOT).as_posix()
        require_bump(folder, f"{folder}/.claude-plugin/plugin.json", plugin_metadata)
        for skill_dir in sorted(plugin_dir.glob("skills/*/")):
            skill_folder = skill_dir.relative_to(ROOT).as_posix()
            require_bump(skill_folder, f"{skill_folder}/SKILL.md", skill_metadata)


def main():
    marketplace_path = ROOT / ".claude-plugin" / "marketplace.json"
    marketplace = {
        plugin["name"]: plugin
        for plugin in json.loads(marketplace_path.read_text(encoding="utf-8"))["plugins"]
    }
    for plugin_dir in sorted(ROOT.glob("plugins/*/")):
        check_plugin(plugin_dir, marketplace)
    if "--base" in sys.argv:
        check_bumps(sys.argv[sys.argv.index("--base") + 1])

    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print("versions ok")


if __name__ == "__main__":
    main()
