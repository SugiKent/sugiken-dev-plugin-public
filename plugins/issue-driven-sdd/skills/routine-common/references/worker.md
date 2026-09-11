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
`## routines` 節は `routines-setup` が Routine の id を控える場所で、worker は読まない。
custom と既定が食い違ったら custom に従う。ただし次は plugin の骨格なので、custom に何が書いてあっても変えない。

- 段階ラベルを書くのは `routine-dispatch` だけ
- `Closes #n` を書いてよいのは `archive` PR と、issue 自体が docs だけの `docs` PR
- routine のコメントは `<!-- routine -->` で始める
- draft PR を作らない。本文 1 行目の `未確定の判断: N 件` と `question` / `ai-assess:requested` を一致させる
- 1 セッション 1 issue 1 PR
- 見送りの理由は `blocked-by:` で書き戻す
- `tasks.md` に事後の実測・確認節を作らない
- 時間や回数のしきい値。dispatcher と sweep は custom を読まないので、custom で変えると判定がずれる

custom に書くのは、たとえば E2E の要否、スクリーンショットの方針、アーティファクトの作り先、
着手してはいけない領域、教訓の書き残し先、PR 本文に加える項目、段階ごとに追加する手順。

# 対象の特定

起動のトリガーになった GitHub イベントは `CCR_TRIGGER_` で始まる環境変数に載る。まず
`env | grep ^CCR_TRIGGER_` で全部見る。`CCR_TRIGGER_ISSUE_NUMBER` が対象 issue、
`CCR_TRIGGER_REPO` が `owner/repo`。

対象を一意に決められなければ、推測せず、何が読めなかったかを報告して終える。ラベルの状態から
「たぶんこれだろう」と選ぶと、別セッションが作業中の issue を横取りする。取りこぼしは
`routine-sweep` が再起動で拾う。

# 1 セッション 1 issue 1 PR

扱う issue は 1 つ、作る PR は 1 つ。**PR を作ったらセッションを終え、merge を待たない。** merge は
`routine-dispatch` が受けて次の段階ラベルを付け、別セッションが起動する。例外は grill
（`routine-propose`）で、auto-fix によって同じセッションが PR 上のやり取りを続ける。

# 着手可否の判定

段階ラベルが付いているだけでは着手してよいことにならない。上から順に見て、当たったところで止める。

1. `blocked` または `wip` が付いている。黙って終える（Routine の `NOT_IN` で普通は起動しないが、
   sweep の再起動と重なったときの保険）。
2. 段階ラベルが 2 つ以上ある。何と何が付いているかをコメントして終える。
3. 依存 issue が閉じていない。issue 本文に `depends on #m` があり `#m` が open。`blocked-by: #m`。
4. 進行中の作業と同じ場所を触る。「進行中」は open PR と、`openspec/changes/` 直下に残る change。
   自分の issue 番号を title に持つ PR と、自分に対応する change（`routine-common` の「issue と change の
   対応」。proposal の `#n`、または issue 本文の `change:` が指すもの）は自分の作業なので除く。
   「同じ場所」は、同じ spec の同じ要求を MODIFIED する・同じ画面やルート・同じ service / repository のファイル。propose では delta spec を、apply では PR の変更ファイルを読んで判定する。
   相手の issue 番号か change 名で `blocked-by:`。
5. change の前提が満たされていない。`tasks.md` 冒頭の「先行 change の archive を確認する」のような
   前提条件が `origin/main` で満たされていない。`blocked-by: change <name>`。
6. その機能が閉じられている。custom や `CLAUDE.md` が「開発を止めた」と宣言している領域。
   `blocked-by: human`、`unblock-when: docs`。

3 以降は調査を伴うので、結果は `routine-common` の「見送りの書き戻し」で必ず issue へ残す。

# 着手の印

着手すると決めたら、まず `mcp__Claude_Code_Remote__get_session` を引数なしで呼び、自分の session id
（`session_…`）を得る。`set_session_title` で title を `[<段階>] #<issue番号>` にする（人が一覧で見分けるため）。
次に `<!-- routine -->` コメントを 1 件投稿し、2 行目を `started: <ISO 時刻>`、3 行目を `session: <session id>`
にする。続けて `[stage:X, wip]` を書く（`NOT_IN` により何も起動しない）。

sweep はこの `session:` を `get_session` に渡し、`session_status` が RUNNING でなければ死亡とみなして再起動する。
経過時間では判定しないので、長い実装（数時間の apply）でも横取りされない。GitHub コネクタにはコメントを
編集するツールが無いため、heartbeat のような更新型の印は使わない。

