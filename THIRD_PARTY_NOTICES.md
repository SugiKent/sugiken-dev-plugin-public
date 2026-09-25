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
