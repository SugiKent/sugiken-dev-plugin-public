---
name: routine-common
description: Claude Code の Routines で GitHub Issue 駆動 SDD を回すときの共通規約。ラベルの意味・ラベルの書き手・対象の特定・着手可否の判定・見送りの書き戻し・ロック・PR の作り方・auto-fix の有効化を定める。routine-dispatch / routine-propose / routine-apply / routine-archive / routine-sweep が冒頭で必ず参照する。単独では実行しない。
---

対象プロジェクトの開発は **GitHub Issue のラベル 1 本で段階が決まる**。
このファイルは routine スキルが共有する規約を定める。

# ラベル

## issue（段階。同時に 1 つだけ付く。前にしか進まない）

段階は「なし」から始まり、人が `stage:todo` を付けると dispatcher が `stage:propose`、
`stage:apply`、`stage:archive` の順に進め、archive PR の `Closes` で閉じる。

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| （なし） | 起票のみ。routine は触らない | 誰でも | |
| `stage:todo` | 承認済み。着手の順番待ち | **人** | `routine-dispatch` |
| `stage:propose` | propose してよい | `routine-dispatch` | `routine-dispatch` |
| `stage:apply` | proposal 合意済み。実装してよい | `routine-dispatch` | `routine-dispatch` |
| `stage:archive` | 実装 merge 済み。archive してよい | `routine-dispatch` | GitHub（`Closes #n`） |

**段階ラベルが 2 つ以上付いている issue には着手しない。** 状態が壊れているので、
何と何が付いているかを issue へ 1 度コメントして終える（fail-closed）。

## issue（修飾）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `wip` | worker が作業中のロック | 着手した worker | 見送った worker、または `routine-dispatch` の失効回収 |
| `blocked` | 宣言されたブロッカーが解けるまで着手しない | 見送った worker、または受付時の `routine-dispatch` | ブロッカーが解けたときの `routine-dispatch`、または人 |

## PR

| ラベル | 付ける PR | merge で `routine-dispatch` が進める段階 |
| --- | --- | --- |
| `propose` | proposal を追加する PR | issue を `stage:apply` へ |
| `apply` | 実装の PR | issue を `stage:archive` へ |
| `archive` | `openspec archive` の PR | なし（`Closes #n` で issue が閉じる） |
| `docs` | `.claude/` `docs/` だけの PR | なし |

**PR ラベルは dispatcher が段階を進める条件そのものである。** 付け忘れると次の段階が始まらない。

## PR（修飾）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `question` | 人へ問うている未確定の判断が残っている。merge してはいけない | 問いを投稿した routine | 全部の回答を受け取った routine |

段階ラベル（`propose` / `apply` / `archive` / `docs`）とは直交するので、**段階ラベルへ重ねて付ける。**

- **人へ問いを投げたら、同じ操作の中で `question` を付ける。**
- **未確定の判断が 0 件になったら外す。** 残り 1 件でも外してはならない。
- 本文 1 行目の `未確定の判断: N 件` と**必ず一致させる**。N > 0 なら `question` が付いており、
  N = 0 なら付いていない。
- 付け外しのたびに読み直して反映を確認する。

ラベルをまだ作っていない新しいプロジェクトでは、作成コマンドを `routines-setup` skill から実行する。

# ラベルの書き手

| ラベル | 書いてよいのは |
| --- | --- |
| `stage:todo` | 人 |
| `stage:propose` / `stage:apply` / `stage:archive` | `routine-dispatch` だけ。人が直接付けるのは「dispatcher を飛ばして今すぐ着手させる」強制操作 |
| `wip` | worker が付ける。外すのは worker と `routine-dispatch` |
| `blocked` | worker と `routine-dispatch` が付ける。外すのは `routine-dispatch` と人 |
| PR のラベル | PR を作った worker |

worker は段階ラベルを書かない。書き手を 1 つにしないと、merge・見送り・失効回収が
同じラベルを同時に書いて状態が壊れる。

**ラベルの書き込みは routine を再起動させる。** `Issue: Labeled` の Filter は issue のラベル集合で
判定されるので、`stage:propose` の issue に `wip` を付けるだけで propose の routine が
もう 1 回起動する。したがって、

