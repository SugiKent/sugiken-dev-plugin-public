---
name: routine-sweep
description: Routine「<project> sweep」（Schedule）の本文から呼ばれる skill。リポジトリ全体を定期的に突き合わせ、イベントでは拾えないもの（人の回答・dispatch が受け付けなかった stage:todo・死んだ worker・却下された PR・残骸・循環ブロック・孤児 change）を直す。完全に未着手の孤児 change には issue を起票する。routine-dispatch がイベント 1 件だけを扱うのに対し、こちらが全件の修復を担う。手動で「sweep を回して」「止まっている issue や PR を拾って」と言われたときもこの skill を使う。
---

まず同じ plugin の `routine-common` skill と `routine-dispatch` skill を読む。ラベルの書き方と
ブロック評価（手順 D）は dispatch のものをそのまま使い、ここに独自の判定を置かない。

無人で呼ばれ、対話するユーザーはいない。迷ったら着手しない・状態を壊さない側へ倒す。
直すものが 0 件なら、数え方を報告して終える。それが正しい終わり方で、埋め合わせの作業は作らない。

# 読み方

- 一覧は最小の項目（番号・ラベル・title・更新時刻）だけ取り、本文とコメントは判定に要る issue だけ読む。
- PR 検索は `merged:>=<14 日前>` を付け、`fields` から `body` を外す。issue 番号は title の
  `[<段階>] #n` から取る。
- **一覧の `updated_at` が直近 10 分の issue は触らない。** イベント起動の dispatch が処理中の可能性がある。
  timeline を読まずに一覧の値で足切りする。触らない issue が少し増えるだけで、安全側に倒れる。
- `blocked` の再評価は、正本の `blocked-by:` コメントより後にイベント（コメント・close・merge）が
  あった issue だけ行う。無ければ前回と同じ結果になる。

# 1. 残骸を片付ける

| 実態 | 直し方 |
| --- | --- |
| closed な issue に `wip` / `blocked` / `question` が残っている | それらを除いた集合を書く。段階ラベルは履歴として残す |
| open PR が無く、`wip` があり、最新の `started:` コメントの `session:` を `mcp__Claude_Code_Remote__get_session` で引いて、`session_status` が実行中でも人の操作待ち（permission prompt 等）でもない | worker は死んでいる。30 分の猶予を待たずにその場で 3b の手順（`restart:` → `[]` → `[stage:X]`）を行う。**人の操作待ちは生きている扱い**で触らない。通知は Claude Code 側が出す |
| open PR が無く、`wip` があり、`started:` コメントが無い | 旧規約の worker。`wip` が 3 時間より古ければ上と同じ |
| `question` があるのに `blocked` が無い issue | `question` だけ除いた集合（`wip` があれば残す）を書く。issue の `question` は `blocked` から導かれる。PR は対象外（一覧 API は PR も返すので `pull_request` を持つものを除く） |
| `blocked` があり最新の `blocked-by:` に `human` があるのに `question` が無い | `[stage:X, blocked, question]` を書く |
| `archive` PR、または `Closes #n` を持つ `docs` PR が merge 済みなのに issue が open | issue を close する |
| `propose` / `apply` PR が merge されずに close され、それより新しい open PR が無い | 人が却下したとみなす。`blocked-by: human`（`unblock-when: comment`）で書き戻し `[stage:X, blocked, question]` |
| `stage:todo` と他の `stage:*` が両方ある | dispatch の書き込み途中の跡。`stage:todo` を外した集合を書く |
| 段階ラベルが無く、最新の `<!-- routine -->` コメントが `release:` / `restart:` / `advance:` | 2 回書きの途中で死んだ跡。その行の段階ラベルを書く |
| それ以外で段階ラベルが 2 つ以上 | 直さない。何と何が付いているかを 1 度コメントし、以降の手順から除外する |

# 2. ブロックを評価し、解けたものを放出する

`blocked` の付いた open issue のうち「読み方」の条件に当たるものを、`routine-dispatch` の手順 D で
1 件ずつ評価する。人の回答はイベントにならないので、ここが唯一の拾い場所になる。

# 3. 起動しなかった dispatch と死んだ worker を起動し直す

## 3a. dispatch が受け付けなかった `stage:todo`

