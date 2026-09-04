---
name: routine-apply
description: propose ラベルの PR が merge されたときに起動し、対応する issue を stage:apply へ進めて openspec change を実装するスキル。実装が済んだら apply ラベルの PR を作って終える。Routine「PR merged = propose」の本体。
---

まず同じ plugin の `routine-common` skill を読み、そのラベル規約・着手可否・PR の作り方に従う。

# 対象の特定

**対象はトリガーとなった PR。起動時の `github-trigger-context` に PR の ID が書かれている。**
これはセッション開始から遅れて届くので、`routine-common` の「`github-trigger-context` の待ち方」に
従って待ってから読み、対象を確定させる。待ちきっても読み取れない場合は、推測で対象を決めず、
何が読めなかったかを報告して終える（`routine-sweep` が後追いで拾う）。

起動条件は **`propose` ラベルの PR が merge されたこと**。その PR 本文の `Refs #n` から
対象 issue を引く。**このセッションで作る PR は 1 つ。**

# 1. merge された PR を検証する

- **本文 1 行目の「未確定の判断」が 0 件か。`question` ラベルが外れているか。** どちらか
  一方でも満たさないなら実装してはならない。
  issue へ「未確定のまま merge された」とコメントし、`stage:apply` を付けずに
  `stage:propose` のまま（既に外れていれば付け直して）終える。
- `Refs #n` が無いなら、PR の title と change の `proposal.md` から issue を探す。
  1 つの change が複数 issue を束ねることがあるので、`proposal.md` を `grep -a '#'` で全件見る。
  見つからなければ issue を触らず、PR へコメントして終える。

# 2. issue を進める

`origin/main` を取り直したうえで、対象 issue のラベルを付け替える。

```
stage:propose を外す → stage:apply を付ける（wip は付いたまま。無ければ付ける）
```

複数 issue を束ねた change なら**全件**同じ操作をする。付け替えたら読み直して確認する。

着手可否（`routine-common`）を改めて判定する。ここで見送るなら `wip` を外してからコメントする
（propose と違い、apply は他セッションが拾える状態に戻す）。

# 3. 実装する

`openspec-apply-change` の作法に従い、`origin/main` の change の `tasks.md` を上から実装する。

- 規模に応じて `orchestration:apply-backend` / `orchestration:apply-frontend` サブエージェントへ
  スライスを委譲してよい。実装の正本は各スキル。
- **完了したタスクだけ `[x]` にする。** 実行できなかった行はチェックしない。
- リポジトリのゲートを緑にする。型検査・lint・関連ユニットテスト・`openspec validate --strict`。
  E2E は基盤があれば該当ケースを回す。
- **`.claude/rules/` の該当ルールを必ず読む。** 触ったファイルに紐づく検査コマンドが
  ルールに書いてあるなら、触るたびに回す。
- 実装中に「このセッションでは実行できない」タスク（本番実測・デプロイ後確認）が
  tasks に残っていると分かったら、**その行を tasks から外し、別 issue として起票する**。
  段階ラベルは付けない。archive を止めないための措置である。

# 4. PR を作って終える

`routine-common` の「PR の作り方」に従う。

- title: `[apply] #<n> <要約>`
- 本文に `Refs #n`（`Closes` は書かない）
- ラベル: `apply`
- auto-fix を有効化し、レビュー・会話コメントを文脈として扱う
- 作成直後に `mergeable_state` を確認する

PR を作った時点でセッションは完了。**merge を待たない。** 次は `apply` ラベルの PR が
merge された時点で `routine-archive` が起動する。

# レビュー指摘への対応

auto-fix により、この PR へのレビューコメントは同じセッションが受け取る。指摘を反映して
push し、何をどう直したかをスレッドへ返す（`<!-- routine -->` を付ける）。
設計に関わる曖昧な指摘は、勝手に決めずスレッドで確認する。
