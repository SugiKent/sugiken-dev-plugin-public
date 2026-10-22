# Third-party notices

This document records third-party attribution and license information. It is
documentation only: it is not a Claude Code plugin manifest, hook, agent, or
skill instruction, and does not affect plugin or skill behavior.

## OpenSpec

This repository includes copies and adaptations of instruction files originally
distributed with [OpenSpec](https://github.com/Fission-AI/OpenSpec), an
open-source spec-driven development framework maintained by the OpenSpec
contributors.

The OpenSpec-derived material is in:

- `plugins/openspec/skills/openspec-apply-change/SKILL.md`
- `plugins/openspec/skills/openspec-archive-change/SKILL.md`
- `plugins/openspec/skills/openspec-explore/SKILL.md`
- `plugins/openspec/skills/openspec-propose/SKILL.md`
- `plugins/openspec/skills/openspec-sync-specs/SKILL.md`

Those files have been translated into Japanese and adapted for this
repository's personal-development workflow. They are not presented as an
official OpenSpec distribution, and this repository is not affiliated with or
endorsed by the OpenSpec project. The separately authored
`openspec-review-changes` skill is not an upstream OpenSpec mirror.

Upstream source and license:

- Project: [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- License: [MIT License](https://github.com/Fission-AI/OpenSpec/blob/main/LICENSE)

OpenSpec is licensed under the MIT License. The upstream copyright and license
notice are reproduced below for the included copies and substantial
adaptations.

```text
MIT License

Copyright (c) 2024 OpenSpec Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OpenClaw

This repository includes an adaptation of the `test-audit` agent skill
originally distributed with [OpenClaw](https://github.com/openclaw/openclaw).

The OpenClaw-derived material is in:

- `plugins/architect/skills/35-architect-test-audit/SKILL.md`
  (from `.agents/skills/test-audit/SKILL.md`)
- `plugins/architect/skills/35-architect-test-audit/references/campaign.md`
  (from `.agents/skills/test-audit/CAMPAIGN.md`)

Upstream files were taken from commit
`281967681fd031ef58de7288d4cfd71e87d70585` of `openclaw/openclaw` (the last
commit touching `.agents/skills/test-audit` at that point was
`80930af448ebabc84174146b56bc106d37fab3b4`).

Changes from upstream:

- Translated into Japanese.
- Replaced OpenClaw-specific paths, scripts, skills, and tooling (Vitest,
  `scripts/run-vitest.mjs`, `scripts/check-changed.mjs`, `scripts/pr`,
  `$openclaw-testing`, `$crabbox`, `$autoreview`, `$openclaw-pr-maintainer`,
  `src/`, `packages/`, `extensions/`) with instructions to discover the
  equivalent in the target repository.
- Generalized the campaign guide so it does not depend on a language, test
  framework, or monorepo layout, and replaced the Telegram-specific examples
  with the lessons they illustrated.
- Moved `CAMPAIGN.md` to `references/campaign.md` and renamed the skill to
  `35-architect-test-audit` to follow this repository's layout.

These files are not presented as an official OpenClaw distribution, and this
repository is not affiliated with or endorsed by the OpenClaw project.

Upstream source and license:

- Project: [openclaw/openclaw](https://github.com/openclaw/openclaw)
- License: [MIT License](https://github.com/openclaw/openclaw/blob/main/LICENSE)

OpenClaw is licensed under the MIT License. The upstream copyright and license
notice are reproduced below for the included adaptations.

```text
MIT License

Copyright (c) 2026 OpenClaw Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## stop-describing-ui

This repository includes an adaptation of the `stop-describing-ui` agent skill
originally distributed with
[artouc/stop-describing-ui](https://github.com/artouc/stop-describing-ui).

The derived material is in:

- `plugins/design/skills/stop-describing-ui/SKILL.md`
  (from `skills/stop-describing-ui/SKILL.md`)

Upstream file was taken from commit
`c78c9e284d6e923c703295f36a31aca1d891f6bd` of `artouc/stop-describing-ui`.

Changes from upstream:

- Translated into Japanese, including the before/after examples.
- Added the full-width colon to the list of symbols not to use as separators.

This file is not presented as an official distribution of the upstream project,
and this repository is not affiliated with or endorsed by its author.

Upstream source and license:

- Project: [artouc/stop-describing-ui](https://github.com/artouc/stop-describing-ui)
- License: MIT License

The upstream copyright and license notice are reproduced below.

```text
MIT License

Copyright (c) 2026 Arata Ouchi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## pstack

This repository includes translations and adaptations of the pstack plugin
originally distributed in [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)
by Lauren Tan (poteto).

The pstack-derived material is in:

- `plugins/architect/skills/35-architect-principle/references/principles/`
  and the "作業の原則" section of
  `plugins/architect/skills/35-architect-principle/SKILL.md` (from the
  `pstack/skills/principle-*` skills and the Principles section of
  `pstack/skills/poteto-mode/SKILL.md`)
- `plugins/architect/skills/35-architect-sketch/` (from `pstack/skills/architect/`
  and `pstack/skills/arena/SKILL.md`; `references/grounding.md` from
  `pstack/skills/how/SKILL.md`, `pstack/skills/why/SKILL.md`, and the
  Investigation playbook)
- `plugins/architect/skills/35-architect-interrogate/` (from
  `pstack/skills/interrogate/` and
  `pstack/skills/poteto-mode/references/bugbot-triage.md`)
- `plugins/architect/agents/architect-interrogate-reviewer.md` (from the
  reviewer role in `pstack/skills/interrogate/SKILL.md`)
- `plugins/openspec/skills/openspec-apply-change/references/` and
  `plugins/openspec/skills/openspec-apply-change/scripts/decision-log.sh` (from
  the Feature, Bug fix, and Refactoring playbooks, the Subagents and Writing the
  reply sections of `pstack/skills/poteto-mode/SKILL.md`, and the `tdd` and
  `show-me-your-work` skills)
- `plugins/basic/skills/grill-me/references/prototype.md` (from the Prototype
  playbook) and the "始める前に言い直す", "質問する前に分ける",
  "推奨は判断で、追認ではない", and "全面委任・無人実行のとき" sections of
  `plugins/basic/skills/grill-me/SKILL.md` (from
  `pstack/skills/poteto-mode/SKILL.md`, `pstack/skills/in-your-own-words/SKILL.md`,
  and `pstack/skills/sharpen/SKILL.md`)
- `plugins/basic/skills/01-retro/references/` and the "三つのレンズで並行に読む",
  "統合の基準", and "強制の階段" sections of `plugins/basic/skills/01-retro/SKILL.md`
  (from `pstack/skills/reflect/` and `pstack/skills/correct/SKILL.md`)
- The "安全の要になる事実" and "確かさの段階" parts of
  `plugins/architect/skills/35-architect-doubt-driven-development/SKILL.md`
  (from `pstack/skills/blast-radius/SKILL.md`)
- The "根本原因か症状か" and "検証" axes of
  `plugins/architect/skills/35-architect-code-review/SKILL.md` (from
  `pstack/skills/interrogate/references/rubric.md`)
- `plugins/openspec/agents/comment-sicko.md` (from `pstack/agents/comment-sicko.md`),
  and the pstack-derived steps of
  `plugins/openspec/skills/openspec-apply-change/SKILL.md` and
  `plugins/openspec/skills/openspec-propose/SKILL.md` (from
  `pstack/skills/no-comments/SKILL.md` and the poteto-mode workflow)
- The lead-judgment step of `plugins/orchestration/agents/apply-review.md`
  (from `pstack/skills/interrogate/references/lead-judgment.md`)

Upstream files were taken from commit
`101b274dd991f694e1f7024be2157e5f3adf07de` of `cursor/plugins`.

Changes from upstream:

- Translated into Japanese.
- Mapped Cursor tools, subagent fields, models, and paths to Claude Code
  (`Task` to `Agent`, readonly reviewers to a read-only agent, Cursor model
  slugs to `opus` and `sonnet`, a second model family to Codex MCP when it is
  available, and Cursor transcripts to `~/.claude/projects/`).
- Split `poteto-mode` instead of shipping it as one skill. Its principles,
  playbooks, and rules now sit in the skills that the OpenSpec propose and
  apply steps call, so running propose or apply is enough to use them.
- Folded `arena` into `35-architect-sketch`, the `how` and `why` procedures
  into `35-architect-sketch/references/grounding.md`, and `tdd` into the
  bug-fix task reference.
- Left out playbooks and skills that depend on Cursor-only features or fall
  outside the OpenSpec workflow, such as Babysit, Shipping, Autopilot,
  Orchestrate, figure-it-out, `setup-pstack`, and the Bugbot watcher scripts.

These files are not presented as an official pstack distribution, and this
repository is not affiliated with or endorsed by the pstack author or Cursor.
Copies of the license are in `35-architect-sketch/LICENSE`,
`35-architect-interrogate/LICENSE`, `35-architect-principle/references/principles/LICENSE`,
`plugins/openspec/NOTICE.md`, and `plugins/basic/NOTICE.md`.

Upstream source and license:

- Project: [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/pstack)
- License: [MIT License](https://github.com/cursor/plugins/blob/main/pstack/LICENSE)

pstack is licensed under the MIT License. The upstream copyright and license
notice are reproduced below for the included translations and adaptations.

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## frontend-design

`plugins/design/skills/design/` includes material adapted from the
`frontend-design` agent skill distributed by Anthropic in
[anthropics/skills](https://github.com/anthropics/skills). The guidance was
translated into Japanese, trimmed to the parts not already covered by the other
`design` plugin skills, and reorganized for this repository.

The derived material is in:

- `plugins/design/skills/design/SKILL.md`
- `plugins/design/skills/design/references/visual-direction.md`

Upstream source and license:

- Project: [anthropics/skills](https://github.com/anthropics/skills)
- License: see the `LICENSE.txt` distributed with the upstream
  `frontend-design` skill for the complete terms.
