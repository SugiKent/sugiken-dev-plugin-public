---
name: routines-setup
description: issue-label-driven を対象プロジェクトへ導入する、または導入済みの設定を現在の規約に合わせて直す skill。GitHub のラベル 5 本と Claude Code Routines 3 本の現状を読み、あるべき状態との差分だけを直すので何度実行してもよい。手元の Claude Code セッションから手動で起動する。「issue-label-driven を導入して」「To Do / In Progress / Done で回す Routines をセットアップして」「Routine の設定を直して」「ラベルを作って」等の依頼で必ずこの skill を使う。
---

まず同じ plugin の `routine-common` skill を読み、ラベルの意味と遷移表を把握する。

現状を読んでから差分だけを直す。初回導入も、規約が変わった後の追従も同じ手順で済む。
`gh` と Routines の API（`RemoteTrigger` ツール、または `/schedule`）が使える手元のセッションで実行する。
前提は Claude GitHub App がリポジトリに install されていること（無いと webhook が届かない）。

# 1. ラベルを揃える

`gh label list` で現状を読み、次の表と突き合わせる。無いラベルは作り、あるラベルは色と説明を直す。
説明文は `routine-common` のラベル表の「意味」列を使う。表に無いラベルは人が使っている可能性があるので消さない。
`question` は GitHub の既定ラベルとして最初からあることが多い。

| ラベル | 色 |
| --- | --- |
| `To Do` | `BFDADC` |
| `In Progress` | `1D76DB` |
| `Done` | `0E8A16` |
| `blocked` | `B60205` |
| `question` | `D876E3` |

# 2. Routine を揃える

`RemoteTrigger list` で既存の Routine を読み、名前 `<project> <役割>` で次の表と対応付ける。
無ければ作り、あれば本文・model・`autofix_on_pr_create`・トリガーを表に合わせて直す。

| Name | Trigger | Filter | model | autofix_on_pr_create |
| --- | --- | --- | --- | --- |
| `<project> work` | `Issue: Labeled` | `issue.labels IN [To Do]` かつ `NOT_IN [In Progress, blocked, question]` | 既定 | **true** |
| `<project> dispatch` | `Issue: Closed` | なし | sonnet | false |
| `<project> sweep` | Schedule | なし | 既定 | false |

**`NOT_IN` は必ず付ける。** `Issue: Labeled` のフィルターは「追加されたラベル」ではなく「操作後の issue の
ラベル集合」で判定される。遷移表どおりなら `To Do` と他の規約ラベルは同居しないが、人が `To Do` の issue に
ラベルを足した瞬間の再起動を `NOT_IN` が抑える。

本文は `` `routine-<役割>` skill を読み、そのとおりに実行する `` の 1 行だけにする。判断規則をすべて
skill 側に置けば、Routine を作り直しても規則が失われない。skill のパスは導入方法に応じて読み替える。

- `PR closed` トリガーは要らない。PR の `Closes #n` で GitHub が issue を閉じ、`Issue: Closed` の 1 経路に集約する。
- sweep の間隔は、worker が死んでから拾われるまでの許容時間でプロジェクトごとに決める。
- work と sweep の Routine には `mcp_connections` に **Claude Code Remote コネクタ**（`Claude_Code_Remote`、
  `https://api.anthropic.com/v1/code/mcp/meta`）を付ける。worker が自分の session id を着手コメントに書き、
  sweep が `get_session` で生存を判定するのに要る。GitHub コネクタは Routine に暗黙で付く。

**このコネクタは `claude.ai/code/routines` の UI から追加できない。** UI で保存しても API から読み直すと
`mcp_connections` に増えていない。`RemoteTrigger action=update` に `mcp_connections` だけを送って付ける。

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

現在値を `action=get` で読み、末尾に足した配列全体を送る（部分更新ではなく置換）。`connector_uuid` は
アカウントごとに異なるので、同じアカウントの既存 Routine から `action=get` でコピーする。

## webhook トリガーを API で作るとき

UI の代わりに `RemoteTrigger create_webhook_trigger` で付ける場合の body。webhook トリガーは `list` /
`get` で読めないので、既に付いているかは `list_runs` の起動イベントか UI で確かめる。

```json
{"routine_trigger_id": "trig_…", "hook_type": "app", "source": "github", "scope_id": "owner/repo",
 "events": ["issues.labeled"],
 "filter": {"clauses": [
   {"field": "issue.labels", "op": "FILTER_OP_IN", "values": ["To Do"]},
   {"field": "issue.labels", "op": "FILTER_OP_NOT_IN", "values": ["In Progress", "blocked", "question"]}]}}
```

dispatch は `"events": ["issues.closed"]` で `filter` なし。`field` は `issue.labels` / `pr.labels` / `pr.merged`
の 3 つだけ、`op` は `FILTER_OP_IN` / `FILTER_OP_NOT_IN` / `FILTER_OP_EQ`、複数 clause は AND。
**イベント名は API が検証しない。** typo しても登録は成功し、黙って一度も起動しない。

# 3. 動作を確認する

捨て issue を 1 件作り、`To Do` を付けて 1 周させる。

1. work が **1 本だけ**起動し、`started:` / `session:` コメントが付き、ラベルが `In Progress` に変わる
2. **`In Progress` が付いた時点で work がもう 1 本起動していない**。起動していれば `NOT_IN` が抜けている
3. `#n` を title に持ち `Closes #n` を本文に持つ PR ができる
4. PR を merge すると issue が閉じ、dispatch が起動して `Done` が付く
5. 各 Routine の本文にある skill 名が、そのセッションで解決する（`Unknown command` で 0 turn 終了していない）
6. work と sweep の `mcp_connections` に `Claude_Code_Remote` が入っている。`action=get` で読んで確かめる

起動の有無は `RemoteTrigger list_runs` で見る。発火が拒否された run は一覧に残らないので、一覧が空でも
Routine が無効とは限らず、`get` で `enabled` を確かめる。

# 4. プロジェクト固有の調整を置く（任意）

plugin の既定から外れることが 1 つも無ければ作らない。あるときだけ `assets/issue-label-driven-custom.SKILL.md`
を `.claude/skills/issue-label-driven-custom/SKILL.md` として置き、外れる点だけを書く。空の節は
「既定どおり」を意味する。書けること・書けないことは `routine-common` の「プロジェクト固有の調整を読む」にある。
worker は `origin/main` から読むので、**main へ merge されるまで効かない。**

# 5. PR の自動評価は任意

PR のリスクを AI が評価して低ければ merge する仕組みは plugin に含めない。欲しければプロジェクトごとに
`assess-pr-risk` skill と、`PR labeled` = `ai-assess:requested` で起動する Routine を作る。`question` が付いた
PR は merge しない、コメントは `<!-- routine -->` で始める、の 2 つを守らせる。
