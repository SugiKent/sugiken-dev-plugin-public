---
name: routine-propose
description: '`stage:propose` の issue から OpenSpec proposal PR を作る。未確定の意思決定は PR 上で人と詰める。「#n を propose して」でも使う。'
---

`routine-common` と `routine-common/references/worker.md` を読む。

# 1. 着手する

worker の「対象の特定」「着手可否の判定」に従う。見送るなら common の「見送りの書き戻し」、着手するなら
「着手の印」を使う。`origin/main` に issue 対応済みの change があれば、新規作成せずその change を直す。

# 2. proposal を作る

issue の本文と全コメント、関連コード、main specs、進行中 changes、関連 docs、repo の方針を読む。
`depends on #m` があれば依存先 change の proposal / design / delta も読み、前提にした判断をパス付きで残す。

`openspec-propose` を使って proposal / design / tasks / delta を作り、`openspec validate --strict` を通す。
`proposal.md` 冒頭に `issue: #n` を書く。
無人 session なので、`openspec-propose` が確認を求める事項はその場で待たず、手順 3 の未確定判断として扱う。

- MODIFIED / REMOVED / RENAMED の対象要求は `origin/main:openspec/specs/` に実在すること。別 change の delta に
  しか無ければ衝突として見送る。
- 同じ session で完了できない本番実測・デプロイ後確認は tasks に入れない。
- 読み出し面がある change は、開発用 seed で表示状態を再現できる task を含める。

PR 作成後に delta の衝突が分かった場合は、自分の PR を close してから blocker を書き戻す。

# 3. 未確定の判断を詰める

環境や既存 spec から決まることは自分で調べる。複数案から選ぶ意思決定だけが残った場合に `grill-me` を使い、
`proposal.md` に次を置く。

```markdown
## 確定した判断
- <判断と根拠のファイル・行>

## 未確定の判断
### Q1. <問い>
- 選択肢 A（推奨）: <影響>
- 選択肢 B: <影響>
- 依存: なし / Q2
```

ready PR を作り、同じ問いを PR コメントにも書く。独立した問いは 1 コメントにまとめ、依存する問いは前の回答を
待つ。`Q1: A` だけで答えられる具体さとし、推奨の無い問いは残さない。

auto-fix で回答を受けたら、確定分を移して N と PR ラベルを worker の「PR の作り方」に従って更新する。
曖昧な回答を確定扱いしない。N = 0 になったら未確定節を削除し、延期事項と残るリスクを明記する。

# 4. 終える

未確定判断が無ければここで worker の形式で ready PR を作る。PR が完成したら merge を待たず終了する。
