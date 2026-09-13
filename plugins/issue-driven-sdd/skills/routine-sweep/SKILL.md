---
name: routine-sweep
description: 'Schedule または「sweep を回して」で、イベントから漏れた issue / PR、死んだ worker、循環、孤児 change を全件修復する。'
---

`routine-common` と `routine-dispatch` を読む。blocker の判定と放出は dispatch の
「手順 D. blocker を評価して放出する」を使う。
無人処理なので、曖昧な状態は変えず人へ返す。代替作業は作らない。

# 読み方

- 一覧は番号、ラベル、title、更新時刻だけ取り、候補の本文・コメントだけを読む。
- open PR は期間を絞らない。孤児確認に使う merge 済み PR だけ直近 14 日を検索する。
  issue 番号は title の `[<段階>] #n` から取る。
- 直近 10 分に更新された issue は dispatch と競合し得るため触らない。
- blocked は、正本コメント後に人のコメント・close・merge がある場合だけ再評価する。

# 1. 残骸

| 状態 | 修復 |
| --- | --- |
| closed issue に `wip` / `blocked` / `question` | 修飾ラベルだけ外す |
| `wip`、open PR 無し、最新 `session:` が実行中でも人の操作待ちでもない | 手順 3b |
| `wip`、open PR 無し、`started:` 無し、3 時間経過 | 手順 3b |
| issue に `question`、`blocked` 無し | `question` を外す |
| `blocked-by: human` なのに `question` 無し | `question` を足す |
| merge 済み archive PR / closing docs PR に対して issue が open | issue を close |
| propose / apply PR が未 merge close。以後に代替 PR も blocker コメントも無い | `blocked-by: human` で方針を問い、blocked + question |
| `stage:todo` と別の段階ラベル | 書き込み途中として todo を外す |
| 段階無しで最新 routine コメントが `release:` / `restart:` / `advance:` | コメントに記録された段階を書く |
| その他の複数段階ラベル | 組み合わせを一度コメントし、以後の処理から除外 |

# 2. blocker

「読み方」の条件を満たす open + blocked issue を dispatch の「手順 D. blocker を評価して放出する」で評価する。

# 3. 起動漏れ

## 3a. dispatch

`stage:todo` があり、blocked も他段階も無く、更新から 30 分を超えた issue を番号順に dispatch の
「手順 A. stage:todo を受け付ける」で扱う。
1 回の sweep で 3 件まで。残りは順番待ちとして数える。

## 3b. worker

次を満たす issue は worker が起動しなかったか死亡したものとみなす。

1. propose / apply / archive の段階ラベルが 1 つ
2. wip / blocked が無い
3. issue 番号を title に持つ open PR が無い
4. 段階ラベルから 30 分経過

最新の `advance:` と人のコメントの新しい方より後にある `restart:` を数える。3 回未満なら
`restart: N/3` → `[]` → `[stage:X]`。3 回なら再起動せず、確認事項を添えて `blocked-by: human` で戻す。

# 4. 止まった PR

propose / apply の open PR で、最新コメントが人、routine の返信が 3 時間無いものを探す。worker 共通手順と
対応する phase skill、thread 全体、diff を読み、auto-fix を有効にして 1 件だけ引き継ぐ。

# 5. 循環 blocker

最新の `blocked-by: #m` から issue 間の有向 graph を作る。閉路ごとに最小番号の issue 1 件だけを
`release:` → `[]` → `[stage:X]` で進め、検出した輪と未解決依存を越えたことを routine コメントへ書く。
`change` と `human` は閉路判定に含めない。

# 6. 閉じた issue に残る change

直近 14 日の merge 済み propose / apply PR について、対応 issue が closed なのに main に change が残る場合、
reopen して段階を付け直すか change を取り下げるよう一度だけコメントする。sweep 自身は reopen しない。

# 7. 孤児 change

main の進行中 change のうち、対応する open issue も、その名前を Refs する PR も無いものを調べる。
closed issue があれば手順 6 に任せる。

次の全条件を満たすものだけ「完全に未着手」とする。

- tasks があり、checked task が 0
- change 名を Refs する PR が closed を含め 0
- 内容が proposal / design / tasks / delta だけ

完全に未着手なら、重複 issue が無いことを再確認して 1 件起票する。title は change 名、本文先頭は
`change: <name>`。Why / What の要約、3 条件の確認結果、`stage:todo` を人が付ければ始まる旨を書く。
ラベルは付けない。1 session 3 件まで。

条件を満たさない孤児は報告だけにする。孤児を待つ issue には、起票先または人が引き継ぐ必要を一度コメントする。
change 自体と待つ issue の blocker は変更しない。

# 範囲と報告

sweep は docs PR を作らない。最後に、読んだ issue、dispatch 漏れ（受付 / 順番待ち）、変更ラベル、投稿 / 抑制した
コメント、close、引継ぎ PR、起票 issue を数で報告する。dispatch 漏れが連続して 0 でなければ webhook 確認を促す。
