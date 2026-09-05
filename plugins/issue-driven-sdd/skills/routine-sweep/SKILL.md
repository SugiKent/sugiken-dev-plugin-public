---
name: routine-sweep
description: Routine「<project> sweep」（Schedule）の本文から呼ばれる skill。routine-dispatch と同じ修復を定期実行し、応答が止まった PR を引き継ぎ、issue 同士の blocked-by 循環を 1 件ずつ解く。webhook の取りこぼしや利用上限でイベント起動が落ちたときの保険。手動で「sweep を回して」「止まっている issue や PR を拾って」と言われたときもこの skill を使う。
---

まず同じ plugin の `routine-common` skill を読む。

無人で呼ばれ、対話するユーザーはいない。迷ったら着手しない・状態を壊さない側へ倒す。
直すものが 0 件なら、数え方を報告して終える。それが正しい終わり方で、埋め合わせの作業は作らない。
判定の本体は `routine-dispatch` にあり、ここに独自の判定を置かない。

# 1. `routine-dispatch` を実行する

`routine-dispatch` skill を読み、その 1〜4 をそのまま実行する。worker の再起動は段階ラベルの
付け直しで行い、このセッションが worker の仕事を代理しない。

# 2. 応答が止まった PR を引き継ぐ

open PR のうち、ラベルが `propose` か `apply` で、最新のコメントが人のもの（`<!-- routine -->` で
始まらない）で、そこから 3 時間を超えて routine の返信が無いものを探す。auto-fix は通常 VM 回収後も
再開するので、これは本当に止まったものだけ拾う。

見つかったら `routine-common` の `references/worker.md` を読み、PR のスレッド全体と diff を読んで、
そのラベルに対応する skill（`routine-propose` / `routine-apply`）の続きを引き受ける。auto-fix を
有効化し直す。引き継ぐのは 1 セッションで 1 件まで。

# 3. 循環ブロックを 1 件解く

`routine-dispatch` の 3 は個々の `blocked-by:` が解けたかしか見ないので、issue 番号同士が輪になって
互いを指す状態は自動では永久に解けない。ここで検出して壊す。

1. open issue のうち、最新の `blocked-by:` コメントが issue 番号（`#m`）を指すものを集め、
   `issue → 相手` を辺とする有向グラフで閉路を探す。`change <name>` と `human` は対象外。
2. 閉路が無ければ「open issue N 件・issue 番号宛の `blocked-by:` M 件、閉路なし」と報告して終える。
3. 閉路ごとに、issue 番号が最も小さい 1 件を `routine-dispatch` の 3 の「全部解けた」列と同じ操作で
   強制的に進める。issue へ `<!-- routine -->` コメントを投稿し、検出した輪と、ブロッカーは解けて
   いないが循環を断つために進めたことを書く。依存関係が正しいかの判断は人に委ねる。
   同じ輪の 2 件目以降には触れない。

# 規約や記録の修正

規約や記録の誤りに気づいたら、`worker.md` の「openspec を通さない変更」に従って `docs` ラベルの PR を
1 本作ってよい。ただし open なコード PR があるとき（main を進めてコンフリクトの母数を増やす）や、
その差分が次のセッションの行動を変えないときは書かない。直すのは反証できる規約 1 つで、
ついでの言い回しの改善は混ぜない。
