#!/usr/bin/env python3
"""Read Markdown task state; exit 0 eligible, 1 incomplete, 2 invalid input."""
import argparse
import json
import re
import sys
from pathlib import Path


def inspect_tasks(text, exclusions):
    completed, incomplete, excluded = [], [], []
    errors = []
    fence = None
    seen = set()
    for number, line in enumerate(text.splitlines(), 1):
        if fence:
            if re.fullmatch(r"\s*" + re.escape(fence[0]) + "{" + str(fence[1]) + r",}\s*", line):
                fence = None
            continue
        opening = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if opening and not (opening[1][0] == "`" and "`" in opening[2]):
            fence = (opening[1][0], len(opening[1]))
            continue
        task = re.match(r"^\s*[-*+]\s+\[([^\]]*)(?:\](.*))?$", line)
        if not task:
            continue
        if number in exclusions:
            seen.add(number)
            if exclusions[number] != line:
                errors.append(f"excluded line {number} changed")
            else:
                excluded.append(number)
            continue
        (completed if task[1] in ("x", "X") and task[2] is not None else incomplete).append(number)
    if fence:
        errors.append("unclosed code fence")
    for number in exclusions.keys() - seen:
        errors.append(f"excluded line {number} is not a task outside code fences")
    return {
        "eligible": bool(completed) and not incomplete and not errors,
        "completed": completed,
        "incomplete": incomplete,
        "excluded": excluded,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tasks", type=Path)
    parser.add_argument("--exclude", action="append", default=[], metavar="LINE:EXACT_TEXT")
    args = parser.parse_args()
    try:
        exclusions = {}
        for item in args.exclude:
            number, separator, expected = item.partition(":")
            number = int(number)
            if not separator or number < 1 or number in exclusions:
                raise ValueError("exclusions require unique positive LINE:EXACT_TEXT")
            exclusions[number] = expected
        result = inspect_tasks(args.tasks.read_text(encoding="utf-8"), exclusions)
    except (OSError, UnicodeError, ValueError) as error:
        result = {"eligible": False, "completed": [], "incomplete": [], "excluded": [], "errors": [str(error)]}
    print(json.dumps(result, ensure_ascii=False))
    return 2 if result["errors"] else 0 if result["eligible"] else 1


if __name__ == "__main__":
    sys.exit(main())
