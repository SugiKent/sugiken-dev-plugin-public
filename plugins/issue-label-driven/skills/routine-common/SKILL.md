---
name: routine-common
description: issue-label-driven の routine 群（routine-work / routine-dispatch / routine-sweep）が冒頭で読む共通規約。ラベル To Do / In Progress / Done / blocked / question の意味と書き手、ラベル遷移表（全部 1 回書き）、routine コメントの目印、見送りの書き戻し、worker の共通手順を定める。人が直接呼ぶ skill ではなく、ラベルの意味や書き手を確かめたいときの参照先。
---

対象プロジェクトの開発は **GitHub Issue のラベルだけで進む**。人が `To Do` を付けると worker が起動して
実装 PR を作り、merge で issue が閉じて `Done` になる。issue 1 件 = PR 1 本。OpenSpec は挟まない。

# ラベル

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `To Do` | 承認済み。worker が着手してよい | 人、または放出する dispatch / sweep | worker（`In Progress` に置換） |
| `In Progress` | worker が作業中。`started:` / `session:` コメントとセット | worker | dispatch（close 時） |
| `Done` | merge 済み PR によって閉じた印 | dispatch | なし |
| `blocked` | 依存や人の判断待ちで着手しない。理由は最新の `blocked-by:` コメント | worker | dispatch / sweep（`To Do` に置換） |
| `question` | 人の入力待ち。issue では `blocked` に重ねる。PR では merge 禁止の印 | worker | issue は dispatch / sweep、PR は worker |

`blocked` の issue に `To Do` は残さない。承認の事実は `blocked-by:` コメントが残す。
表に無いラベル（`bug` 等）は人のものなので、issue でも PR でも書き込みのたびに読み取った集合から引き継ぐ。
既に付いているラベルを書いても追加にならず、何も起動しない。

## 人が持つ操作

| したいこと | 操作 |
| --- | --- |
| 承認して着手させる | `To Do` を付ける |
| `question` の PR に答える | PR にコメントする。作った worker が同じセッションで受け取る |
| `question` の issue に答える | issue にコメントする。ラベルは触らない。次の sweep が拾って `To Do` を付け直す |
| 依存を取り下げる | issue に「#m は不要」とコメントする（本文の `depends on #m` を消すだけでは正本の `blocked-by:` コメントが残る）。次の sweep が放出する |
| 止める | `To Do` を外す。作業中なら PR を merge せずに close する（sweep が `blocked, question` にして問い返す） |
| やり直す | closed なら reopen してから `To Do` を付ける（`Done` から `To Do` への書き込みは追加なので起動する） |

# ラベル遷移表（全部 1 回書き）

Routine のフィルターは「追加されたラベル」ではなく**書き込み後の issue のラベル集合**で判定される。
GitHub コネクタの `issue_write` は集合置換しかできず、1 回の書き込みで増えたラベルの数だけ `labeled`
イベントが出る。減っただけの書き込みは何も起動しない。

work の Routine は `IN [To Do]` かつ `NOT_IN [In Progress, blocked, question]` で受ける（`routines-setup`）。
`In Progress` / `blocked` / `question` を聞く Routine は無いので、worker の書き込みは何も起動しない。

| 場面 | 書き手 | 書く集合 | 起動するもの |
| --- | --- | --- | --- |
| 承認 | 人 | `[To Do]` | work |
| 着手 | worker | `[In Progress]` | なし |
| 見送り | worker | `[blocked]`、人の判断なら `[blocked, question]` | なし |
| 依存解消・人の回答・死んだ worker の再起動 | dispatch / sweep | `[To Do]` | work |
| merge で issue が閉じた | dispatch | `[Done]` | なし |
| merge 以外で閉じた | dispatch | `[]` | なし |

唯一の例外は「`To Do` のまま worker が一度も起動しなかった issue」の再起動で、`To Do` を書いても追加に
ならない。このときだけ sweep が `restart:` コメントを先に投稿し、`[]` を書いてから `[To Do]` を書く。
途中で死んだ跡は sweep が `restart:` コメントから拾う（`routine-sweep` の手順 1）。

同じ issue を書く主体は「起動した worker」と「close 時の dispatch」と「sweep」に限られる。sweep は
直近 10 分にラベルイベントのある issue を触らない。

# GitHub の操作

