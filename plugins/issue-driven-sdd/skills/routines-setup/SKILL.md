---
name: routines-setup
description: 'issue-driven-sdd を導入し、GitHub ラベルと Claude Code Routines を現行規約へ合わせる。「Routines をセットアップして」「ラベルを作って」で使う。'
---

`routine-common` を読む。前提は `openspec` と `claude-code-routines` plugin。
Routine の操作は `claude-code-routines:manage-routines` を使う。未導入なら
`claude plugin install claude-code-routines@sugiken-dev-public` で導入する。

# 1. ラベル

`gh label list` と突き合わせ、不足を作り、既存の色と説明を揃える。表にないラベルは消さない。

| ラベル | 色 | ラベル | 色 |
| --- | --- | --- | --- |
| `stage:todo` | `BFDADC` | `stage:propose` | `0E8A16` |
| `stage:apply` | `1D76DB` | `stage:archive` | `5319E7` |
| `wip` | `FBCA04` | `blocked` | `B60205` |
| `propose` | `0E8A16` | `apply` | `1D76DB` |
| `archive` | `5319E7` | `docs` | `C5DEF5` |
| `question` | `D876E3` | `ai-assess:requested` | `F9D0C4` |

`ai-assess:requested` は assess を導入する場合だけ作る。

# 2. Routines

`claude-code-routines:manage-routines` に対象 repo、次の設定表、本文、connector 要件と、手順 4 の
custom skill の `## routines` を ID の読取・保存先として渡し、差分を反映させる。

| Name | Trigger | Filter | model | autofix |
| --- | --- | --- | --- | --- |
| `<project> dispatch` | Issue Labeled | `issue.labels IN [stage:todo]`、`issue.labels NOT_IN [blocked]` | sonnet | false |
| 同上 | Issue Closed | なし | | |
| 同上 | PR closed | `pr.merged = true`、`pr.labels IN [propose]` | | |
| 同上 | PR closed | `pr.merged = true`、`pr.labels IN [apply]` | | |
| `<project> propose` | Issue Labeled | `issue.labels IN [stage:propose]`、`issue.labels NOT_IN [wip, blocked, question]` | 既定 | true |
| `<project> apply` | Issue Labeled | `issue.labels IN [stage:apply]`、`issue.labels NOT_IN [wip, blocked, question]` | 既定 | true |
| `<project> archive` | Issue Labeled | `issue.labels IN [stage:archive]`、`issue.labels NOT_IN [wip, blocked, question]` | 既定 | false |
| `<project> sweep` | Schedule | なし | 既定 | false |

Routine 本文は `issue-driven-sdd:routine-<役割> skill を読み、そのとおりに実行する` の 1 行。

sweep 間隔は許容復旧時間で決める。
worker と sweep には Claude Code Remote connector を付ける。
旧 `routine-retro` と `retro` ラベルはこの plugin の範囲外なので触らない。

PR 自動評価を導入する場合だけ `references/assess.md` を読み、label・skill・Routine を一式で作る。
assess の設定・本文も `claude-code-routines:manage-routines` に渡す。

# 3. 動作確認

捨て issue に `stage:todo` を付け、次を確認する。

1. dispatch が `stage:propose` を付け、propose が `wip` と PR を作る
2. `wip` で propose が再起動しない
3. Routine session から GitHub ラベルを操作できる
4. assess を入れた場合、PR 作成時に 1 本だけ起動する

共通 skill の設定・起動確認結果と合わせて判定する。最後に捨て issue を close し、`wip` が回収されるところまで見る。

# 4. custom skill

`assets/issue-driven-sdd-custom.SKILL.md` を対象 repo の
`.claude/skills/issue-driven-sdd-custom/SKILL.md` に置く。既存の内容は保ち、不足する節だけ足す。
`## routines` に id を保存し、それ以外は既定から外れる
点だけを書く。許容範囲は `routine-common/references/worker.md` の「プロジェクト固有の調整を読む」に従う。
worker は `origin/main` から読むため、merge 後に反映される。
