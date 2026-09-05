---
name: routines-setup
description: issue-driven-sdd を対象プロジェクトへ導入する、または導入済みの設定を現在の規約に合わせて直すスキル。GitHub のラベルと Claude Code Routines の現状を読み取り、あるべき状態との差分だけを直す。何度実行しても同じ結果になる。手動起動。「issue-driven-sdd を導入して」「Routines をセットアップして」「Routine の設定を直して」「ラベルを作って」等の依頼で使用する。ラベルの意味や運用規則は `routine-common` を参照。
---

# routines-setup

issue-driven-sdd の構成を対象プロジェクトに揃える。**現状を読んでから差分だけを直す。**
初回導入も、規約が変わった後の追従も、同じ手順で済む。日常の判断規則は `routine-common` に置き、
こちらは設定の突き合わせに限定する。

手元の Claude Code セッションで実行する前提。`gh` と Routines の API（`RemoteTrigger` ツール、
または `/schedule`）が使える。Routine のセッションからは実行しない。

## 前提

`openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。
無ければ先に導入する。Claude GitHub App がリポジトリに install されていること。無いと webhook が届かない。

## 1. ラベルを揃える

`gh label list` で現状を読み、次の表と突き合わせる。無いラベルは作り、あるラベルは色と説明を
表に合わせて直す。表に無い旧ラベルは消さない（人が使っている可能性がある）。

| ラベル | 色 | 説明 |
| --- | --- | --- |
| `stage:todo` | `BFDADC` | 人が付ける唯一のラベル。承認済みで着手の順番待ち。AI が順番を決めて次へ進める |
| `stage:propose` | `0E8A16` | AI が付ける。proposal を作っている段階。人が直接付けると順番を飛ばして即着手する |
| `stage:apply` | `1D76DB` | AI が付ける。proposal PR が merge され、実装している段階 |
| `stage:archive` | `5319E7` | AI が付ける。実装 PR が merge され、archive している段階。archive PR の merge で issue が閉じる |
| `wip` | `FBCA04` | AI が作業中。人間は触らない。open PR が無いまま 3 時間経つか、前段階の merge より古ければ AI が外す |
| `blocked` | `B60205` | 宣言されたブロッカーが解けるまで AI は着手しない。理由は最新の blocked-by コメントにある。人が外すときは段階ラベルを付け直す |
| `propose` | `0E8A16` | AI が付ける PR ラベル。openspec の proposal を追加する PR。merge すると実装が始まる |
| `apply` | `1D76DB` | AI が付ける PR ラベル。実装の PR。merge すると archive が始まる |
| `archive` | `5319E7` | AI が付ける PR ラベル。openspec archive の PR。merge すると issue が閉じる |
| `docs` | `C5DEF5` | AI が付ける PR ラベル。.claude/ と docs/ だけを変える PR。merge しても次の段階は始まらない |
| `question` | `D876E3` | AI が付ける PR ラベル。人へ問うている未確定の判断が残っている PR。全部の回答が済むと AI が外す |

## 2. Routine を揃える

`RemoteTrigger list` で既存の Routine を読み、名前 `<project> <役割>` で次の表と対応付ける。
無ければ作り、あれば本文・model・`autofix_on_pr_create`・トリガーを表に合わせて直す。
旧構成の Routine（`PR merged` で apply / archive を起動していたもの）は、消さずにトリガーを
付け替える。

**`retro`（振り返り点検）は issue-driven-sdd の対象外。** 旧構成で `routine-retro` のような
Routine を運用していた場合、この表に付け替え先が無い。消さずに各プロジェクトが独自に運用を
続ける。対応する `retro` ラベルも同様に対象外で、このスキルは作成も削除もしない。

| Name | Trigger | Filter | model | autofix_on_pr_create | 本文 |
| --- | --- | --- | --- | --- | --- |
| `<project> dispatch` | `Issue: Labeled` / `Issue: Closed` / `PR merged` / `PR merged` | `stage:todo` / なし / `propose` / `apply` | sonnet | false | `routine-dispatch` skill を読み、そのとおりに実行する |
| `<project> propose` | `Issue: Labeled` | `stage:propose` | 既定 | **true** | `routine-propose` skill を読み、そのとおりに実行する |
| `<project> apply` | `Issue: Labeled` | `stage:apply` | 既定 | **true** | `routine-apply` skill を読み、そのとおりに実行する |
| `<project> archive` | `Issue: Labeled` | `stage:archive` | 既定 | false | `routine-archive` skill を読み、そのとおりに実行する |
| `<project> sweep` | Schedule | なし | 既定 | false | `routine-sweep` skill を読み、そのとおりに実行する |
| `<project> assess-pr-risk` | `PR opened` | `apply` または `archive` | 既定 | false | `assess-pr-risk` skill を読み、そのとおりに実行する |

- dispatch は 4 つのトリガーを 1 本の Routine に付ける。UI が 1 本 1 トリガーしか許さないなら
  `<project> dispatch (todo)` のように本文が同じ Routine を 4 本作る。
- sweep の間隔はプロジェクトごとに決める。dispatch が落ちたときの保険なので、
  落ちてから拾われるまでの許容時間で決める。
- `autofix_on_pr_create` が true の Routine が作った PR は、その PR を作ったセッションが
  レビュー・会話コメントを受け取り続ける。grill の往復はこれに乗せる。
- 本文は 1 行だけにする。判断規則はすべてスキル側に置き、Routine を作り直しても規則が失われない
  ようにする。skill のパスは導入方法に応じて読み替える。
- webhook トリガーの一覧は API で読めない。既存 Routine の `list_runs` で起動しているイベントを
  確認し、足りないトリガーは `create_webhook_trigger` か UI で足す。UI でしか設定できない項目は
  設定内容を表にして人へ依頼する。Filter が「なし」の行と「Labels contains」の行を取り違えないよう明示する。

## 3. 動作を確認する

捨て issue を 1 件作り、`stage:todo` を付けて次を見る。

1. dispatch が起動し、issue が `stage:propose` に変わる
2. propose が起動し、`wip` が付き、propose PR ができる
3. 同じイベントで propose が 2 本以上起動していないか。起動していれば `routine-common` の
   「ラベルの書き手」にある後発撤退が効いているかを run log で見る
4. Routine のセッションから GitHub コネクタでラベルを付け外しできる

起動の有無は `RemoteTrigger list_runs` で見る。発火が拒否された run は一覧に残らないので、
一覧が空でも Routine が無効とは限らない。`get` で `enabled` を確かめる。

確認が済んだら捨て issue を閉じ、`wip` が dispatch に回収されることまで見る。

## 4. プロジェクト固有の調整を置く（任意）

plugin の既定から外れることが 1 つも無ければ作らない。あるときだけ
`.claude/skills/issue-driven-sdd-custom/SKILL.md` を作り、外れる点だけを書く。
worker は `routine-common` を読んだ直後にこのファイルを `origin/main` から読む。
**main へ merge されるまで効かない。** 手元に作っただけで 3 の動作確認をしても何も変わらない。
書けること・書けないこと（不変条件）は `routine-common` の「プロジェクト固有の調整を読む」にある。

```markdown
---
name: issue-driven-sdd-custom
description: issue-driven-sdd plugin の routine がこのプロジェクトで従う固有の調整。routine-common が読む。単独では実行しない。
disable-model-invocation: true
---

## 共通

（E2E の要否、スクリーンショットの方針、アーティファクトの作り先、着手してはいけない領域、教訓の書き残し先など）

## propose

## apply

## archive
```

節は空のままでよい。空の節は「既定どおり」を意味する。
