---
name: routine-propose
description: Routine「Issue: Labeled = stage:propose」の本文から呼ばれる skill。対象 issue の openspec change の proposal を作り、未確定の判断が残っていれば PR 上で人へ問い、auto-fix で回答を受けながら詰め切る（grill）。手動で「issue #n の proposal を作って」「#n を propose して」と言われたときもこの skill を使う。段階ラベルは書かない。
---
まず同じ plugin の `routine-common` skill と、その `references/worker.md` を読む。

# 1. 対象と着手可否

`worker.md` の「対象の特定」で issue を決め、「着手可否の判定」を上から見る。見送るなら
`routine-common` の「見送りの書き戻し」で終える。着手するなら「着手の印」を付ける。

`origin/main` の `openspec/changes/` 直下に、proposal にこの issue 番号を書いた change が既にあれば、
新しい change を作らず、その change を直す PR を作る。以降の手順は同じ。

# 2. 事実を自分で調べる

環境で分かることを人に聞かない。issue の本文と全コメント、`origin/main` の該当コードと
`openspec/specs/` の関連 capability、進行中の `openspec/changes/`、`docs/` の関連ノート、
プロジェクトの `CLAUDE.md` と製品の目的地を定めた文書を先に読む。

issue 本文に `depends on #m` があれば、`#m` に対応する change（`routine-common` の「issue と change の対応」）の
proposal / design / delta spec を読み、それを前提にした判断は `## 確定した判断` に change 名とファイルパスを
添えて書く。依存先は apply の途中で設計が動くことがあり、この issue の apply worker がずれに気づく手掛かりになる。
このとき、自分の delta が MODIFIED / REMOVED / RENAMED する既存要求を挙げ、それぞれが `origin/main` の
`openspec/specs/` に実在するかを確かめる（「delta が触れる要求」）。無ければ `worker.md` の判定 4 として見送る。
判定は着手の印の前に済ませる。PR を作ったあとに分かると、その PR を閉じてから書き戻す手間が要る。

人に聞いてよいのは**複数の選択肢から何を採るかという意思決定だけ**。調べれば決まることや、
既存の規約・spec が答えているものは含めない。意思決定が残っていなければ 4 へ進む。

# 3. grill: PR 上で詰める

`/grill-me` Skill を用いる

`openspec-propose` Skill を必ず起動し、その手順で change を作る。無人セッションなので、
Skill が `AskUserQuestion` で尋ねる場面（入力の明確化、成果物作成時の不明点、マイグレーション設計の
確認、「徹底的な疑問点の解消」節を含む全て）は、その場で止めずこの節の grill に置き換える。
疑問はその場で尋ねず `proposal.md` の `## 未確定の判断` に問いとして書き、PR コメントで人に問う。

`proposal.md` には次の 2 節を置く。

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
`未確定の判断: N 件 — このまま merge すると worker が推奨案で進めます`、ラベルは `[propose, question]`。
人がこのまま merge したら、`routine-dispatch` は `stage:apply` へ進め、`routine-apply` が各問いの推奨案を採る。
だから推奨の無い問いを残さない。

問いの投稿は `routine-common` の「人への問いはコメントに書く」に従い、PR コメントとして投稿する。
`proposal.md` の `## 未確定の判断` に問いを書いただけで済ませ、PR 本文や説明で「proposal.md を
確認してください」と促すのは禁止する。往復を最小にするため、独立な問いは 1 コメントに束ね、
先の判断で選択肢が消える問いは前の回答を待つ。各問に推奨を付け、`Q1: A` の形で返せるようにし、
コードを読んでいない読み手を前提に、どの画面でどの操作が起点で何が起きるかを具体で書く。

回答が届いたら（auto-fix で同じセッションが受け取る）、確定した分を `## 確定した判断` へ移し、
1 行目の N を更新して push する。回答が曖昧なら分かったことにせず同じ枝を掘る。未回答のまま
既定で進めない。N が 0 になったら `## 未確定の判断` を削除し、明示的に延期した判断と残るリスクを
書き切り、1 行目を `未確定の判断: 0 件 — レビューをお願いします` にして `[propose, ai-assess:requested]` を書く（`question` が落ち、AI 評価が起動する）。

# 4. proposal を完成させる

`openspec-propose` Skill の手順で `proposal.md` / `design.md` / `tasks.md` / spec delta を揃え、
`openspec validate --strict` を緑にする。`proposal.md` の冒頭に `issue: #n` を書く（`routine-common` の
「issue と change の対応」）。issue と change の対応はこれで引く。

- `tasks.md` に「投入後の実測」「本番で確認」「デプロイ後」の節を作らない。archive の判定は
全タスク `[x]` なので、セッションで完了できない行が 1 本でもあると archive が止まる。実測したい
観点は書かずに落とす。残作業を別 issue として起票してはならない。
- change に読み出し面があるなら、開発用の seed データを作る行を tasks に入れる。手元で表示状態を
再現できないと、画面を開けないまま完了になる。
- E2E ケースの列挙や画面案の見せ方は `worker.md` の「リポジトリの事情に従う」で決める。

## delta が触れる要求

delta で MODIFIED / REMOVED / RENAMED できるのは、`origin/main` の `openspec/specs/` に実在する要求だけ。
依存先など他の change の delta にしか無い要求は触れない。`openspec validate --strict` は change 自身の
delta しか読まないので PR は緑で通るが、`openspec archive` が `MODIFIED failed ... not found` で失敗し、
archive の段階で静かに止まる。そういう要求に触る必要が分かったら、`worker.md` の判定 4 として
`blocked-by: change <name>` で見送る。依存先が archive されて要求が `openspec/specs/` に入れば解ける。
判定は手順 2 で済ませるのが基本で、PR を作ったあとに分かった場合は、`worker.md` の「PR の作り方」で
`dirty` のときと同じく自分の PR を閉じてから書き戻す。open PR が残ると、放出後の worker が「別セッションが
先に作っている」とみなして撤退し、誰も進めない issue になる。

まだ PR が無ければ（grill を経ていない場合）、ここで `worker.md` の「PR の作り方」に従って PR を作る。
1 行目は `未確定の判断: 0 件 — レビューをお願いします`、ラベルは `[propose]` → `[propose, ai-assess:requested]` の 2 回書き。

# 5. 終える

PR を作った（grill なら詰め切った）時点で完了。merge を待たず、`wip` は付けたままにする（次の段階へ進める
dispatch の書き込みで落ちる）。merge は `routine-dispatch` が受けて `stage:apply` へ進める。