- 起動された worker は最初に `wip` と `blocked` を見て、付いていれば**黙って終える**。
  コメントも投稿しない。これは再起動であって空振りではない。
- ラベルは **1 操作 1 ラベル**で付け外しする。集合しか書けないツールなら、そのラベルを含まない
  集合を書いてから、含む集合を書く。

## 人が持つ操作

| したいこと | 操作 |
| --- | --- |
| 承認して順番待ちに入れる | `stage:todo` を付ける |
| 取り下げる・止める | 段階ラベルを外す。`stage:todo` でも `stage:propose` 以降でも同じ |
| 順番を飛ばして今すぐ着手させる | `stage:propose` を直接付ける |
| ブロックを人の判断で解く | `blocked` を外し、段階ラベルを外して付け直す。`stage:todo` なら dispatcher が付け直し後のコメントだけを見て再評価する。`stage:propose` 以降なら worker が再調査するので、閉じた領域のような原因は先に方針の文書を変えておく |
| 死んだ worker をやり直させる | 段階ラベルを外して付け直す |

PR を merge せずに close すると、dispatcher は「人が却下した」とみなして `blocked-by: human` を
書き、再起動しない。やり直させたいときは上の操作で明示する。

# 対象の特定

イベント起動の worker（`routine-propose` / `routine-apply` / `routine-archive`）は、
**環境変数から対象を読む。** Claude Code の remote 環境では、起動のトリガーになった GitHub
イベントの情報が `CCR_TRIGGER_` プレフィックスの環境変数に載る。まず `env | grep ^CCR_TRIGGER_`
で実際に渡っている変数を全部見る。

| 変数 | 内容 |
| --- | --- |
| `CCR_TRIGGER_EVENT` | 起動したイベント。`issues.labeled` など |
| `CCR_TRIGGER_ISSUE_NUMBER` | 対象 issue の番号 |
| `CCR_TRIGGER_REPO` | `owner/repo` |

`CCR_TRIGGER_ISSUE_NUMBER` があればそれが対象。無ければ、`env` で見えた他の `CCR_TRIGGER_*`
（PR 番号やイベントのペイロードなど）から対象 issue を一意に決められるかを確かめる。
一意に決まらなければ**推測で対象を決めず**、何が読めなかったかを報告して終える。
ラベルの状態だけを見て「たぶんこれだろう」と選ぶと、別セッションが作業中の issue を横取りする。
取りこぼしは `routine-dispatch` が再起動する。

`routine-dispatch` と `routine-sweep` はトリガー文脈を使わず、毎回全体を見る。

# 1 セッション 1 issue 1 PR

- 1 つのセッションで扱う issue は 1 つ、作る PR は 1 つ。複数 issue をまたがない。
- **PR を作ったらセッションを終える。** merge を待たない。merge は `routine-dispatch` が受けて
  次の段階ラベルを付け、別セッションが起動する。例外は grill（`routine-propose` を参照）で、
  そこでは auto-fix によって同じセッションが PR 上のやり取りを続ける。
- 並行性は「セッションを複数走らせる」ことで出す。`wip` が互いの衝突を防ぐ。

# 着手可否の判定

段階ラベルが付いているだけでは着手してよいことにならない。上から順に見て、当たったところで止める。

1. **`blocked` が付いている。** 黙って終える。
2. **`wip` が付いている。** 黙って終える。ただし open PR が無く、次のどちらかなら失効とみなして
   奪ってよい（`routine-dispatch` の回収と同じ判定）。
   - `wip` が付いてから 3 時間を超えている
   - 最新の `wip` 付与が、その issue の最新の PR merge より古く、merge から 30 分を超えている
3. **段階ラベルが 2 つ以上ある。** 何と何が付いているかをコメントして終える。
4. **依存 issue が閉じていない。** issue 本文に `depends on #m` があり `#m` が open。
   `blocked-by: #m` で書き戻す。
5. **進行中の作業と同じ場所を触る。** 「進行中」は open PR と、`openspec/changes/` 直下に残る
   （archive されていない）change。「同じ場所」は次のいずれか。
   - 同じ spec capability の同じ要求を MODIFIED する
   - 同じ画面・同じルート
   - 同じ service / repository のファイル
   propose 段階では delta spec を、apply 段階では PR の変更ファイルを読んで判定する。
   相手の issue 番号か change 名で `blocked-by:` を書き戻す。
