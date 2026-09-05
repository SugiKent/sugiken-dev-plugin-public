---
name: routine-sweep
description: Routine「<project> sweep」（Schedule）の本文から呼ばれる skill。routine-dispatch と同じ修復を定期実行し、応答が止まった PR を引き継ぎ、issue 同士の blocked-by 循環を 1 件ずつ解き、孤児 proposal・孤児 change を検出する。webhook の取りこぼしや利用上限でイベント起動が落ちたときの保険。手動で「sweep を回して」「止まっている issue や PR を拾って」と言われたときもこの skill を使う。
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

# 4. 孤児 proposal を検出する

merge 済みの `propose` / `apply` PR が持ち込んだ openspec change は、対応する issue が open で
あり続けて初めて次の段階へ進む。issue が merge の後に人の手で close されると、change を進める
主体が誰もいなくなる。`routine-dispatch` は open issue しか見ないので、この状態には気づけない。

1. 直近 14 日に merge された `propose` / `apply` ラベルの PR のうち、本文の `Refs #n` が指す issue が
   **closed** のものを集める。
2. 集めた PR ごとに、`origin/main` の `openspec/changes/` 直下（`archive/` を除く）に、proposal /
   design にその issue 番号 `#n` を書いた change がまだ残っているか確認する。無ければ既に archive
   済みか取り下げ済みなので対象外。
3. 残っていれば、issue へ 1 度だけ `<!-- routine -->` で「merge 済みの PR #<PR番号> に対して issue が
   閉じている。openspec change `<change名>` が `openspec/changes/` に残ったまま進める主体がいない。
   reopen して段階ラベルを付け直すか、change を取り下げるかを人に決めてほしい」と書き戻す。
   直近のコメントに同じ内容があれば重ねない。
4. **sweep は reopen しない。** close は人の意思表示の可能性があるため、状態を変えるかどうかは
   人の判断を経てから。
5. 対象が無ければ「直近 14 日の merge 済み propose/apply PR N 件、issue が closed のもの M 件、
   孤児 0 件」と報告して終える。

# 5. 孤児 change を検出する

`openspec/changes/` 直下の change 名は、proposal / design に issue 番号を書いた open issue か、
それを `Refs` する PR のどちらかが進める。両方とも一度も存在しない change は、routine の中に
進める主体が原理的にいない。他の issue がこれを `blocked-by:` で待っていても永久に解けない。

1. `origin/main` の `openspec/changes/` 直下（`archive/` を除く）の change 名を全て集める。
2. 各 change 名について、その名前を `Refs` する open/merged PR と、proposal / design に issue 番号を
   書いた issue（open / closed 問わず存在したか）のどちらも見当たらないものを孤児として報告する。
3. 孤児 change を `blocked-by: change <change名>` で待っている open issue があれば、その issue へ
   `<!-- routine -->` で「ブロッカーの change `<change名>` は routine の中に進める主体がいない
   （孤児 change）。人が change を引き継ぐか取り下げるかを決めてほしい」と書き戻す。
   直近のコメントに同じ内容があれば重ねない。
4. **報告と書き戻しに留め、change を消したり `blocked` を外したりしない。** 進める主体を作るか
   change を取り下げるかは人の判断。
5. 孤児が無ければ「change N 件、孤児 0 件」と報告して終える。

# 規約や記録の修正

規約や記録の誤りに気づいたら、`worker.md` の「openspec を通さない変更」に従って `docs` ラベルの PR を
1 本作ってよい。ただし open なコード PR があるとき（main を進めてコンフリクトの母数を増やす）や、
その差分が次のセッションの行動を変えないときは書かない。直すのは反証できる規約 1 つで、
ついでの言い回しの改善は混ぜない。
