"""Generate Codex agent TOML files from the .agent.md files each plugin ships.

Claude Code and Copilot CLI read plugins/<plugin>/agents/<name>.agent.md.
Codex reads TOML from .codex/agents/, so this writes one TOML per agent to
plugins/<plugin>/codex/agents/<name>.toml. The .agent.md files are the source.

Usage:
  python scripts/build_codex_agents.py          write the TOML files
  python scripts/build_codex_agents.py --check  fail if any are out of date
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_agent(path):
    text = path.read_text(encoding="utf-8")
    _, frontmatter, body = text.split("---\n", 2)
    fields = {}
    for line in frontmatter.strip().splitlines():
        key, value = line.split(": ", 1)
        fields[key] = value
    return fields["name"], fields["description"], body.strip()


def to_toml(name, description, instructions):
    if "'''" in instructions:
        raise ValueError(f"{name}: instructions cannot contain '''")
    # json.dumps output is a valid TOML basic string.
    return (
        f"name = {json.dumps(name)}\n"
        f"description = {json.dumps(description)}\n"
        f"developer_instructions = '''\n{instructions}\n'''\n"
    )


def main():
    check = "--check" in sys.argv
    stale = []
    for source in sorted(ROOT.glob("plugins/*/agents/*.agent.md")):
        name, description, instructions = parse_agent(source)
        target = source.parent.parent / "codex" / "agents" / f"{name}.toml"
        content = to_toml(name, description, instructions)
        current = target.read_text(encoding="utf-8") if target.exists() else None
        if current == content:
            continue
        if check:
            stale.append(target.relative_to(ROOT))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="\n")
            print(f"wrote {target.relative_to(ROOT)}")
    if stale:
        print("Out of date; run python scripts/build_codex_agents.py:")
        for path in stale:
            print(f"  {path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
