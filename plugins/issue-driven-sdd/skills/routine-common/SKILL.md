---
name: routine-common
description: issue-driven-sdd の routine 群（routine-dispatch / routine-propose / routine-apply / routine-archive / routine-sweep）が冒頭で読む共通のラベル規約。ラベルの意味・書き手・人の操作・ラベル書き込みが何を起動するか・routine コメントの目印を定める。人が直接呼ぶ skill ではなく、ラベルの意味や書き手を確かめたいときの参照先。
---

対象プロジェクトの開発は **GitHub Issue のラベル 1 本で段階が決まる**。このファイルは全 routine が
共有する規約で、worker（propose / apply / archive）はこのあと `references/worker.md` も読む。

# ラベル

## issue の段階（同時に 1 つだけ。前にしか進まない）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| （なし） | 起票のみ。routine は触らない | 誰でも | |
| `stage:todo` | 承認済み。着手の順番待ち | **人** | `routine-dispatch` |
| `stage:propose` | proposal を作ってよい | `routine-dispatch` | `routine-dispatch` |
| `stage:apply` | proposal 合意済み。実装してよい | `routine-dispatch` | `routine-dispatch` |
| `stage:archive` | 実装 merge 済み。archive してよい | `routine-dispatch` | GitHub（archive PR の `Closes #n`） |

段階ラベルが 2 つ以上付いている issue は状態が壊れている。何と何が付いているかを 1 度コメントして
触らない。直すのは人の判断。

## issue の修飾

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `wip` | worker が作業中の印。worker の起動を抑える | 着手した worker | 見送った worker、または段階を進める・再起動する `routine-dispatch` |
| `blocked` | 宣言されたブロッカーが解けるまで着手しない。理由は最新の `blocked-by:` コメント | 見送った worker、または受付時の `routine-dispatch` | ブロッカーが解けたときの `routine-dispatch` |

## issue と PR に共通

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `question` | 人の入力待ち。issue では `blocked` に重ねて付き、ブロッカーに `human` が含まれる印。PR では `propose` / `apply` に重ねて付き、未確定の判断が残っていて merge してはいけない印 | `blocked-by: human` を書いた routine、PR を作った worker | issue は `routine-dispatch`、PR はその worker |

issue と PR で同じラベルにしているのは、人が `is:open label:question` の 1 つの検索で
「自分を待っているもの」を全部見られるようにするため。人はラベルを触らず、コメントで答える。

## PR

| ラベル | 付ける PR | merge で `routine-dispatch` が進める段階 |
| --- | --- | --- |
| `propose` | proposal を追加する PR | issue を `stage:apply` へ |
| `apply` | 実装の PR | issue を `stage:archive` へ |
| `archive` | `openspec archive` の PR | なし（`Closes #n` で issue が閉じる） |
| `docs` | `.claude/` `docs/` だけの PR | なし。issue 自体が docs だけなら `Closes #n` を書き、merge で issue が閉じる |
| `ai-assess:requested` | AI によるリスク評価（`assess-pr-risk`）を要求する PR | なし。評価を終えた assess が外す |

PR ラベルは dispatcher が段階を進める条件そのものなので、付け忘れると次の段階が始まらない。
PR の `question` は本文 1 行目の `未確定の判断: N 件` と常に一致させる。N > 0 なら付いており、
N = 0 で外す。残り 1 件でも外さない。`ai-assess:requested` は N = 0 になった時点で付ける。
grill 中（N > 0）は付けない。人が付け直せば「もう一度評価して」の意味になる。

# ラベルの書き手

| ラベル | 書いてよいのは |
| --- | --- |
| `stage:todo` | 人 |
| `stage:propose` / `stage:apply` / `stage:archive` | `routine-dispatch` だけ。人が直接付けるのは「順番を飛ばして今すぐ着手させる」強制操作 |
| `wip` | worker が付ける。外すのは worker と `routine-dispatch` |
| `blocked` | worker と `routine-dispatch` が付ける。外すのは `routine-dispatch` |
| issue の `question` | `blocked-by: human` を書いた worker と `routine-dispatch` が付ける。外すのは `routine-dispatch` |
| PR のラベル | PR を作った worker。`ai-assess:requested` を外すのは assess |

