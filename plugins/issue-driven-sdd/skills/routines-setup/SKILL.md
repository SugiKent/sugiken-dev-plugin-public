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

# 2. Routine を揃える

`RemoteTrigger list` で既存の Routine を読み、名前 `<project> <役割>` で次の表と対応付ける。
無ければ作り、あれば本文・model・`autofix_on_pr_create`・トリガーを表に合わせて直す。
旧構成の Routine は消さずにトリガーを付け替える。

| Name | Trigger | Filter | model | autofix_on_pr_create |
| --- | --- | --- | --- | --- |
| `<project> dispatch` | `Issue: Labeled` / `Issue: Closed` / `PR merged` / `PR merged` | `stage:todo` / なし / `propose` / `apply` | sonnet | false |
| `<project> propose` | `Issue: Labeled` | `stage:propose` | 既定 | **true** |
| `<project> apply` | `Issue: Labeled` | `stage:apply` | 既定 | **true** |
| `<project> archive` | `Issue: Labeled` | `stage:archive` | 既定 | false |
| `<project> sweep` | Schedule | なし | 既定 | false |

本文は `` `routine-<役割>` skill を読み、そのとおりに実行する `` の 1 行だけにする。判断規則をすべて
skill 側に置けば、Routine を作り直しても規則が失われない。skill のパスは導入方法に応じて読み替える。

- dispatch は 4 つのトリガーを 1 本に付ける。UI が 1 本 1 トリガーしか許さないなら、本文が同じ Routine を
  `<project> dispatch (todo)` のように 4 本作る。
- sweep の間隔は、dispatch が落ちてから拾われるまでの許容時間でプロジェクトごとに決める。
- `autofix_on_pr_create` が true の Routine が作った PR は、そのセッションがレビューと会話コメントを
  受け取り続ける。grill の往復はこれに乗る。
- webhook トリガーの一覧は API で読めない。`list_runs` で起動しているイベントを確認し、足りないものは
  `create_webhook_trigger` か UI で足す。UI でしか設定できない項目は表にして人へ依頼し、Filter が
  「なし」の行と「Labels contains」の行を取り違えないよう明示する。
- `retro`（振り返り点検）はこの plugin の対象外。旧構成の `routine-retro` や `retro` ラベルは触らない。

## PR の自動 merge は任意

PR のリスクを評価して低ければ merge する仕組みは、issue-driven の流れを速めるだけで、段階の遷移には
関わらない。routine 群はその存在を前提にしない。欲しければプロジェクトごとに `assess-pr-risk` という
名前の skill を `.claude/skills/` に作り、`PR opened` ∧ label `apply` または `archive` の Routine から
呼ぶ。作るときに守らせるのは次の 3 つ。コメントは `<!-- routine -->` で始める（worker がそれを人の
入力と誤読しないため）。`question` が付いた PR は merge しない。grill を経た `propose` PR は自動 merge
しない。導入時にこの選択肢があることを利用者へ伝える。

# 3. 動作を確認する

捨て issue を 1 件作り、`stage:todo` を付けて次を見る。

1. dispatch が起動し、issue が `stage:propose` に変わる
2. propose が起動し、`wip` が付き、propose PR ができる
3. 同じイベントで propose が 2 本以上起動していないか。起動していれば `references/worker.md` の
   「`wip` のロック」にある後発撤退が効いているかを run log で見る
4. Routine のセッションから GitHub コネクタでラベルを付け外しできる

起動の有無は `RemoteTrigger list_runs` で見る。発火が拒否された run は一覧に残らないので、一覧が空でも
Routine が無効とは限らず、`get` で `enabled` を確かめる。確認が済んだら捨て issue を閉じ、`wip` が
dispatch に回収されることまで見る。

# 4. プロジェクト固有の調整を置く（任意）

plugin の既定から外れることが 1 つも無ければ作らない。あるときだけ `assets/issue-driven-sdd-custom.SKILL.md`
を `.claude/skills/issue-driven-sdd-custom/SKILL.md` として置き、外れる点だけを書く。空の節は
「既定どおり」を意味する。書けること・書けないことは `references/worker.md` の「プロジェクト固有の調整を読む」にある。
worker は `origin/main` から読むので、**main へ merge されるまで効かない。**