6. **change の前提が満たされていない。** `tasks.md` の冒頭に「先行 change の archive を確認する」
   のような前提条件があり、満たされていない。`blocked-by: change <name>` で書き戻す。
7. **その機能が閉じられている。** プロジェクトのドキュメント（`CLAUDE.md` や製品の目的地を
   定めた文書）が「開発を止めた」「利用を停止した」と宣言している領域。
   `blocked-by: human` で書き戻す。人が方針を変えない限り解けない。

4 以降は調査を伴う。**調査の結果は必ず書き戻す。** 書き戻さないと、次に起動した worker が
同じ調査をもう 1 度払う。

## 見送りの書き戻し

着手しないと決めたら、次を 1 回の操作でまとめて行い、終える。

1. issue へコメントを投稿する。1 行目を `<!-- routine -->` にし、2 行目以降にブロッカーを
   1 件 1 行で `blocked-by: #589` のように書き、空行を挟んで人が読める理由を添える。
2. `blocked` を付ける。
3. `wip` を付けていたら外す。

`blocked-by:` の形は 3 つだけ。issue か PR の番号 `#m`、`change <change名>`、`human`。
**`blocked-by:` 行を含む最新のコメントが正本**になるので、ブロッカーが増減したら全部書き直す。
解けたかどうかの判定と放出は `routine-dispatch` が担う。worker はブロッカーの解消を待たない。

# `wip` のロック

着手すると決めたら **最初に `wip` を付ける**。既に付いている場合でも、**外してから付け直す**。
付与時刻を今にするためで、`routine-dispatch` は「最新の merge より古い `wip`」を前段階の
残骸として外すからだ。付け直したら issue のタイムラインを読み、最新の `wip` 付与イベントが
今の時刻であることを確認する。

付け直した直後のタイムラインに、**自分の付与の 2 分以内に別の `wip` 付与イベント**があれば、
同じトリガーから 2 つのセッションが起動している。後発として黙って終える。

# `origin/main` を正本にする

コンテナはセッション開始時の main を clone している。その後 merge された分は手元に無く、
**archive 済みの change が手元にだけ残って見える**。

- change の一覧と `tasks.md` は、手元のディレクトリを `ls` せず `origin/main` のツリーから読む。
- clone は shallow。`git fetch` の `(forced update)` は remote の変化ではない。
- **祖先判定（`merge-base --is-ancestor` / `A..B` / `branch --contains`）は正常終了で嘘をつく。**
  「もう main に入っているか」は `origin/main` のファイルを読んで挙動で判定する。

# GitHub の操作

**`gh` コマンドは Claude Code のクラウド環境（Routine のセッション含む）では使えない。**
issue / PR の閲覧、ラベルの付け外し、コメントの投稿はすべて GitHub コネクタで行う。

ラベルを付け外ししたら **読み直して反映を確認する**。

## routine のコメントには必ずマーカーを入れる

routine の GitHub 操作は**あなた個人のアカウント**として現れる。したがって
「最新コメントが人か routine か」をアカウントでは判定できない。

**routine が投稿するコメントは必ず次の 1 行で始める。**

```
<!-- routine -->
```

これが無いと、routine 自身のコメントを人の回答と誤読する。`routine-sweep` の
「応答が止まった PR の引き継ぎ」もこのマーカーで判定する。

**逆に、`<!-- routine -->` で始まるコメントは人の入力ではない。** auto-fix でそのコメントを
受け取っても、レビュー指摘や回答として扱わず、何もしない。`assess-pr-risk` の評価結果
（「自動 merge しました」「人間レビューが必要」）はこの形で届く。

# PR の作り方

- **draft PR を作らない。** すべて ready for review で作る。
- title は `[<フェーズ>] #<issue番号> <要約>`（例: `[propose] #12 通話ログの見出しを固定する`）。
- **本文の参照は `Refs #n`。`Closes #n` を書いてよいのは `archive` PR だけ。**
  propose / apply で `Closes` を書くと merge 時に issue が閉じ、以降の段階が始まらない。
