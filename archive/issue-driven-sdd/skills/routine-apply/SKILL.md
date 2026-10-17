---
name: routine-apply
description: '`stage:apply` の issue に対応する merge 済み proposal または事後起票 change を実装し、apply PR を作る。「#n を実装して」でも使う。'
---

`routine-common` と `routine-common/references/worker.md` を読む。

# 1. 対象を決める

worker の「対象の特定」に従い、次の順で proposal の正本を 1 つ選ぶ。

1. issue を `Refs #n` に持つ最新の merge 済み `propose` PR
2. `origin/main` にある issue 対応済み change

無い、または 2 の候補が複数なら、調査内容を添えて `blocked-by: human` / `unblock-when: comment` で見送る。
worker の「着手可否の判定」を通ったら「着手の印」を付ける。

proposal に未確定判断が残っていても、merge 済みなら各問いの推奨案を採る。人の回答があれば優先し、採用結果を
確定節と apply PR 本文へ移す。推奨の無い問いだけは人へ戻す。実装前に `openspec validate --strict` を通す。

# 2. 実装する

`openspec-apply-change` を使い、`origin/main` の tasks を上から実装する。

- 完了した task だけ `[x]` にする。
- repo が要求する型検査、lint、関連 test、strict validation を通す。E2E 等は custom / repo ルールに従う。
- session 外でしかできない task は worker の「変更範囲」に従う。
- proposal 外の意思決定が必要なら独断で進めず、common の「見送りの書き戻し」で人へ戻す。

無人 session なので、`openspec-apply-change` が質問・設計問題・blocker で停止する場面も、同じ書き戻しをして終了する。

# 3. PR を作る

worker の「PR の作り方」に従って apply PR を作り、merge を待たず終了する。auto-fix の指摘は反映して push し、
`<!-- routine -->` 付きで回答する。設計判断が必要な指摘はスレッドで確認する。
