---
name: routine-apply
description: Routine「Issue: Labeled = stage:apply」の本文から呼ばれる skill。merge 済み proposal に対応する openspec change を実装し、apply ラベルの PR を作って終える。手動で「issue #n を実装して」「#n の change を apply して」と言われたときもこの skill を使う。段階ラベルは書かない。
---

まず同じ plugin の `routine-common` skill と、その `references/worker.md` を読む。

# 1. 対象と着手可否

`worker.md` の「対象の特定」で issue を決める。対象 issue を `Refs #n` に持つ**merge 済みの `propose` PR**
を探し、それを proposal の正本とする。複数あれば最新の merge。無ければ issue へコメントして終える。

「着手可否の判定」を上から見る。この段階で特に見るもの。

- proposal PR の本文 1 行目が `未確定の判断: 0 件` で `question` が外れているか。満たさなければ
  `blocked-by: human`。未確定のまま実装しない。
- change の `tasks.md` の前提条件と、進行中の作業との衝突（判定 4 と 5）。

見送るなら「見送りの書き戻し」で終え、着手するなら「着手の印」を付ける。

# 2. 実装する

`openspec-apply-change` Skill を必ず起動し、その手順で `origin/main` の change の `tasks.md` を
上から実装する。規模に応じて `orchestration:apply-backend` / `orchestration:apply-frontend` へ
スライスを委譲してよい。

- 完了したタスクだけ `[x]` にする。
- リポジトリのゲート（型検査・lint・関連テスト・`openspec validate --strict`）と `.claude/rules/` の
  該当ルールを緑にする。E2E とスクリーンショットは `worker.md` の「リポジトリの事情に従う」で決める。
- このセッションで実行できないタスク（本番実測・デプロイ後確認）が残っていたら、その行を tasks から
  外して別 issue として起票する（`worker.md` の「残作業を別 issue にするとき」）。archive を止めないための措置。
- proposal が想定していなかった意思決定に行き当たったら、独断で決めずコードやコメントに書き付けて
  進めない。`routine-common` の「見送りの書き戻し」で issue へ問い、`blocked-by: human` を経てから続ける。
  無人セッションなので、`openspec-apply-change` Skill が一時停止して尋ねる場面（task が不明瞭、
  実装で設計上の問題が判明、エラーやブロッカー）はすべてこれに置き換える。その場で止めて人の応答を
  待たない。

# 3. PR を作って終える

`worker.md` の「PR の作り方」に従う。title は `[apply] #<n> <要約>`、本文は `Refs #n`、ラベルは `[apply]` → `[apply, ai-assess:requested]` の 2 回書き。
PR を作った時点で完了。merge を待たず、`wip` は付けたままにする。

レビュー指摘は auto-fix で同じセッションが受け取る。反映して push し、何をどう直したかを
`<!-- routine -->` 付きでスレッドへ返す。設計に関わる曖昧な指摘は勝手に決めずスレッドで確認する。
