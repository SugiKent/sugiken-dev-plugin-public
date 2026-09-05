# worker の共通手順

`routine-propose` / `routine-apply` / `routine-archive` が `routine-common` の次に読む。
`routine-sweep` は止まった PR を引き継ぐ時点で読む。`routine-dispatch` は読まない。

# プロジェクト固有の調整を読む

plugin の規約は既定であり、プロジェクトごとの調整は対象リポジトリの
`.claude/skills/issue-driven-sdd-custom/SKILL.md` に置かれる。このファイルを読み終えたら、続けて
それを `origin/main` から読む。手元のツリーは古いので見ない。無ければ既定のまま進み、報告もしない。

```
git show origin/main:.claude/skills/issue-driven-sdd-custom/SKILL.md
```

custom は `## 共通` と `## propose` / `## apply` / `## archive` に分かれ、自分の段階の節と `## 共通` に従う。
custom と既定が食い違ったら custom に従う。ただし次は plugin の骨格なので、custom に何が書いてあっても変えない。

- 段階ラベルを書くのは `routine-dispatch` だけ
- `Closes #n` を書いてよいのは `archive` PR だけ
- routine のコメントは `<!-- routine -->` で始める
- draft PR を作らない。本文 1 行目の `未確定の判断: N 件` と `question` ラベルを一致させる
- 1 セッション 1 issue 1 PR
- 見送りの理由は `blocked-by:` で書き戻す
- `tasks.md` に事後の実測・確認節を作らない
- 時間や回数のしきい値。dispatcher は custom を読まないので、custom で変えると判定がずれる

custom に書くのは、たとえば E2E の要否、スクリーンショットの方針、アーティファクトの作り先、
着手してはいけない領域、教訓の書き残し先、PR 本文に加える項目、段階ごとに追加する手順。

# 対象の特定

起動のトリガーになった GitHub イベントは `CCR_TRIGGER_` で始まる環境変数に載る。まず
`env | grep ^CCR_TRIGGER_` で全部見る。`CCR_TRIGGER_ISSUE_NUMBER` があればそれが対象 issue、
`CCR_TRIGGER_REPO` が `owner/repo`。

対象を一意に決められなければ、推測せず、何が読めなかったかを報告して終える。ラベルの状態から
「たぶんこれだろう」と選ぶと、別セッションが作業中の issue を横取りする。取りこぼしは
`routine-dispatch` が再起動で拾う。

# 1 セッション 1 issue 1 PR

扱う issue は 1 つ、作る PR は 1 つ。**PR を作ったらセッションを終え、merge を待たない。** merge は
`routine-dispatch` が受けて次の段階ラベルを付け、別セッションが起動する。例外は grill
（`routine-propose`）で、auto-fix によって同じセッションが PR 上のやり取りを続ける。
並行性はセッションを複数走らせて出し、`wip` が衝突を防ぐ。

# 着手可否の判定

段階ラベルが付いているだけでは着手してよいことにならない。上から順に見て、当たったところで止める。

1. `blocked` が付いている。黙って終える。
2. `wip` が付いている。黙って終える。ただし open PR が無く、`routine-dispatch` の「1. 残骸を片付ける」の表に
   当たる `wip` は失効しているので奪ってよい。
3. 段階ラベルが 2 つ以上ある。何と何が付いているかをコメントして終える。
4. 依存 issue が閉じていない。issue 本文に `depends on #m` があり `#m` が open。`blocked-by: #m`。
5. 進行中の作業と同じ場所を触る。「進行中」は open PR と、`openspec/changes/` 直下に残る change。
   自分の issue 番号を `Refs #n` に持つ PR と、proposal に自分の issue 番号を書いた change は自分の
   作業なので除く。「同じ場所」は、同じ spec の同じ要求を MODIFIED する・同じ画面やルート・同じ service / repository の
   ファイル。propose では delta spec を、apply では PR の変更ファイルを読んで判定する。
   相手の issue 番号か change 名で `blocked-by:`。