- PR ラベルを必ず付ける（`propose` / `apply` / `archive` / `docs`）。
- **auto-fix を有効化する。** PR を作ったら、その URL を対象に auto-fix を有効化し、
  「CI の失敗と、レビューコメント・会話コメントの両方を文脈として理解して対応する」ことを
  セッションの方針として明示する。これにより PR 上のやり取りを同じセッションが受け取る。
- 作成直後に `mergeable_state` を確認する。`dirty` なら別セッションが先に同じ場所を変更している。
  無理に解決せず、先行 PR を名指しして close する（後発が撤退する方が安い）。
- description から Claude Code session へのリンクを削除しない。

## 本文の先頭に進行状態を書く

draft を使わないので、「まだ merge してはいけない PR」を人が見分けられる必要がある。
**PR 本文の 1 行目を次のどちらかにする。**

```
未確定の判断: N 件 — merge しないでください
未確定の判断: 0 件 — レビューをお願いします
```

grill のラウンドごとに更新する。N が 0 でない `propose` PR が merge された場合、
`routine-dispatch` は段階を進めず `blocked-by: human` で人に戻す。

# openspec を通さない変更（`.claude/` と `docs/`）

エージェント自身の作業規約と記録は、利用者へ提供するものを変えないので propose を挟まず
直接 `docs` ラベルの PR を作ってよい。

| 対象 | 対象外 |
| --- | --- |
| `.claude/skills/**` / `.claude/rules/**` | `openspec/specs/**` / `openspec/changes/**` |
| `docs/**` | 製品の実ファイル（1 行でも含めば不可） |
| 直下の `CLAUDE.md` / `README.md` | 製品の目的地を定めた文書（改訂が要るなら issue を起票して人の判断を待つ） |

**判定の正本は実 diff。** push 前に `git diff origin/main --stat` を見て、対象外パスが 1 件でも
混ざっていたら push しない。

# リポジトリの事情に従う

E2E の要否や成果物の伝え方は、リポジトリごとに違う。propose / apply のどちらでも、
対象リポジトリの `CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読み、そこに書かれた
やり方に合わせる。E2E の要否と成果物の伝え方については、この plugin の既定よりリポジトリ側の規約を優先する。

- **E2E**: 実行を要求するリポジトリでは該当ケースを回し、要求していないリポジトリでは回さない。
  「基盤があるから回す」ではなく、ルールが求めているかで決める。
- **スクリーンショット**: 画面の変化をスクリーンショットに撮り、アーティファクトへ埋め込んで
  人へ伝える方針のリポジトリがある。その方針があるかどうかは、リポジトリのスキルの中身を
  読んで判断する。
- **アーティファクトの作り先**: 接続済みのコネクタに、アーティファクトの共有やビジュアライズを
  担うものがあれば、Claude Code 公式のアーティファクト機能ではなくそちらを使う。
  公式の機能を使うのは、そうしたコネクタが無いときだけである。

セッションは PR を作った時点で終わるので、作ったアーティファクトの URL は PR 本文またはコメントに
残す。そこに無ければ人には届かない。

# 教訓の書き残し先

`docs/` の用途別ディレクトリへ書く。判定表と書き方の正本はプロジェクトの `CLAUDE.md`。
重複を作らず既存ノートを更新し、誤りと分かったノートは削除して参照を張り替える。

# パラメータ化する箇所

この plugin を別プロジェクトへ導入するとき、次だけを対象プロジェクトの実態に合わせる。名指しの
固有名詞（プロダクト名・固有パス・社内 MCP・使っていないツール等）はここへ書かない。

| 項目 | 扱い |
| --- | --- |
| リポジトリ名 `{owner}/{repo}` | `CCR_TRIGGER_REPO`、無ければ GitHub コネクタで解決する |
| 着手してはいけない領域 | 対象プロジェクトの `CLAUDE.md` に閉じた領域の節があればそれに従う |
| propose / apply / archive の実体 | `openspec` plugin のスキルを参照する |
| `wip` の失効時間 | 既定 3 時間。この節と `routine-dispatch` の表を変える |
| 再起動の上限 | 既定 3 回。`routine-dispatch` の 4 を変える |
| プロジェクト固有のルール | `CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読む（E2E の要否・スクリーンショット方針もここで決まる） |
