---
name: routine-propose
description: Routine「Issue: Labeled = stage:propose」の本文から呼ばれる skill。対象 issue の openspec change の proposal を作り、未確定の判断が残っていれば PR 上で人へ問い、auto-fix で回答を受けながら詰め切る（grill）。手動で「issue #n の proposal を作って」「#n を propose して」と言われたときもこの skill を使う。段階ラベルは書かない。
---
まず同じ plugin の `routine-common` skill と、その `references/worker.md` を読む。

# 1. 対象と着手可否

`worker.md` の「対象の特定」で issue を決め、「着手可否の判定」を上から見る。見送るなら
`routine-common` の「見送りの書き戻し」で終える。着手するなら「`wip` のロック」を行う。

# 2. 事実を自分で調べる

環境で分かることを人に聞かない。issue の本文と全コメント、`origin/main` の該当コードと
`openspec/specs/` の関連 capability、進行中の `openspec/changes/`、`docs/` の関連ノート、
プロジェクトの `CLAUDE.md` と製品の目的地を定めた文書を先に読む。

人に聞いてよいのは**複数の選択肢から何を採るかという意思決定だけ**。調べれば決まることや、
既存の規約・spec が答えているものは含めない。意思決定が残っていなければ 4 へ進む。

# 3. grill: PR 上で詰める

`/grill-me` Skill を用いる

`openspec-propose` で change を作り、`proposal.md` に次の 2 節を置く。

```
## 確定した判断
（調査で確定したこと。根拠のファイル・行を添える）

## 未確定の判断
### Q1. <問い>
- 選択肢 A（推奨）: <採った場合に何がどうなるか>
- 選択肢 B: <同上>
- 依存: なし / Q2 の回答が要る
```

この状態で `worker.md` の「PR の作り方」に従って ready の PR を作る。1 行目は
`未確定の判断: N 件 — merge しないでください`、ラベルは `propose` と `question`。

問いは PR コメントとして投稿する。往復を最小にするため、独立な問いは 1 コメントに束ね、
先の判断で選択肢が消える問いは前の回答を待つ。各問に推奨を付け、`Q1: A` の形で返せるようにし、
コードを読んでいない読み手を前提に、どの画面でどの操作が起点で何が起きるかを具体で書く。

回答が届いたら（auto-fix で同じセッションが受け取る）、確定した分を `## 確定した判断` へ移し、
1 行目の N を更新して push する。回答が曖昧なら分かったことにせず同じ枝を掘る。未回答のまま
既定で進めない。N が 0 になったら `## 未確定の判断` を削除し、明示的に延期した判断と残るリスクを
書き切り、1 行目を `未確定の判断: 0 件 — レビューをお願いします` にして `question` を外す。

# 4. proposal を完成させる

`openspec-propose` の作法で `proposal.md` / `design.md` / `tasks.md` / spec delta を揃え、
`openspec validate --strict` を緑にする。proposal / design に issue 番号 `#n` を書く。issue と change の
対応はこれで引く。

- `tasks.md` に「投入後の実測」「本番で確認」「デプロイ後」の節を作らない。archive の判定は
全タスク `[x]` なので、セッションで完了できない行が 1 本でもあると archive が止まる。実測したい
観点は別 issue として起票する（段階ラベルは付けない）。
- change に読み出し面があるなら、開発用の seed データを作る行を tasks に入れる。手元で表示状態を
再現できないと、画面を開けないまま完了になる。
- E2E ケースの列挙や画面案の見せ方は `worker.md` の「リポジトリの事情に従う」で決める。

まだ PR が無ければ（grill を経ていない場合）、ここで `worker.md` の「PR の作り方」に従って PR を作る。
1 行目は `未確定の判断: 0 件 — レビューをお願いします`、ラベルは `propose`。

# 5. 終える

PR を作った（grill なら詰め切った）時点で完了。merge を待たず、`wip` は付けたままにする。
merge は `routine-dispatch` が受けて `stage:apply` へ進める。