6. change の前提が満たされていない。`tasks.md` 冒頭の「先行 change の archive を確認する」のような
   前提条件が `origin/main` で満たされていない。`blocked-by: change <name>`。
7. その機能が閉じられている。custom や `CLAUDE.md` が「開発を止めた」と宣言している領域。
   `blocked-by: human`。人が方針の文書を変えて issue にコメントするまで解けない。

4 以降は調査を伴うので、結果は `routine-common` の「見送りの書き戻し」で必ず issue へ残す。

# `wip` のロック

着手すると決めたら最初に `wip` を付ける。既に付いていても外してから付け直す。付与時刻を今にするためで、
`routine-dispatch` は最新の merge より古い `wip` を前段階の残骸として外す。付け直したらタイムラインを読み、
最新の `wip` 付与が今の時刻であることを確認する。

自分の付与の直後（2 分以内）に別の `wip` 付与イベントがあれば、同じトリガーから 2 つのセッションが
起動している。後発として黙って終える。

# `origin/main` を正本にする

コンテナはセッション開始時の main を shallow clone している。その後 merge された分は手元に無く、
archive 済みの change が手元にだけ残って見える。

- change の一覧と `tasks.md` は `origin/main` のツリーから読む（`git show origin/main:<path>`）。
- shallow clone では祖先判定（`merge-base --is-ancestor` / `A..B` / `branch --contains`）が正常終了のまま
  誤った答えを返す。「もう main に入っているか」は `origin/main` のファイルの中身で判定する。

# PR の作り方

- draft PR を作らない。すべて ready for review で作り、merge 可否は本文 1 行目と `question` で示す。
- title は `[<段階>] #<issue番号> <要約>`。
- 本文の参照は `Refs #n`。`Closes #n` は `archive` PR だけ。propose / apply で書くと merge 時に issue が
  閉じ、以降の段階が始まらない。
- PR ラベル（`propose` / `apply` / `archive` / `docs`）を必ず付ける。
- auto-fix を有効化し、「CI の失敗と、レビューコメント・会話コメントの両方を文脈として対応する」ことを
  セッションの方針として明示する。これで PR 上のやり取りを同じセッションが受け取る。
- 作成直後に `mergeable_state` を確認する。`dirty` なら別セッションが先に同じ場所を変えている。
  無理に解決せず、先行 PR を名指しして自分の PR を close する。後発が撤退する方が安い。
- 作ったアーティファクトの URL は PR 本文かコメントに残す。セッションは PR を作った時点で終わるので、
  そこに無ければ人には届かない。
- description から Claude Code session へのリンクを削除しない。

## 本文の 1 行目

```
未確定の判断: N 件 — merge しないでください
未確定の判断: 0 件 — レビューをお願いします
```

grill のラウンドごとに更新する。N > 0 の `propose` PR が merge されても、`routine-dispatch` は段階を
進めず `blocked-by: human` で人に戻す。

# openspec を通さない変更

`.claude/` と `docs/` と直下の `CLAUDE.md` / `README.md` は、利用者へ提供するものを変えないので
propose を挟まず `docs` ラベルの PR を作ってよい。`openspec/` と製品の実ファイルが 1 行でも混ざれば
対象外。判定の正本は実 diff で、push 前に `git diff origin/main --stat` を見る。
製品の目的地を定めた文書の改訂は issue を起票して人の判断を待つ。

# リポジトリの事情に従う

E2E の要否、スクリーンショットの方針、アーティファクトの作り先、教訓の書き残し先は、
リポジトリごとに違う。正本は custom。custom が無い、または触れていない事柄は、対象リポジトリの
`CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読み、そこに書かれたやり方に合わせる。
「基盤があるから回す」ではなく、ルールが求めているかで決める。
アーティファクトは、接続済みのコネクタに共有やビジュアライズを担うものがあればそちらを使う。
