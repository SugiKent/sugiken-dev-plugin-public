---
name: routines-setup
description: issue-label-driven を対象プロジェクトへ導入し、GitHub のラベル 5 本と Claude Code Routines 3 本を現行規約へ合わせる。「issue-label-driven を導入して」「Routines をセットアップして」「Routine の設定を直して」「ラベルを作って」等の依頼で使う。
---

同じ plugin の `routine-common` を読む。現状を取得し、差分だけを直す。前提は Claude GitHub App と
`claude-code-routines` plugin が対象プロジェクトで使えること。未導入なら
`claude plugin install claude-code-routines@sugiken-dev-public` で導入する。

# 1. ラベルを揃える

`gh label list` と突き合わせ、不足を作り、既存の色と説明を揃える。説明は `routine-common` のラベル表を使い、
表にないラベルは消さない。

| ラベル | 色 |
| --- | --- |
| `To Do` | `BFDADC` |
| `In Progress` | `1D76DB` |
| `Done` | `0E8A16` |
| `blocked` | `B60205` |
| `question` | `D876E3` |

# 2. custom skill を置く

`assets/issue-label-driven-custom.SKILL.md` を対象 repo の
`.claude/skills/issue-label-driven-custom/SKILL.md` に置く。既存ファイルがあれば内容を保ち、不足する
`## routines` と表だけを足す。

`## routines` は Routine id の記録先なので、固有の調整がなくても常に置く。`## 共通` / `## work` には plugin の
既定から外れる点だけを書き、空なら既定どおりとする。worker は `origin/main` から読むため、調整は merge 後に効く。

# 3. Routines を揃える

`claude-code-routines:manage-routines` を使い、次の設定を対象 repo に適用する。共通 skill に渡す repository は
対象 repo の `owner/name`、既存 id の記録先は
`.claude/skills/issue-label-driven-custom/SKILL.md` の `## routines` とする。作成・発見した id は毎回そこへ保存する。

| role | name | trigger | filter | model | autofix | prompt | Claude Code Remote |
| --- | --- | --- | --- | --- | --- | --- | --- |
| work | `<project> work` | Issue Labeled | `issue.labels IN [To Do]`、`issue.labels NOT_IN [In Progress, blocked, question]` | 既定 | true | `` `issue-label-driven:routine-work` skill を読み、そのとおりに実行する `` | 必要 |
| dispatch | `<project> dispatch` | Issue Closed | なし | sonnet | false | `` `issue-label-driven:routine-dispatch` skill を読み、そのとおりに実行する `` | 不要 |
| sweep | `<project> sweep` | Schedule | なし | 既定 | false | `` `issue-label-driven:routine-sweep` skill を読み、そのとおりに実行する `` | 必要 |

`NOT_IN` は、ラベル追加時に work が自己再起動するのを防ぐ。PR closed trigger は作らない。PR の `Closes #n` による
issue close を dispatch の唯一の入口にする。sweep の間隔は、停止 worker を回収するまでの許容時間として利用者が
指定した値を渡す。指定がなければ既存値を保ち、新規作成なら利用者に確認する。

# 4. workflow を確認する

共通 skill の結果から、3 本の Routine が enabled で、表どおりの trigger / filter / model / autofix / prompt を持ち、
work と sweep に Claude Code Remote connector があることを確認する。

捨て issue に `To Do` を付け、次を 1 周確認する。

1. work が 1 本だけ起動し、`started:` / `session:` コメントと `In Progress` が付く
2. `In Progress` の書き込みで work が再起動しない
3. `#n` を title、`Closes #n` を本文に持つ PR ができる
4. PR merge で issue が閉じ、dispatch が `Done` を付ける
5. 各 prompt の namespaced skill が解決する
6. work / sweep が Claude Code Remote の session 操作を行える

確認できない項目は成功扱いにせず、対象 Routine と観測結果を報告する。

# 5. PR の自動評価は任意

PR のリスクを AI が評価して低ければ merge する仕組みは plugin に含めない。必要ならプロジェクト側に
`assess-pr-risk` skill と、`PR Labeled` = `ai-assess:requested` で起動する Routine を作り、その設定も
`claude-code-routines:manage-routines` に渡す。`question` が付いた PR は merge せず、routine のコメントは
`<!-- routine -->` で始める。
