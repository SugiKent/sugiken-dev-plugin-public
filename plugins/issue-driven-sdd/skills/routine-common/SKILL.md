---
name: routine-common
description: Claude Code の Routines で GitHub Issue 駆動 SDD を回すときの共通規約。ラベルの意味・着手可否の判定・ロック・PR の作り方・auto-fix の有効化を定める。routine-propose / routine-apply / routine-archive / routine-sweep が冒頭で必ず参照する。単独では実行しない。
---

対象プロジェクトの開発は **GitHub Issue のラベル 1 本で段階が決まる**。
このファイルは 4 つの routine スキルが共有する規約を定める。

# ラベル

## issue（段階。同時に 1 つだけ付く。前にしか進まない）

```
（なし）→ stage:propose → stage:apply → stage:archive → closed
           人が付ける      routine-apply   routine-archive   archive PR の Closes
```

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| （なし） | 起票のみ。routine は触らない | 誰でも | |
| `stage:propose` | 承認済み。propose してよい | **人** | `routine-apply` |
| `stage:apply` | proposal 合意済み。実装してよい | `routine-apply` | `routine-archive` |
| `stage:archive` | 実装 merge 済み。archive してよい | `routine-archive` | GitHub（`Closes #n`） |

**段階ラベルが 2 つ以上付いている issue には着手しない。** 状態が壊れているので、
何と何が付いているかを issue へ 1 度コメントして終える（fail-closed）。

## issue（修飾）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `wip` | routine が作業中のロック | 着手した routine | PR merge / close 後の routine、または `routine-sweep` の失効回収 |

## PR

| ラベル | 付ける PR | merge で起動する routine |
| --- | --- | --- |
| `propose` | proposal を追加する PR | `routine-apply` |
| `apply` | 実装の PR | `routine-archive` |
| `archive` | `openspec archive` の PR | なし（`Closes #n` で issue が閉じる） |
| `docs` | `.claude/` `docs/` だけの PR | なし |

**PR ラベルは Routine のトリガー条件そのものである。** 付け忘れると次の段階が起動しない
（`routine-sweep` が後追いで拾うが、最大 1 時間遅れる）。

## PR（修飾）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `question` | 人へ問うている未確定の判断が残っている。merge してはいけない | 問いを投稿した routine | 全部の回答を受け取った routine |

段階ラベル（`propose` / `apply` / `archive` / `docs`）とは直交するので、**段階ラベルへ重ねて付ける。**
段階ラベルは merge 後にどの routine が起動するかを決めており、質問の有無で書き換えると次の段階が
起動しなくなる。

- **人へ問いを投げたら、同じ操作の中で `question` を付ける。** コメントを投稿してからラベルを
  付けるまでの間に人が見ると、「答えを待っている PR」だと分からない。
- **未確定の判断が 0 件になったら外す。** 残り 1 件でも外してはならない。外す条件は
  「人の回答を全部受け取った」ことであって、「1 ラウンド終えた」ことではない。
- 本文 1 行目の `未確定の判断: N 件` と**必ず一致させる**。N > 0 なら `question` が付いており、
  N = 0 なら付いていない。片方だけ更新すると、どちらが正しいのかが人に分からなくなる。
- 付け外しのたびに読み直して反映を確認する（`gh pr view <n> --json labels`）。

```bash
gh api -X POST   repos/{owner}/{repo}/issues/<PR番号>/labels -f "labels[]=question"
gh api -X DELETE repos/{owner}/{repo}/issues/<PR番号>/labels/question
```

ラベルをまだ作っていない新しいプロジェクトでは、作成コマンドを `routines-setup` skill から実行する（この skill はセットアップの実行を担わない）。

# `github-trigger-context` の待ち方

イベント起動の routine（`routine-propose` / `routine-apply` / `routine-archive`）だけが対象。
定期実行の `routine-sweep` にはトリガー文脈が無いので、この節は適用しない。

**`github-trigger-context` はセッション開始からやや遅れて届く。** 開始直後に見当たらないことは
「届かない」ことを意味しない。次のように待ってから読む。

1. まず届いているかを見る。届いていれば待たずに Issue / PR の ID を読み、そのまま着手する。
2. 届いていなければ **5 秒 → 10 秒 → 30 秒 → 60 秒** の順に待ち、毎回のあとで届いたかを見直す
   （待ち時間の合計は約 105 秒）。届いた時点で待つのをやめる。