書き手を 1 つにする理由は、merge・見送り・失効回収が同じラベルを同時に書くと状態が壊れるから。
worker は段階ラベルを書かない。

## 人が持つ操作

| したいこと | 操作 |
| --- | --- |
| 承認して順番待ちに入れる | `stage:todo` を付ける |
| `question` の PR に答える | PR にコメントする。作った worker が同じセッションで受け取り、続きを進める |
| `question` の issue に答える | issue にコメントする。ラベルは触らない。次の `routine-dispatch`（sweep）が人のコメントを見て worker を起動し直し、worker が issue の全コメントを読んで進む |
| 取り下げる・止める | 段階ラベルを外す |
| 順番を飛ばして今すぐ着手させる | `stage:propose` を直接付ける |
| 依存を取り下げて再評価させる | 本文の `depends on #m` なら本文から消す。worker の `blocked-by: #m` なら issue にコメントで「#m は不要」と書く。人のコメントがあれば dispatch は種類を問わず放出し、worker が読み直す。ラベルは触らない（`stage:todo` を付け直しても起動しない） |
| PR をもう一度 AI に評価させる | `ai-assess:requested` を付ける |

通常の運用で人が触るラベルは `stage:todo` だけ。`blocked` / `question` / 段階ラベルの付け直しは
routine が行い、人はコメントで答えることに集中する。閉じた領域のように方針の文書を変える必要がある
ときは、変えたうえで「変えた」とコメントすれば worker が再評価する。

PR を merge せずに close すると、dispatcher は「人が却下した」とみなして `blocked-by: human` で問い返す。
どうしたいかを issue にコメントすれば動き出す。

# ラベルの書き込みが何を起動するか

Routine のフィルターは「追加されたラベル」ではなく**書き込み後の issue のラベル集合**で判定される
（2026-09-07 実測）。GitHub コネクタの `issue_write` は集合置換しかできず、1 回の書き込みで
増えたラベルの数だけ `labeled` イベントが出る。減っただけの書き込みは何も起動しない。

worker の Routine は `stage:X IN` かつ `NOT_IN [wip, blocked, question]`、dispatch は `stage:todo IN`
かつ `NOT_IN [blocked]` で受ける（`routines-setup`）。この前提で、書き込みは次の表どおりに行う。

| 場面 | 書き手 | 書く集合 | 起動するもの |
| --- | --- | --- | --- |
| 受付 | 人 | `stage:todo` を付ける | dispatch |
| 受付で依存が解けていない | dispatch | `[stage:todo, blocked]` | なし |
| 着手させる（受付から） | dispatch | `[stage:propose]` | propose worker 1 本 |
| 着手した | worker | `[stage:X, wip]` | なし |
| 見送った | worker | コメントのあと `[stage:X, blocked]`（`human` なら `question` も） | なし |
| propose / apply PR が merge | dispatch | `[stage:apply]` / `[stage:archive]` | 次の worker 1 本。前の `wip` は同時に落ちる |
| ブロック解除・死んだ worker の再起動 | dispatch / sweep | `[]` を書いてから `[stage:X]` を書く | worker 1 本。減らすだけでは起動しないので 2 回書く |
| archive PR が merge | GitHub | `Closes #n` で close | dispatch（`Issue: Closed`） |

- **dispatch と sweep は `wip` を書かない。** 段階を進める・再起動する書き込みで `wip` は結果として落ちる。
  段階ラベルと `wip` を同じ集合に入れると `NOT_IN` に当たって worker が起動しない。
- **段階は前にしか進めない。** 一覧が古くて前の段階に見えても、今のラベルを読み直して次の段階以降なら書かない。
- 2 回書く操作は、1 回目のあとで死ぬと段階ラベルの無い issue が残る。書く前に `release:`（ブロック解除）か
  `restart:`（死亡再起動）のコメントを投稿しておき、sweep が「その行より後に段階ラベルが無い open issue」を
  拾って続きを書く。