対象リポジトリは `CCR_TRIGGER_REPO`（`owner/repo`）、無ければ clone の `origin` から決める。
`gh` は Claude Code のクラウド環境に無い。issue / PR の閲覧、ラベルの付け外し、コメントの投稿は
すべて GitHub コネクタで行う。書いたら読み直して反映を確認する。

PR は title の `#<n>` で issue を引く。`"#12" in:title` の検索は `#120` にも当たるので、検索結果は
必ず番号の完全一致で絞る。

## routine のコメントは `<!-- routine -->` で始める

routine の GitHub 操作は利用者個人のアカウントとして現れ、人のものと区別できない。
**routine が投稿するコメントは必ず `<!-- routine -->` の 1 行で始める。**

コネクタの都合で `&lt;!-- routine --&gt;` とエスケープされて届くことがある。判定側は、この 2 つの
どちらで始まるコメントも routine のものとして扱う。「人のコメント」とは、どちらでも始まらないコメント。
auto-fix で routine のコメントを受け取っても、指摘や回答として扱わず、何もしない。

## 状況が変わっていなければコメントしない

dispatch と sweep は、issue へコメントを投稿する前にその issue の最新の routine コメントを読む。
次を**すべて**満たすなら、コメントもラベルも書かない。

- これから書く `blocked-by:` / `unblock-when:` 行の集合（ブロッカーを書かないコメントなら、指摘する事実）が、
  最新の routine コメントと同じ
- そのコメントより後に人のコメントが無い
- これから書くラベル集合が今のラベル集合と同じ

同じ中身のコメントを重ねても人に新しい情報は無く、定期実行の sweep では回るたびに通知だけが積もる。
`restart:` はラベルの書き込みの前置きで、状態を変える記録なのでこの節の対象外。

## 人への問いはコメントに書く

worker が人に判断を求める経路は 2 つだけ。着手前や続けられなくなったときは issue コメント
（「見送りの書き戻し」）、PR が既にあり質問だけが残っているときは PR コメント（`routine-work` の grill）。
コードやマークダウンに問いを書いて「diff を確認してください」で済ませるのは禁止。人がコメント本文だけを
読んで答えられることを確認し、コードは根拠を示すためだけに使う。

## 見送りの書き戻し

着手しないと決めたら、理由を必ず issue へ書き戻す。書き戻さないと次の routine が同じ調査を払い、
dispatch は解けたかどうかを判定できない。

1. `<!-- routine -->` で始まるコメントを投稿し、2 行目以降にブロッカーを 1 件 1 行で
   `blocked-by: #589` のように書き、空行を挟んで人が読める理由を添える。`human` を書くときは、
   **人に何を決めてほしいか**を選択肢と推奨つきで書き、解除条件を `unblock-when:` の 1 行で明示する
   （`comment` = 答えのコメントがあれば解ける、`docs` = 方針文書の更新が要る、`#m` = その issue / PR の完了が要る）。
2. ラベルを 1 回で書く。`[blocked]`、`human` を含むなら `[blocked, question]`。

`blocked-by:` の形は `#m`（issue か PR の番号）と `human` の 2 つだけ。**`blocked-by:` 行を含む最新の
コメントが正本**なので、増減したら全部書き直す。解けたかの判定と放出は dispatch / sweep が担い、
worker は待たない。

# worker の共通手順

`routine-work` が従う。`routine-sweep` は止まった PR を引き継ぐ時点で従う。dispatch は使わない。

## プロジェクト固有の調整を読む

対象リポジトリの `.claude/skills/issue-label-driven-custom/SKILL.md` を `origin/main` から読む。
手元のツリーは古いので見ない。無ければ既定のまま進み、報告もしない。

```
git show origin/main:.claude/skills/issue-label-driven-custom/SKILL.md
```

custom は `## 共通` と `## work` に分かれる。custom と既定が食い違ったら custom に従う。ただし次は
plugin の骨格なので、custom に何が書いてあっても変えない。

- `To Do` / `Done` を書くのは dispatch と sweep だけ
- すべての PR に `Closes #n` を書く
- routine のコメントは `<!-- routine -->` で始める
- draft PR を作らない。本文 1 行目の `未確定の判断: N 件` と `question` を一致させる
- 1 セッション 1 issue 1 PR
- 見送りの理由は `blocked-by:` で書き戻す
- 時間や回数のしきい値（dispatch と sweep は custom を読まない）

## 対象の特定

