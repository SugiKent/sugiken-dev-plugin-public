---
name: routines-setup
description: issue-driven-sdd を対象プロジェクトへ導入する、または導入済みの設定を現在の規約に合わせて直す skill。GitHub のラベルと Claude Code Routines の現状を読み、あるべき状態との差分だけを直すので何度実行してもよい。手元の Claude Code セッションから手動で起動する。「issue-driven-sdd を導入して」「Routines をセットアップして」「Routine の設定を直して」「ラベルを作って」等の依頼で必ずこの skill を使う。
---

まず同じ plugin の `routine-common` skill を読み、ラベルの意味と書き手を把握する。

現状を読んでから差分だけを直す。初回導入も、規約が変わった後の追従も同じ手順で済む。
`gh` と Routines の API（`RemoteTrigger` ツール、または `/schedule`）が使える手元のセッションで実行する。

前提は 2 つ。`openspec` plugin（propose / apply / archive の実体）が対象プロジェクトに導入されていること。
Claude GitHub App がリポジトリに install されていること（無いと webhook が届かない）。

# 1. ラベルを揃える

`gh label list` で現状を読み、次の表と突き合わせる。無いラベルは作り、あるラベルは色と説明を直す。
説明文は `routine-common` の各表の「意味」列を使う。表に無い旧ラベルは人が使っている可能性があるので消さない。

| ラベル | 色 |
| --- | --- |
| `stage:todo` | `BFDADC` |
| `stage:propose` | `0E8A16` |
| `stage:apply` | `1D76DB` |
| `stage:archive` | `5319E7` |
| `wip` | `FBCA04` |
| `blocked` | `B60205` |
| `propose` | `0E8A16` |
| `apply` | `1D76DB` |
| `archive` | `5319E7` |
| `docs` | `C5DEF5` |
| `question` | `D876E3` |
| `ai-assess:requested` | `F9D0C4` |

# 2. Routine を揃える

既存の Routine は、対象リポジトリの `.claude/skills/issue-driven-sdd-custom/SKILL.md` の `## routines` 節に
控えた id を `RemoteTrigger get` で読む。控えが無ければ `RemoteTrigger list` を名前 `<project> <役割>` で探すが、
`list` は 1 ページ目しか返さず（cursor を渡しても同じページが返る。2026-09-11 実測）、worker が自分で作った
リマインダー等で 1 ページ目が埋まると本物の Routine が出てこない。見つからなければ `claude.ai/code/routines` の
UI で id を確かめる。**作った・見つけた Routine の id は必ず `## routines` 節に書き戻す**（雛形は `assets/`）。
無ければ作り、あれば本文・model・`autofix_on_pr_create`・トリガーを表に合わせて直す。
旧構成の Routine は消さずにトリガーを付け替える。

| Name | Trigger | Filter | model | autofix_on_pr_create |
| --- | --- | --- | --- | --- |
| `<project> dispatch` | `Issue: Labeled` | `issue.labels IN [stage:todo]` かつ `NOT_IN [blocked]` | sonnet | false |
| 同上 | `Issue: Closed` | なし | | |
| 同上 | `PR closed` | `pr.merged = true` かつ `pr.labels IN [propose]` | | |
| 同上 | `PR closed` | `pr.merged = true` かつ `pr.labels IN [apply]` | | |
| `<project> propose` | `Issue: Labeled` | `issue.labels IN [stage:propose]` かつ `NOT_IN [wip, blocked, question]` | 既定 | **true** |
| `<project> apply` | `Issue: Labeled` | `issue.labels IN [stage:apply]` かつ `NOT_IN [wip, blocked, question]` | 既定 | **true** |
| `<project> archive` | `Issue: Labeled` | `issue.labels IN [stage:archive]` かつ `NOT_IN [wip, blocked, question]` | 既定 | false |
| `<project> sweep` | Schedule | なし | 既定 | false |

**`NOT_IN` は必ず付ける。** `Issue: Labeled` のフィルターは「追加されたラベル」ではなく「操作後の issue の
ラベル集合」で判定される（2026-09-07 実測）。`NOT_IN` が無いと、worker が自分で `wip` を付けた瞬間に
同じ段階の worker がもう 1 本起動し、1 日の worker の半分が無駄になる。`NOT_IN` があれば、`wip` /
`blocked` / `question` を付ける書き込みは何も起動しない。

本文は `` `routine-<役割>` skill を読み、そのとおりに実行する `` の 1 行だけにする。判断規則をすべて
skill 側に置けば、Routine を作り直しても規則が失われない。skill のパスは導入方法に応じて読み替える。

- dispatch は 4 つのトリガーを 1 本に付ける。UI が 1 本 1 トリガーしか許さないなら、本文が同じ Routine を
  `<project> dispatch (todo)` のように 4 本作る。
- sweep の間隔は、dispatch が落ちてから拾われるまでの許容時間でプロジェクトごとに決める。
- `autofix_on_pr_create` が true の Routine が作った PR は、そのセッションがレビューと会話コメントを
  受け取り続ける。grill の往復はこれに乗る。archive は PR を作って終わるだけなので false。
- worker と sweep の Routine には `mcp_connections` に **Claude Code Remote コネクタ**（`Claude_Code_Remote`、
  `https://api.anthropic.com/v1/code/mcp/meta`）を付ける。worker が自分の session id を着手コメントに書き、
  sweep が `get_session` で生存を判定するのに要る。GitHub コネクタは Routine に暗黙で付く。
- `retro`（振り返り点検）はこの plugin の対象外。旧構成の `routine-retro` や `retro` ラベルは触らない。