# `origin/main` を正本にする

コンテナはセッション開始時の main を shallow clone している。その後 merge された分は手元に無く、
archive 済みの change が手元にだけ残って見える。

- change の一覧と `tasks.md` は `origin/main` のツリーから読む（`git show origin/main:<path>`）。
- shallow clone では祖先判定（`merge-base --is-ancestor` / `A..B` / `branch --contains`）が正常終了のまま
  誤った答えを返す。「もう main に入っているか」は `origin/main` のファイルの中身で判定する。

# PR の作り方

- **作る直前に、自分の issue 番号を title に持つ open PR を検索する。** あれば別セッションが先に
  作っている。自分の PR を作らず、その PR 番号を issue にコメントして終える。後発が撤退する方が安い。
- draft PR を作らない。すべて ready for review で作り、merge 可否は本文 1 行目とラベルで示す。
- title は `[<段階>] #<issue番号> <要約>`。sweep と dispatch は title の番号で issue を引く。
- 本文の参照は `Refs #n`。`Closes #n` は `archive` PR と docs-only の `docs` PR だけ。propose / apply で
  書くと merge 時に issue が閉じ、以降の段階が始まらない。
- ラベルは `create_pull_request` の後に `issue_write` で書く。N > 0 なら `[<段階>, question]` の 1 回。
  `未確定の判断: 0 件` なら **`[<段階>]` を書いてから `[<段階>, ai-assess:requested]` を書く**（2 回）。
  1 回で 2 ラベル足すとイベントが 2 回出て AI 評価（`assess-pr-risk`）が 2 本起動する。
  `ai-assess:requested` を足す書き込みだけが評価を起動する。
- propose / apply では auto-fix を有効化し、「CI の失敗と、レビューコメント・会話コメントの両方を文脈として
  対応する」ことをセッションの方針として明示する。これで PR 上のやり取りを同じセッションが受け取る。
  archive は PR を作って終わるので有効化しない。
- 作成直後に `mergeable_state` を確認する。`dirty` なら別セッションが先に同じ場所を変えている。
  無理に解決せず、先行 PR を名指しして自分の PR を close する。
- 作ったアーティファクトの URL は PR 本文かコメントに残す。セッションは PR を作った時点で終わるので、
  そこに無ければ人には届かない。
- description から Claude Code session へのリンクを削除しない。

## 本文の 1 行目

```
未確定の判断: N 件 — このまま merge すると worker が推奨案で進めます
未確定の判断: 0 件 — レビューをお願いします
```

grill のラウンドごとに更新する。N が 0 になったら `[<段階>, ai-assess:requested]` を 1 回書く（`question` が
落ち `ai-assess:requested` が 1 つ増えるので、AI 評価が 1 本起動する）。N > 0 の `propose` PR を人が merge
したら、`routine-dispatch` はそのまま `stage:apply` へ進め、残った問いは `routine-apply` が推奨案で採る。
merge は人の判断であり、問いを残したまま merge したことが「推奨案でよい」の回答だから。

# openspec を通さない変更

`.claude/` と `docs/` と直下の `CLAUDE.md` / `README.md` は、利用者へ提供するものを変えないので
propose を挟まず `docs` ラベルの PR を作ってよい。`openspec/` と製品の実ファイルが 1 行でも混ざれば
対象外。判定の正本は実 diff で、push 前に `git diff origin/main --stat` を見る。

issue 自体が docs だけで完結する（製品の変更を含まない）と判断したら、`docs` PR に `Closes #n` を書く。
merge で issue が閉じ、`Issue: Closed` で dispatch が依存を解放する。これが docs 経路の終わり方で、
`stage:propose` のまま open にしておかない。製品の目的地を定めた文書の改訂は issue を起票して人の判断を待つ。

# リポジトリの事情に従う

E2E の要否、スクリーンショットの方針、アーティファクトの作り先、教訓の書き残し先は、
リポジトリごとに違う。正本は custom。custom が無い、または触れていない事柄は、対象リポジトリの
`CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読み、そこに書かれたやり方に合わせる。
「基盤があるから回す」ではなく、ルールが求めているかで決める。
アーティファクトは、接続済みのコネクタに共有やビジュアライズを担うものがあればそちらを使う。

教訓や記録の `docs` PR を、作業のついでに作らない。記録は自分の PR 本文か issue コメントに書き、
取り込むかは人が決める。