`env | grep ^CCR_TRIGGER_` を読む。`CCR_TRIGGER_ISSUE_NUMBER` が対象 issue、`CCR_TRIGGER_REPO` が
`owner/repo`。一意に決められなければ推測せず、何が読めなかったかを報告して終える。取りこぼしは
sweep が再起動で拾う。

## 1 セッション 1 issue 1 PR

扱う issue は 1 つ、作る PR は 1 つ。PR を作ったら、auto-fix で届くレビューコメントには同じ
セッションで対応するが、merge は待たない。merge は GitHub が issue を閉じ、dispatch が `Done` を付ける。

## 着手可否の判定

上から順に見て、当たったところで止める。

1. `In Progress` または `blocked` が付いている。黙って終える（`NOT_IN` で普通は起動しないが、
   人がラベルを足した直後や sweep と重なったときの保険）。
2. 自分の issue 番号を title に持つ open PR がある。別セッションの作業。その PR 番号をコメントして終える。
3. 依存 issue が閉じていない。本文に `depends on #m` があり `#m` が open。`blocked-by: #m`。
4. 進行中の作業と同じ場所を触る。open PR の変更ファイルを読み、同じ画面・ルート・service /
   repository のファイルなら `blocked-by: #<PR番号>`。
5. その領域が閉じられている。custom や `CLAUDE.md` が「開発を止めた」と宣言している。
   `blocked-by: human`、`unblock-when: docs`。
6. 実装前に人の意思決定が要る。複数の選択肢から何を採るかが issue・コード・規約から決まらない。
   `blocked-by: human`、`unblock-when: comment`。調べれば決まることは含めない。

3 以降は調査を伴うので、結果は「見送りの書き戻し」で必ず issue へ残す。

## 着手の印

`mcp__Claude_Code_Remote__get_session` を引数なしで呼び、自分の session id（`session_…`）を得る。
`set_session_title` で title を `#<issue番号>` にする。**ラベルを読み直し**、`In Progress` があれば別セッションが
先に着手しているので何も書かずに終える。無ければ `[In Progress]` を書き、それから `<!-- routine -->` コメントを
1 件投稿し、2 行目を `started: <ISO 時刻>`、3 行目を `session: <session id>` にする。ラベルを先に書くのは、
負けた側の `started:` が最新に残って sweep に「死んだ」と誤判定されないため。

sweep は `session:` を `get_session` に渡し、`session_status` が実行中でなければ死亡とみなして再起動する。
経過時間では判定しないので、長い実装でも横取りされない。コネクタにコメント編集は無いので、heartbeat
のような更新型の印は使わない。

## `origin/main` を正本にする

コンテナはセッション開始時の main を shallow clone している。「もう main に入っているか」は
`origin/main` のファイルの中身で判定する。shallow clone の祖先判定は誤った答えを返す。

## PR の作り方

- **作る直前に、自分の issue 番号を title に持つ open PR をもう一度検索する。** あれば自分の PR を作らず、
  その番号を issue にコメントして終える。後発が撤退する。
- draft PR を作らない。ready for review で作り、merge 可否は本文 1 行目と `question` で示す。
- title は `#<issue番号> <要約>`。dispatch と sweep は title の番号で issue を引く。
- 本文に **`Closes #n`** を書く。merge で issue が閉じ、`Issue: Closed` で dispatch が `Done` を付ける。
  これが `Done` に至る唯一の経路。
- 本文 1 行目は `未確定の判断: N 件 — merge しないでください` か `未確定の判断: 0 件 — レビューをお願いします`。
  N > 0 なら PR に `[question]` を書き、0 になったら `[]` を書く。
- auto-fix を有効化し、「CI の失敗と、レビューコメント・会話コメントの両方に対応する」ことをセッションの
  方針として明示する。
- 作成直後に `mergeable_state` を確認する。`dirty` なら先行 PR を名指しして自分の PR を close し、
  issue へ `blocked-by: #<先行PR>` で書き戻す。
- 作ったアーティファクトの URL は PR 本文かコメントに残す。description から Claude Code session への
  リンクを削除しない。

## リポジトリの事情に従う

E2E の要否、スクリーンショットの方針、アーティファクトの作り先、教訓の書き残し先は custom が正本。
custom に無い事柄は対象リポジトリの `CLAUDE.md`・`.claude/rules/`・`.claude/skills/` に合わせる。
教訓や記録の PR を作業のついでに作らない。記録は自分の PR 本文か issue コメントに書く。