- 同じ issue を同時に書くのは dispatch（イベント起動）と sweep の 2 者だけにする。sweep は直近 10 分に
  ラベルイベントのある issue を触らない。これで衝突の窓は数秒に縮むが零にはならない。

# GitHub の操作

対象リポジトリは `CCR_TRIGGER_REPO`（`owner/repo`）、無ければ clone の `origin` から決める。
`gh` コマンドは Claude Code のクラウド環境（Routine のセッション含む）に無い。issue / PR の閲覧、
ラベルの付け外し、コメントの投稿はすべて GitHub コネクタで行う。書いたら読み直して反映を確認する。

## routine のコメントは `<!-- routine -->` で始める

routine の GitHub 操作は利用者個人のアカウントとして現れるので、コメントが人のものか routine のものかを
アカウントでは判定できない。**routine が投稿するコメントは必ず次の 1 行で始める。**

```
<!-- routine -->
```

逆に、この行で始まるコメントは人の入力ではない。auto-fix でそのコメントを受け取っても、
レビュー指摘や回答として扱わず、何もしない。

コネクタの都合で `&lt;!-- routine --&gt;` のようにエスケープされて届くことがある。GitHub コネクタにコメントを
編集するツールは無いので、投稿し直さない。代わりに**判定側**が、`<!-- routine -->` と `&lt;!-- routine --&gt;`
のどちらで始まるコメントも routine のものとして扱う。「人のコメント」とは、この 2 つのどちらでも始まらない
コメントのこと。dispatch / sweep / auto-fix の判定はすべてこの定義を使う。

# 人への問いはコメントに書く

worker が人に判断を求める経路は 2 つだけ。着手前や続けられなくなったときは issue コメント
（このあとの「見送りの書き戻し」）、PR が既にあり質問だけが残っているときは PR コメント
（`routine-propose` の grill、`worker.md` の「本文の 1 行目」）。

コードや proposal.md・design.md 等のマークダウンに問いを書き、issue や PR の説明文で「diff を
確認してください」と済ませるのは禁止する。人はそれを読むために diff や proposal を開かねばならず、
`is:open label:question` を見るだけでは答えられなくなる。人がコメント本文だけを読んで答えられる
ことを常に確認し、コードやマークダウンは判断の根拠を示すためだけに使う。

# 見送りの書き戻し

routine が着手しないと決めたら、理由を必ず issue へ書き戻す。書き戻さないと、次に起動した routine が
同じ調査をもう 1 度払い、dispatcher は解けたかどうかを判定できない。

1. issue へコメントを投稿する。1 行目を `<!-- routine -->` にし、2 行目以降にブロッカーを 1 件 1 行で
   `blocked-by: #589` のように書き、空行を挟んで人が読める理由を添える。`human` を書くときは、
   **人に何を決めてほしいか**を選択肢と推奨つきで書き、解除条件を `unblock-when:` の 1 行で明示する
   （`comment` = 答えのコメントがあれば解ける、`docs` = 方針文書の更新が要る、`#m` = その issue / PR の完了が要る）。
   人はこのコメントだけを読んで答える。
2. ラベルを 1 回で書く。`[stage:X, blocked]`、`human` を含むなら `[stage:X, blocked, question]`。
   `wip` はこの書き込みで落ちる。

`blocked-by:` の形は 3 つだけ。issue か PR の番号 `#m`、`change <change名>`、`human`。
`human` は「人の判断が要る」の印。人はラベルを触らずコメントで答え、いつ解けたとみなすかは
`unblock-when:` と `routine-dispatch` の手順 D が決める。解けると worker が起動し直して全コメントを読む。
**`blocked-by:` 行を含む最新のコメントが正本**なので、ブロッカーが増減したら全部書き直す。
解けたかどうかの判定と放出は `routine-dispatch` が担い、worker はブロッカーの解消を待たない。