**このコネクタは `claude.ai/code/routines` の UI から追加できない**（2026-09-07 実測）。UI で編集して保存す
ると成功したように見えるが、API から読み直しても `mcp_connections` に `Claude_Code_Remote` は増えていない。
`RemoteTrigger action=update` に `mcp_connections` だけを送って付ける。

```json
{"mcp_connections": [
  <その Routine の現在の mcp_connections 全要素>,
  {"clear_tool_policy_overrides": false,
   "connector_uuid": "<同じアカウントの既存 Routine から name が Claude_Code_Remote の要素をコピー>",
   "name": "Claude_Code_Remote",
   "permitted_tools": [],
   "tool_policy_overrides": [],
   "transport_type": "http",
   "url": "https://api.anthropic.com/v1/code/mcp/meta"}
]}
```

現在値を `action=get` で読み、末尾に足した配列全体を送る（部分更新ではなく置換）。このフィールドだけを送れ
ば `enabled` / model / `autofix_on_pr_create` / トリガー / 本文は巻き込まれない。`connector_uuid` はアカウ
ントごとに異なるので、同じアカウントの既存 Routine を `action=get` して `mcp_connections` からコピーする。

## webhook トリガーを API で作るとき

UI の代わりに `RemoteTrigger create_webhook_trigger` で付ける場合の body。webhook トリガーは `list` /
`get` で読めないので、既に付いているかは `list_runs` の起動イベントか UI で確かめる。

```json
{"routine_trigger_id": "trig_…", "hook_type": "app", "source": "github", "scope_id": "owner/repo",
 "events": ["issues.labeled"],
 "filter": {"clauses": [
   {"field": "issue.labels", "op": "FILTER_OP_IN", "values": ["stage:propose"]},
   {"field": "issue.labels", "op": "FILTER_OP_NOT_IN", "values": ["wip", "blocked", "question"]}]}}
```

| 項目 | 使えるもの |
| --- | --- |
| `events` | `issues.labeled`、`issues.closed`、`pull_request.opened`、`pull_request.closed`、`pull_request.labeled` |
| `field` | `issue.labels`、`pr.labels`、`pr.merged` の 3 つだけ。「追加されたラベル」を指す field は無い |
| `op` | `FILTER_OP_IN`（is one of）、`FILTER_OP_NOT_IN`（is not one of）、`FILTER_OP_EQ`（equals） |
| 複数 clause | AND |

**イベント名は API が検証しない。** typo しても登録は成功し、黙って一度も起動しない。上の表と突き合わせる。

## PR の自動評価は任意

PR のリスクを AI が評価して低ければ merge する仕組みは、issue-driven の流れを速めるだけで、段階の遷移には
関わらない。routine 群はその存在を前提にしない。欲しければプロジェクトごとに `assess-pr-risk` という
名前の skill を `.claude/skills/` に作り、次の Routine から呼ぶ。

| Name | Trigger | Filter | autofix_on_pr_create |
| --- | --- | --- | --- |
| `<project> assess` | `PR labeled` | `pr.labels IN [ai-assess:requested]` | false |

`PR opened` は使わない。worker は PR を作ってからラベルを付けるので、`PR opened` + ラベル条件は成立しない
（作成と同時にラベルが付く場合だけ起動し、そのときは `PR labeled` と二重に起動する）。

作るときに守らせるのは次の 4 つ。起動元の PR（`CCR_TRIGGER_PR_NUMBER`、`CCR_TRIGGER_HEAD_SHA`）だけを
評価し、他の open PR を見に行かない。評価を終えたら `ai-assess:requested` を外す（外すだけの書き込みは
何も起動しない）。`question` が付いた PR は merge しない。コメントは `<!-- routine -->` で始める。
導入時にこの選択肢があることを利用者へ伝える。

# 3. 動作を確認する

捨て issue を 1 件作り、`stage:todo` を付けて次を見る。

1. dispatch が起動し、issue が `stage:propose` に変わる
2. propose が起動し、`wip` が付き、propose PR ができる
3. **`wip` が付いた時点で propose がもう 1 本起動していない**。起動していれば `NOT_IN` が抜けている
4. Routine のセッションから GitHub コネクタでラベルを付け外しできる
5. 各 Routine の本文にある skill 名が、そのセッションで解決する（`Unknown command` で 0 turn 終了していない）
6. propose PR ができた時点で assess（作っていれば）が **1 本だけ**起動している。2 本なら worker が
   `[propose, ai-assess:requested]` を 1 回で書いている
7. worker と sweep の `mcp_connections` に `Claude_Code_Remote` が入っている。`action=get` で読んで確かめる
   （UI の見た目では判定できない）

起動の有無は `RemoteTrigger list_runs` で見る。発火が拒否された run は一覧に残らないので、一覧が空でも
Routine が無効とは限らず、`get` で `enabled` を確かめる。確認が済んだら捨て issue を閉じ、`wip` が
dispatch に回収されることまで見る。

# 4. プロジェクト固有の調整を置く（任意）

`assets/issue-driven-sdd-custom.SKILL.md` を `.claude/skills/issue-driven-sdd-custom/SKILL.md` として置く。
`## routines` 節は手順 2 で控えた Routine の id を持つので常に作る。それ以外の節は plugin の既定から
外れる点だけを書き、空の節は「既定どおり」を意味する。書けること・書けないことは `references/worker.md` の「プロジェクト固有の調整を読む」にある。
worker は `origin/main` から読むので、**main へ merge されるまで効かない。**
