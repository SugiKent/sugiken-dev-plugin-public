#!/usr/bin/env python3
"""Regression fixtures for the shared archive eligibility command."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("task-status.py")


class TaskStatusTests(unittest.TestCase):
    def test_fixtures(self):
        # name, Markdown (None = missing), exclusions, exit, complete, incomplete
        cases = [
            ("done", "* [x] a\n  - [X] b\n+ [x] c\n", [], 0, 3, 0),
            ("unknown", "* [x] a\n* [~] b\n* [todo] c\n* [] d\n* [x\n", [], 1, 1, 4),
            ("pending", "* [x] a\n* [ ] b\n", [], 1, 1, 1),
            ("fences", "* [x] a\n````md\n* [ ] b\n```\n* [todo] c\n````\n~~~md\n* [ ] d\n~~~~\n", [], 0, 1, 0),
            ("wrong-fence", "* [x] a\n```\n~~~\n* [ ] b\n```\n", [], 0, 1, 0),
            ("trailing-fence-text", "* [x] a\n```\n```invalid\n* [ ] b\n```\n", [], 0, 1, 0),
            ("empty", "", [], 1, 0, 0),
            ("fence-only", "```md\n* [x] a\n```\n", [], 1, 0, 0),
            ("unclosed", "* [x] a\n~~~\n* [ ] b\n", [], 2, 1, 0),
            ("excluded", "* [x] a\n* [ ] archive", ["2:* [ ] archive"], 0, 1, 0),
            ("normal-archive", "* [x] a\n* [ ] implement archive API", [], 1, 1, 1),
            ("changed-exclusion", "* [x] a\n* [ ] implement archive API", ["2:* [ ] archive"], 2, 1, 0),
            ("non-task-exclusion", "* [x] a\nheading", ["2:heading"], 2, 1, 0),
            ("fenced-exclusion", "* [x] a\n~~~\n* [ ] b\n~~~", ["3:* [ ] b"], 2, 1, 0),
            ("all-excluded", "* [ ] archive", ["1:* [ ] archive"], 1, 0, 0),
            ("duplicate-exclusion", "* [x] a", ["1:* [x] a", "1:* [x] a"], 2, 0, 0),
            ("invalid-exclusion", "* [x] a", ["bad"], 2, 0, 0),
            ("missing", None, [], 2, 0, 0),
        ]
        with tempfile.TemporaryDirectory() as directory:
            for name, body, exclusions, code, done, pending in cases:
                with self.subTest(name=name):
                    path = Path(directory) / name / "tasks.md"
                    if body is not None:
                        path.parent.mkdir()
                        path.write_text(body, encoding="utf-8")
                    args = [sys.executable, str(SCRIPT), str(path)]
                    for exclusion in exclusions:
                        args += ["--exclude", exclusion]
                    run = subprocess.run(args, capture_output=True, text=True)
                    result = json.loads(run.stdout)
                    self.assertEqual(run.returncode, code)
                    self.assertEqual(len(result["completed"]), done)
                    self.assertEqual(len(result["incomplete"]), pending)
                    self.assertEqual(result["eligible"], code == 0)


if __name__ == "__main__":
    unittest.main()