`Issue: Labeled` は 1 回きりのイベントで、その瞬間に dispatch が起動しなければ（Routine の停止・
利用上限・環境の setup 失敗など。拒否された発火は run 一覧にも残らない）、その issue を再評価する
者はいない。dispatch の手順 A が完走した issue は、段階が進んで `stage:todo` でなくなるか、
`[stage:todo, blocked]` と `blocked-by:` コメントになる。だから次を**すべて**満たす issue は、
dispatch が受け付けていない。

1. `stage:todo` が付いていて、`blocked` も他の段階ラベルも無い
2. 一覧の `updated_at` が 30 分より古い（timeline は読まない）

該当する issue を issue 番号の小さい順に、`routine-dispatch` の手順 A をそのまま実行して受け付ける。
書くのは 1 回（`[stage:todo]` → 「`stage:todo` から進める先」）で、増えるラベルは 1 つなので worker は
1 本だけ起動する。**1 回の sweep で受け付けるのは 3 件まで**とし、残りは順番待ちとして報告に数える。
一度に多くの worker を起動すると利用上限で全員が途中で死に、手順 3b の再起動に流れ込むだけだから。

## 3b. 死んだ worker

次を**すべて**満たす issue は、worker が起動しなかったか途中で死んでいる。

1. `stage:propose` / `stage:apply` / `stage:archive` のどれかが付いている
2. `wip` も `blocked` も無い
3. その issue 番号を title に持つ open PR が無い
4. 段階ラベルが付いてから 30 分を超えている

`<!-- routine -->` で `restart: 1/3` の形のコメントを投稿し、`[]` を書いてから `[stage:X]` を書く。
回数は、最新の `advance:` 行と最新の人のコメントのどちらか新しい方より後の `restart:` 行を数える
（`release:` は数えない）。**3 に達したら再起動せず `blocked-by: human` で書き戻す。**
何度起動しても死ぬ原因は GitHub の状態からは分からないので、人に何を確かめてほしいかを書く。

# 4. 応答が止まった PR を引き継ぐ

open PR のうち、ラベルが `propose` か `apply` で、最新のコメントが人のもの（`routine-common` の定義）で、そこから 3 時間を超えて routine の返信が無いものを探す。auto-fix は通常 VM 回収後も
再開するので、これは本当に止まったものだけ拾う。

見つかったら `routine-common` の `references/worker.md` を読み、PR のスレッド全体と diff を読んで、
そのラベルに対応する skill（`routine-propose` / `routine-apply`）の続きを引き受ける。auto-fix を
有効化し直す。引き継ぐのは 1 セッションで 1 件まで。

# 5. 循環ブロックを 1 件解く

手順 2 は個々の `blocked-by:` が解けたかしか見ないので、issue 番号同士が輪になって互いを指す状態は
自動では永久に解けない。ここで検出して壊す。

1. open issue のうち、最新の `blocked-by:` コメントが issue 番号（`#m`）を指すものを集め、
   `issue → 相手` を辺とする有向グラフで閉路を探す。`change <name>` と `human` は対象外。
2. 閉路が無ければ「open issue N 件・issue 番号宛の `blocked-by:` M 件、閉路なし」と報告して終える。
3. 閉路ごとに、issue 番号が最も小さい 1 件を手順 D の「全部解けた」列と同じ操作（`release:` → 2 回書き）で強制的に進める。
   issue へ `<!-- routine -->` コメントを投稿し、検出した輪と、ブロッカーは解けていないが循環を
   断つために進めたことを書く。依存関係が正しいかの判断は人に委ねる。同じ輪の 2 件目以降には触れない。

# 6. 孤児 proposal を検出する

merge 済みの `propose` / `apply` PR が持ち込んだ openspec change は、対応する issue が open で
あり続けて初めて次の段階へ進む。issue が merge の後に人の手で close されると、change を進める
主体が誰もいなくなる。

1. 直近 14 日に merge された `propose` / `apply` PR のうち、title の issue 番号が **closed** のものを集める。
2. 集めた PR ごとに、`origin/main` の `openspec/changes/` 直下（`archive/` を除く）に、その issue に対応する
   change（`routine-common` の「issue と change の対応」。proposal の `#n`、または issue 本文の `change:`）が
   まだ残っているか確認する。無ければ対象外。
3. 残っていれば、issue へ 1 度だけ `<!-- routine -->` で「merge 済みの PR #<PR番号> に対して issue が
   閉じている。openspec change `<change名>` が残ったまま進める主体がいない。reopen して段階ラベルを
   付け直すか、change を取り下げるかを人に決めてほしい」と書き戻す。直近のコメントに同じ内容があれば重ねない。
