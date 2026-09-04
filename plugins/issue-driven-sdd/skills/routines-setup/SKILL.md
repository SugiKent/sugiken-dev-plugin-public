---
name: routines-setup
description: issue-driven-sdd を新しいプロジェクトへ導入するときのセットアップ手順。ラベル作成コマンド・前提条件・Claude Code Routines 5 本の設定表・最初の 1 件での動作確認を実行する。手動起動。「issue-driven-sdd を導入して」「Routines をセットアップして」「ラベルを作って」等の依頼で使用する。ラベルの意味や運用規則は `routine-common` を参照。
---

# routines-setup

issue-driven-sdd の構成を対象プロジェクトへ一度だけ導入するための手順。日常の判断規則は `routine-common` に置き、こちらは初期セットアップのコマンド実行に限定する。

## 前提

`openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。無ければ先に導入する。

## 1. ラベルを作る

対象リポジトリを `gh repo view --json owner,name` で解決し、次の 9 個を作る。

```bash
gh label create "stage:propose" --color 0E8A16 --description "AIが着手開始する。人間が唯一手動でつけるラベル。"
gh label create "stage:apply"   --color 1D76DB --description "proposal PR が merge されると AI が自動で付ける。ここから実装が始まる。"
gh label create "stage:archive" --color 5319E7 --description "実装 PR が merge されると AI が自動で付ける。archive PR の merge で issue が閉じる。"
gh label create "wip"           --color FBCA04 --description "AI が作業中。人間は触らない。open PR が無いまま 3 時間経つか、前段階の merge より古ければ AI が外す。"
gh label create "propose" --color 0E8A16 --description "AI が付ける PR ラベル。openspec の proposal を追加する PR。merge すると実装が始まる。"
gh label create "apply"   --color 1D76DB --description "AI が付ける PR ラベル。実装の PR。merge すると archive が始まる。"
gh label create "archive" --color 5319E7 --description "AI が付ける PR ラベル。openspec archive の PR。merge すると issue が閉じる。"
gh label create "docs"    --color C5DEF5 --description "AI が付ける PR ラベル。.claude/ と docs/ だけを変える PR。merge しても次の段階は始まらない。"
gh label create "question" --color D876E3 --description "AI が付ける PR ラベル。人へ問うている未確定の判断が残っている PR。全部の回答が済むと AI が外す。"
```

既に一部が存在する場合、失敗したラベルだけスキップして残りを作る。ラベルの意味・付け外しの規則は `routine-common` を参照（ここでは作成コマンドだけを扱う）。

## 2. Routine 5 本を作る

| Name | Trigger | Filter | autofix_on_pr_create |
| --- | --- | --- | --- |
| `<project> propose` | Custom → `Issue: Labeled` | Labels contains `stage:propose` | **true** |
| `<project> apply` | `PR merged` | Labels contains `propose` | **true** |
| `<project> archive` | `PR merged` | Labels contains `apply` | false |
| `<project> sweep` | Schedule | なし | **true**（sweep 自身が propose を実行しうる） |
| `<project> assess-pr-risk` | `PR opened` | Labels contains `apply` または `archive` | false |

assess-pr-risk は **`apply` と `archive` ラベルの PR** を対象にする。`apply` は実装差分を持つ PR で、リスク評価の本来の対象。`archive` は AI が作る `Closes #n` 付きの PR で、merge されるまで issue が閉じない。ここに assess-pr-risk が走らないと、人間が archive PR を毎回手で merge することになる。propose / docs の PR には実装差分が無いので対象に含めない。フィルタなしだとそれらにもレビュー要否コメントが増える。

Filter に 2 つのラベルを指定できない UI なら、`<project> assess-pr-risk (apply)` と `<project> assess-pr-risk (archive)` の 2 本に分けて作る。

`autofix_on_pr_create` は Routine 単位の設定（API の `session_context`、UI にもトグル）。`true` の Routine が作った PR は、その PR を作ったセッションがレビュー・会話コメントを受け取り続ける。

schedule の sweep は Routines の schedule 機能から、イベント起動の 4 本は UI から作る。Routine 本文は 1 行だけにする。

```
`routine-propose` skill を読み、そのとおりに実行する。
```

判断規則はすべてスキル側に置き、Routine を作り直しても規則が失われないようにする。

## 3. 人間に Claude Routine の設定依頼を出す

表にして各 routine の設定内容を細かく指示する。表には Name / Trigger / **Filter** / `autofix_on_pr_create` / Routine 本文の 1 行を必ず含め、Filter が「なし」の routine と「Labels contains ...」の routine を取り違えないよう明示する。

特に assess-pr-risk については、**Filter に `apply` と `archive` の 2 つのラベルを設定すること**を依頼文に明記する。`apply` だけだと archive PR が評価されず、issue を閉じる merge を人間が毎回手で行うことになる。Filter なしだと propose / docs の PR にもリスク評価が走る。この 2 点を理由として 1〜2 行添える。UI が 1 ラベルしか受け付けない場合は 2 本に分けて設定するよう伝える。
