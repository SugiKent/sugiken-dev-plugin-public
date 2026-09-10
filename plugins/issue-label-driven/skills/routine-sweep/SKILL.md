---
name: routine-sweep
description: Routine「<project> sweep」（Schedule）の本文から呼ばれる skill。リポジトリ全体を定期的に突き合わせ、イベントでは拾えないもの（人の回答・死んだ worker・merge されずに閉じた PR・応答が止まった PR・Closes の書き忘れ）を直す。routine-dispatch がイベント 1 件だけを扱うのに対し、こちらが全件の修復を担う。手動で「sweep を回して」「止まっている issue や PR を拾って」と言われたときもこの skill を使う。
---

まず同じ plugin の `routine-common` skill と `routine-dispatch` skill を読む。ブロック評価（手順 C）は
dispatch のものをそのまま使い、ここに独自の判定を置かない。

無人で呼ばれ、対話するユーザーはいない。迷ったら着手しない・状態を壊さない側へ倒す。
直すものが 0 件なら、数え方を報告して終える。埋め合わせの作業は作らない。

# 読み方

- 一覧は最小の項目（番号・ラベル・title・更新時刻）だけ取り、本文とコメントは判定に要る issue だけ読む。
- PR 検索は `merged:>=<14 日前>` を付け、`fields` から `body` を外す。issue 番号は title の `#n` から取り、
  完全一致で絞る。
- **一覧の `updated_at` が直近 10 分の issue は触らない。** イベント起動の dispatch が処理中の可能性がある。
- `blocked` の再評価は、正本の `blocked-by:` コメントより後にイベント（人のコメント・close・merge）があった
  issue だけ行う。routine のコメントは数えない。数えると sweep 自身のコメントが次の sweep の再評価を呼ぶ。

# 1. 残骸を片付ける

| 実態 | 直し方 |
| --- | --- |
| closed な issue に `Done` 以外の規約ラベルが残っている | dispatch が落ちた跡。手順 A と同じく merge 済み PR があれば `[Done]`、無ければ `[]` |
| `#n` を title に持つ merge 済み PR があるのに issue が open | `Closes #n` の書き忘れ。issue を close する（`Issue: Closed` で dispatch が `Done` を付ける） |
| open issue に `question` があるのに `blocked` が無い | `question` を除いた集合を書く。PR は対象外（一覧 API は PR も返すので `pull_request` を持つものを除く） |
| `blocked` があり最新の `blocked-by:` に `human` があるのに `question` が無い | `[blocked, question]` を書く |
| `To Do` も `In Progress` も `blocked` も無く、最新の `<!-- routine -->` コメントが `restart:` | 2 回書きの途中で死んだ跡。`[To Do]` を書く |

# 2. ブロックを評価し、解けたものを放出する

`blocked` の付いた open issue のうち「読み方」の条件に当たるものを、`routine-dispatch` の手順 C で
1 件ずつ評価する。人の回答はイベントにならないので、ここが唯一の拾い場所になる。

# 3. 死んだ worker を再起動する

次のどちらかに当たる issue は、worker が起動しなかったか途中で死んでいる。どちらも「自分の issue 番号を
title に持つ open PR が無い」ことが条件。open PR があれば worker は役目を終えている。

| 実態 | 判定 |
| --- | --- |
| `In Progress` があり、最新の `restart:` か人のコメントより後の `started:` コメントの `session:` を**すべて** `mcp__Claude_Code_Remote__get_session` で引いて、どれも `session_status` が実行中でも人の操作待ち（permission prompt 等）でもない | 死んでいる。1 つでも生きていれば触らない。**人の操作待ちは生きている扱い** |
| `In Progress` があり `started:` コメントが無く、ラベルが付いてから 3 時間を超えている | 死んでいる |
| `To Do` があり、ラベルが付いてから 30 分を超え、それより後の `started:` が無いか、その session がどれも生きていない | 起動しなかった、または `In Progress` を書く前に死んだ |

`<!-- routine -->` で `restart: 1/3` の形のコメントを投稿してから、`[To Do]` を書く。`To Do` が付いたままの
issue は書いても追加にならないので、`[]` を書いてから `[To Do]` を書く（唯一の 2 回書き。1 回目のあとで
死んでも `restart:` コメントを手順 1 が拾う）。

回数は、最新の人のコメントより後の `restart:` 行を数える（人のコメントが無ければ全部）。
**3 に達したら再起動せず `blocked-by: human` で書き戻し `[blocked, question]` を書く。** 何度起動しても
死ぬ原因は GitHub の状態からは分からないので、人に何を確かめてほしいかを書く。

# 4. merge されずに閉じた PR を人に戻す

`#n` を title に持つ PR が merge されずに close され、issue `#n` が open で、それより新しい open PR が
無いもの。ただし PR の close より新しい routine の `blocked-by:` コメントがあれば、worker 自身が `dirty` で
撤退して書き戻した跡なので触らない。それ以外は人が却下したとみなす。`blocked-by: human`（`unblock-when: comment`）で書き戻し
`[blocked, question]` を書く。

# 5. 応答が止まった PR を引き継ぐ

open PR のうち、最新のコメントが人のもの（`routine-common` の定義）で、そこから 3 時間を超えて routine の
返信が無いものを探す。auto-fix は VM 回収後も再開するので、本当に止まったものだけ拾う。

見つかったら `routine-common` の「worker の共通手順」と `routine-work` を読み、PR のスレッド全体と diff を
読んで続きを引き受ける。auto-fix を有効化し直す。引き継ぐのは 1 セッションで 1 件まで。

# やらないこと

規約や記録の誤りに気づいても、sweep は PR を作らない。気づいたことは報告に書き、人が取り込むかを決める。

# 報告

「読んだ issue 数 / 変えたラベル / 投稿したコメント / 状況が変わらず重ねなかったコメント / close した issue /
引き継いだ PR」を数で報告する。
