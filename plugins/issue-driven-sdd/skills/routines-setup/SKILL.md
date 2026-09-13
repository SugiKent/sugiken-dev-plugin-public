---
name: routines-setup
description: 'issue-driven-sdd を導入し、GitHub ラベルと Claude Code Routines を現行規約へ合わせる。「Routines をセットアップして」「ラベルを作って」で使う。'
---

`routine-common` を読む。現状を取得し、差分だけを直す。前提は OpenSpec plugin と Claude GitHub App。

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

custom skill の `## routines` にある id を `RemoteTrigger get` で読む。id が無ければ名前で list し、見つからなければ
UI で確認する。作成・発見した id は必ず custom skill へ保存する。無ければ作成し、あれば表との差分を直す。
旧 Routine は削除せず trigger を付け替える。API 操作の詳細が必要なときだけ `references/routines-api.md` を読む。

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

Issue Labeled は操作後のラベル集合を見るため、`NOT_IN` が worker の自己再起動を防ぐ。Routine 本文は
`routine-<役割> skill を読み、そのとおりに実行する` の 1 行だけにする。

dispatch は 4 trigger を 1 本に付ける。UI が許さなければ同じ本文の 4 本に分ける。sweep 間隔は許容復旧時間で決める。
worker と sweep には Claude Code Remote connector を付ける。
旧 `routine-retro` と `retro` ラベルはこの plugin の範囲外なので触らない。

PR 自動評価を導入する場合だけ `references/assess.md` を読み、label・skill・Routine を一式で作る。

# 3. 動作確認

捨て issue に `stage:todo` を付け、次を確認する。

1. dispatch が `stage:propose` を付け、propose が `wip` と PR を作る
2. `wip` で propose が再起動しない
3. Routine session から GitHub ラベルを操作できる
4. Routine 本文の skill 名が解決する
5. assess を入れた場合、PR 作成時に 1 本だけ起動する
6. worker / sweep の `mcp_connections` に Claude Code Remote がある

run の有無は `list_runs`、Routine の有効状態は `get` で確認する。最後に捨て issue を close し、`wip` が回収される
ところまで見る。

# 4. custom skill

`assets/issue-driven-sdd-custom.SKILL.md` を対象 repo の
`.claude/skills/issue-driven-sdd-custom/SKILL.md` に置く。`## routines` に id を保存し、それ以外は既定から外れる
点だけを書く。許容範囲は `routine-common/references/worker.md` の「プロジェクト固有の調整を読む」に従う。
worker は `origin/main` から読むため、merge 後に反映される。