4. **sweep は reopen しない。** close は人の意思表示の可能性がある。

# 7. 孤児 change を検出する

`openspec/changes/` 直下の change 名は、対応する issue（`routine-common` の「issue と change の対応」。
proposal の `#n`、または本文の `change:` でその change を指す open issue）か、それを `Refs` する PR の
どちらかが進める。両方とも一度も存在しない change は、routine の中に進める主体が原理的にいない。

1. `origin/main` の `openspec/changes/` 直下（`archive/` を除く）の change 名を全て集める。
2. 各 change 名について、その名前を `Refs` する open/merged PR と、対応する issue のどちらも見当たらない
   ものを孤児とする。issue 本文の `change:` は `search_issues` で `"change: <change名>" is:open` を引く。
   closed issue も `is:closed` で引き、見つかれば手順 6 の領分なのでここでは扱わない。
3. 孤児 change ごとに、**完全に未着手か**を `origin/main` の中身と PR 履歴だけで判定する。次を
   **すべて**満たすものだけが完全に未着手。
   - `tasks.md` があり、`- [x]` が 1 つも無い（1 つでもあれば人が手を付けている）。`tasks.md` が無い change は
     apply が進められないので、書きかけの proposal とみなして起票しない
   - その change 名を `Refs` する PR が、closed も含めて一度も存在しない（`search_pull_requests` で
     `<change名>` を引き、state を問わず 0 件）
   - change ディレクトリの中身が proposal / design / tasks / specs の delta だけで、実装の痕跡が無い。
     ここまで見て分からないものは未着手と決めつけない
4. 完全に未着手の孤児 change には、**issue を 1 件だけ起票する**。change だけが `origin/main` にあって
   誰も進めない状態を、事後起票（`routine-common` の「人が持つ操作」）と同じ形へ戻す。
   - title は `<change名>`、本文の 1 行目に `change: <change名>` を書く。これで change → issue の
     対応が付き、次の sweep はこの change を孤児として数えない。
   - 本文には、`proposal.md` の Why / What を読んだ要約、未着手と判定した根拠（上の 3 条件をどう確かめたか）、
     「この change は `origin/main` にあるが対応する issue も PR も無かったので sweep が起票した。
     着手してよければ `stage:todo` を付けてほしい」の 1 行を書く。
   - **段階ラベルは付けない。** ラベル無しの issue は `routine-common` のとおり routine が触らない状態で、
     承認は人の `stage:todo` に残る。sweep が `stage:todo` を付けると、人が一度も承認していない change を
     dispatch が `stage:apply` まで運んでしまう。
   - 起票の前に `search_issues` で同じ `change: <change名>` の issue（closed も含む）が無いことを
     もう一度確かめる。closed のものがあれば起票し直さず、手順 6 と同じく報告に留める。
5. 完全に未着手でない孤児 change（`tasks.md` が無い、`- [x]` がある、closed PR がある、中身が上の形に収まらない）は、
   **報告だけに留める。** 途中まで進んだ change をどう扱うかは人が決める。
6. 孤児 change を `blocked-by: change <change名>` で待っている open issue があれば、その issue へ
   `<!-- routine -->` で書き戻す。起票した change なら「進める主体がいなかったので issue #n を起票した。
   `stage:todo` を付ければ動き出す」、起票しなかった change なら「routine の中に進める主体がいない。
   人が change を引き継ぐか取り下げるかを決めてほしい」。直近のコメントに同じ内容があれば重ねない。
7. **change そのものは触らない。** 消したり書き換えたり、待っている issue の `blocked` を外したりしない。
8. 起票は 1 セッションで 3 件まで。それを超える孤児 change は数だけ報告する。

# やらないこと

規約や記録の誤りに気づいても、sweep は `docs` PR を作らない。教訓の PR が別の PR を呼ぶ連鎖を
止めるため。気づいたことは報告に書き、人が取り込むかを決める。

# 報告

「読んだ issue 数 / dispatch が受け付けなかった `stage:todo`（受け付けた数・順番待ちの数）/ 変えたラベル /
投稿したコメント / close した issue / 引き継いだ PR / 起票した issue」を数で報告する。起票した issue は
番号と change 名も添える。
「受け付けなかった `stage:todo`」が続けて 0 でないなら、dispatch の webhook が届いていない。人が Routine を
確かめる合図なので、報告に 1 行そう書く。
