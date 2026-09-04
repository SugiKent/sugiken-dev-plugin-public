---
name: routine-apply
description: GitHub issue に stage:apply ラベルが付いたときに起動し、merge 済みの proposal に対応する openspec change を実装するスキル。実装が済んだら apply ラベルの PR を作って終える。Routine「Issue: Labeled = stage:apply」の本体。段階ラベルは routine-dispatch が付けるので、このスキルは段階ラベルを書かない。
---

まず同じ plugin の `routine-common` skill を読み、そのラベル規約・着手可否・PR の作り方に従う。

# 対象の特定

`routine-common` の「対象の特定」に従い、環境変数 `CCR_TRIGGER_ISSUE_NUMBER` から対象 issue を
読む。読めなければ推測せず、何が読めなかったかを報告して終える。

対象 issue の `Refs #n` を本文に持つ **merge 済みの `propose` ラベル PR** を探し、それを
proposal の正本とする。複数あれば最新の merge。見つからなければ issue へコメントして終える。
人が `stage:apply` を直接付けた強制起動でも同じ。

**このセッションで作る PR は 1 つ。**

# 1. 着手できるかを判定する

`routine-common` の「着手可否の判定」を上から順に見る。`blocked` か生きた `wip` が付いていれば
黙って終える。それ以外で見送るなら「見送りの書き戻し」に従い、`blocked-by:` を書いて終える。

このスキルで特に見るもの。

- merge 済み `propose` PR の本文 1 行目が `未確定の判断: 0 件` で、`question` が外れているか。
  満たさなければ `blocked-by: human` で書き戻す。未確定のまま実装してはならない。
- change の `tasks.md` の冒頭に「先行 change の archive を確認する」のような前提条件があれば、
  `origin/main` で満たされているか。満たされていなければ `blocked-by: change <name>` で書き戻す。
- 進行中の作業と同じ場所を触らないか（判定 5）。

着手すると決めたら `routine-common` の「`wip` のロック」に従い、**`wip` を外して付け直す**。

# 2. 実装する

`openspec-apply-change` の作法に従い、`origin/main` の change の `tasks.md` を上から実装する。

- 規模に応じて `orchestration:apply-backend` / `orchestration:apply-frontend` サブエージェントへ
  スライスを委譲してよい。実装の正本は各スキル。
- **完了したタスクだけ `[x]` にする。** 実行できなかった行はチェックしない。
- リポジトリのゲートを緑にする。型検査・lint・関連ユニットテスト・`openspec validate --strict`。
- **E2E を回すかは `routine-common` の「リポジトリの事情に従う」で決める。** 要求している
  リポジトリでは該当ケースを回し、要求していないリポジトリでは回さない。
- 画面に変化があり、リポジトリのスキルがスクリーンショットをアーティファクトで伝える方針なら、
  同じ節に従ってアーティファクトを作り、URL を PR 本文に載せる。
- **`.claude/rules/` の該当ルールを必ず読む。** 触ったファイルに紐づく検査コマンドが
  ルールに書いてあるなら、触るたびに回す。
- 実装中に「このセッションでは実行できない」タスク（本番実測・デプロイ後確認）が
  tasks に残っていると分かったら、**その行を tasks から外し、別 issue として起票する**。
  段階ラベルは付けない。archive を止めないための措置である。

# 3. PR を作って終える

`routine-common` の「PR の作り方」に従う。

- title: `[apply] #<n> <要約>`
- 本文に `Refs #n`（`Closes` は書かない）
- ラベル: `apply`
- auto-fix を有効化し、レビュー・会話コメントを文脈として扱う
- 作成直後に `mergeable_state` を確認する

PR を作った時点でセッションは完了。**merge を待たない。** `wip` は付けたままにする。
merge は `routine-dispatch` が受けて issue を `stage:archive` へ進め、`routine-archive` が起動する。

# レビュー指摘への対応

auto-fix により、この PR へのレビューコメントは同じセッションが受け取る。指摘を反映して
push し、何をどう直したかをスレッドへ返す（`<!-- routine -->` を付ける）。
設計に関わる曖昧な指摘は、勝手に決めずスレッドで確認する。
