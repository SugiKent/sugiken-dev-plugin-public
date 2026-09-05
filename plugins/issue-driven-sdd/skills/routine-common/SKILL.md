---
name: routine-common
description: issue-driven-sdd の routine 群（routine-dispatch / routine-propose / routine-apply / routine-archive / routine-sweep）が冒頭で読む共通のラベル規約。ラベルの意味・書き手・人の操作・ラベル書き込みの作法・routine コメントの目印を定める。人が直接呼ぶ skill ではなく、ラベルの意味や書き手を確かめたいときの参照先。
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
| `wip` | worker が作業中のロック | 着手した worker | 見送った worker、または失効を回収する `routine-dispatch` |
| `blocked` | 宣言されたブロッカーが解けるまで着手しない。理由は最新の `blocked-by:` コメント | 見送った worker、または受付時の `routine-dispatch` | ブロッカーが解けたときの `routine-dispatch`、または人 |

## PR

| ラベル | 付ける PR | merge で `routine-dispatch` が進める段階 |
| --- | --- | --- |
| `propose` | proposal を追加する PR | issue を `stage:apply` へ |
| `apply` | 実装の PR | issue を `stage:archive` へ |
| `archive` | `openspec archive` の PR | なし（`Closes #n` で issue が閉じる） |
| `docs` | `.claude/` `docs/` だけの PR | なし |
| `question` | 上のラベルに重ねて付ける。人へ問うている未確定の判断が残っており、merge してはいけない | |

PR ラベルは dispatcher が段階を進める条件そのものなので、付け忘れると次の段階が始まらない。
`question` は本文 1 行目の `未確定の判断: N 件` と常に一致させる。N > 0 なら付いており、
N = 0 で外す。残り 1 件でも外さない。

# ラベルの書き手

| ラベル | 書いてよいのは |
| --- | --- |
| `stage:todo` | 人 |
| `stage:propose` / `stage:apply` / `stage:archive` | `routine-dispatch` だけ。人が直接付けるのは「順番を飛ばして今すぐ着手させる」強制操作 |
| `wip` | worker が付ける。外すのは worker と `routine-dispatch` |
| `blocked` | worker と `routine-dispatch` が付ける。外すのは `routine-dispatch` と人 |
| PR のラベル | PR を作った worker |

書き手を 1 つにする理由は、merge・見送り・失効回収が同じラベルを同時に書くと状態が壊れるから。
worker は段階ラベルを書かない。

## 人が持つ操作

| したいこと | 操作 |
| --- | --- |
| 承認して順番待ちに入れる | `stage:todo` を付ける |
| 取り下げる・止める | 段階ラベルを外す |
| 順番を飛ばして今すぐ着手させる | `stage:propose` を直接付ける |
| ブロックを人の判断で解く | `blocked` を外し、段階ラベルを外して付け直す。閉じた領域のような原因は先に方針の文書を変えておく |
| 死んだ worker をやり直させる | 段階ラベルを外して付け直す |

PR を merge せずに close すると、dispatcher は「人が却下した」とみなして `blocked-by: human` を書き、
再起動しない。やり直させたいときは上の操作で明示する。

# ラベルを書くときの作法

**ラベルの書き込みは routine を再起動させる。** `Issue: Labeled` の Filter は issue のラベル集合で
判定されるので、`stage:propose` の issue に `wip` を付けるだけで propose の routine がもう 1 回起動する。
したがって次を守る。

- 起動された routine は、自分の書き込みで再起動された可能性を前提に動く。worker は最初に `wip` と
  `blocked` を見て、付いていれば黙って終える。コメントも投稿しない。
- **1 操作 1 ラベル**で付け外しする。ラベル集合をまとめて置換すると、既に付いているラベルの
  付与イベントがタイムラインに出ず、時刻に基づく判定が狂う。集合しか書けないツールなら、
  そのラベルを含まない集合を書いてから、含む集合を書く。
- 「外して付け直す」は外す操作と付ける操作を別々に行い、付けたあとにタイムラインで最新の付与
  イベントが今の時刻であることを読み直して確認する。
- 段階ラベルは同時に 1 つ。次の段階を付けるときは、前の段階を外してから付ける。

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

# 見送りの書き戻し

routine が着手しないと決めたら、理由を必ず issue へ書き戻す。書き戻さないと、次に起動した routine が
同じ調査をもう 1 度払い、dispatcher は解けたかどうかを判定できない。

1. issue へコメントを投稿する。1 行目を `<!-- routine -->` にし、2 行目以降にブロッカーを 1 件 1 行で
   `blocked-by: #589` のように書き、空行を挟んで人が読める理由を添える。
2. `blocked` を付ける。
3. `wip` を付けていたら外す。

`blocked-by:` の形は 3 つだけ。issue か PR の番号 `#m`、`change <change名>`、`human`。
**`blocked-by:` 行を含む最新のコメントが正本**なので、ブロッカーが増減したら全部書き直す。
解けたかどうかの判定と放出は `routine-dispatch` が担い、worker はブロッカーの解消を待たない。