3. 待機は `sleep` で行う。harness が前景の `sleep` を塞ぐなら、その harness が提供する
   待機手段を使う。
4. 4 回待っても届かないなら、各スキルの規定どおり**推測で対象を決めず**、何が読めなかったかを
   報告して終える（`routine-sweep` が後追いで拾う）。

# 1 セッション 1 issue 1 PR

- 1 つのセッションで扱う issue は 1 つ、作る PR は 1 つ。複数 issue をまたがない。
- **PR を作ったらセッションを終える。** merge を待たない。次の段階は merge イベントで
  起動する別セッションが担う。例外は grill（`routine-propose` を参照）で、そこでは
  auto-fix によって同じセッションが PR 上のやり取りを続ける。
- 並行性は「セッションを複数走らせる」ことで出す。`wip` が互いの衝突を防ぐ。

# 着手可否の判定

`stage:*` が付いているだけでは着手してよいことにならない。**次のどれかに当たるなら着手せず、
理由を issue へ 1 度コメントして終える**（同じコメントが既にあるなら重ねない）。

1. **`wip` が付いている。** ただし次のどちらかなら失効とみなして奪ってよい（`routine-sweep` の
   回収と同じ判定）。
   - open PR が無く、`wip` が付いてから 3 時間を超えている
   - open PR が無く、`wip` がその issue の直近の PR merge より古く、merge から 30 分を超えている
     （前段階の routine が付け、次段階の routine が着手前に途中終了した残骸）
2. **段階ラベルが 2 つ以上ある。**
3. **依存 issue が閉じていない。** issue 本文に `depends on #m` があり `#m` が open なら着手しない。
4. **進行中の作業と同じ場所を触る。** 「進行中」は open PR と、`openspec/changes/` 直下に残る
   （archive されていない）change。「同じ場所」は次のいずれか。
   - 同じ spec capability の同じ要求を MODIFIED する
   - 同じ画面・同じルート
   - 同じ service / repository のファイル
   propose 段階では delta spec を、apply 段階では PR の変更ファイルを読んで判定する。
5. **その機能が閉じられている。** プロジェクトのドキュメント（`CLAUDE.md` や製品の目的地を
   定めた文書）が「開発を止めた」「利用を停止した」と宣言している領域は対象外。
   この場合は理由をコメントしたうえで **`stage:propose` を外す**（人の再判断へ戻す）。

4 で見送った場合、衝突相手が merge されれば次の周期で自然に選定対象へ戻る。

# `origin/main` を正本にする

コンテナはセッション開始時の main を clone している。その後 merge された分は手元に無く、
**archive 済みの change が手元にだけ残って見える**。

- change の一覧と `tasks.md` は、手元のディレクトリを `ls` せず `origin/main` のツリーから読む。
- clone は shallow。`git fetch` の `(forced update)` は remote の変化ではない。
- **祖先判定（`merge-base --is-ancestor` / `A..B` / `branch --contains`）は正常終了で嘘をつく。**
  「もう main に入っているか」は `origin/main` のファイルを読んで挙動で判定する。

# GitHub の操作

`gh` はセッションにプリインストール済みで、認証は不要。ただし **GraphQL 経路は 403 で塞がれる**
ことがあるので、失敗したら REST へ落とす。

```bash
# ラベルの付け外し（REST）
gh api -X POST   repos/{owner}/{repo}/issues/<n>/labels -f "labels[]=stage:apply"
gh api -X DELETE repos/{owner}/{repo}/issues/<n>/labels/stage:propose
```

段階を付け替えたら **読み直して反映を確認する**（`gh issue view <n> --json labels`）。

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
  propose / apply で `Closes` を書くと merge 時に issue が閉じ、以降の段階が起動しない。
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

grill のラウンドごとに更新する。`routine-apply` は N が 0 でない PR が merge された場合、
実装せずに issue へコメントして `stage:propose` へ戻す。

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
| リポジトリ名 `{owner}/{repo}` | `gh repo view` で解決する |
| 着手してはいけない領域 | 対象プロジェクトの `CLAUDE.md` に閉じた領域の節があればそれに従う |
| propose / apply / archive の実体 | `openspec` plugin のスキルを参照する |
| `wip` の失効時間 | 既定 3 時間。この節の記述を変えるだけで済ませる |
| プロジェクト固有のルール | `CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読む（E2E の要否・スクリーンショット方針もここで決まる） |
