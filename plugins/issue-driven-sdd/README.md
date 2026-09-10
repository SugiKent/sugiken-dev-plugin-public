# issue-driven-sdd

GitHub Issue のラベル 1 本で開発の段階を表し、Claude Code の Routines が段階ごとに起動して OpenSpec の
propose → apply → archive を回す構成。人は issue に `stage:todo` を付けるだけで、着手の順番は dispatcher が
決める。同じ構成を別プロジェクトに 30 分で作れることを狙う。

前提として `openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。

## ラベル

issue の段階は「なし」→ `stage:todo` → `stage:propose` → `stage:apply` → `stage:archive` → closed の順に進む。
`stage:todo` は人が付け、それ以降は `routine-dispatch` だけが付ける。修飾ラベル `wip` は worker が作業中の印、
`blocked` は宣言されたブロッカーが解けるまで着手しない印。PR のラベル `propose` / `apply` / `archive` は
merge を受けた dispatcher がどの段階へ進めるかを決める。`question` は issue と PR に共通の「人の入力待ち」で、
`is:open label:question` の 1 検索で人が見るべきものが全部出る。`ai-assess:requested` は PR の AI 評価を
要求する印。定義と書き手は `skills/routine-common/SKILL.md` が正本。

## スキル

| スキル | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 全 routine が冒頭で読む | ラベル規約と、どの書き込みが何を起動するか。worker 用の手順は `references/worker.md` |
| `routine-dispatch` | `Issue: Labeled` = `stage:todo`、`Issue: Closed`、`PR merged` = `propose` / `apply` | 起動の原因になった 1 件だけを見て段階を進め、それを待っていた issue を放出する。段階ラベルの唯一の書き手 |
| `routine-propose` | `Issue: Labeled` = `stage:propose` | proposal を作る。未確定の判断は PR 上で問い、同じセッションで詰め切る |
| `routine-apply` | `Issue: Labeled` = `stage:apply` | merge 済み proposal、または事後起票で `origin/main` に入っている change を実装し `apply` PR を作る |
| `routine-archive` | `Issue: Labeled` = `stage:archive` | `openspec archive` を実行し `archive` PR（`Closes #n`）を作る |
| `routine-sweep` | Schedule | リポジトリ全体を突き合わせ、人の回答・dispatch が受け付けなかった `stage:todo`・死んだ worker・却下・残骸・循環・孤児を拾う（未着手の孤児 change は起票する） |
| `routines-setup` | 手動 | ラベルと Routine の現状を読み、あるべき状態との差分を直す |

Routine の本文は skill を読んで実行する 1 行だけにし、判断規則は skill 側に置く。設定表は `routines-setup` にある。
PR の自動評価（`assess-pr-risk`）はこの plugin に含めず、プロジェクトごとに任意で作る。

## 動きかた

1. 人が issue に `stage:todo` を付ける。dispatcher が本文の `depends on #m` を見て、解けていれば
   `stage:propose` を付け、解けていなければ `blocked` を付けて理由をコメントする。人が手元で change を
   書き切って `origin/main` に入れてから issue を起票した場合（事後起票）は、proposal の `issue: #n` か
   issue 本文の `change: <change名>` で対応を引き、propose を飛ばして `stage:apply` を付ける。
2. propose worker が起動する。進行中の作業と衝突するなら `blocked-by:` を書き戻して終え、着手できるなら
   `wip` を付けて proposal の PR を作る。PR に `ai-assess:requested` を付けると AI 評価が走る。
3. propose PR が merge されると dispatcher が `stage:apply` へ進め、apply worker が実装して `apply` PR を作る。
4. apply PR が merge されると dispatcher が `stage:archive` へ進め、archive worker が archive PR を作る。
   merge で issue が閉じる。
5. issue が閉じると dispatcher が、それを待っていた `blocked` の issue を放出する。依存が解けた順に
   次々と着手が始まる。
6. worker が利用上限などで途中で死んでも、sweep が worker の session 状態を見て段階ラベルを付け直し
   再起動する。3 回死んだら `question` を付けて人に問う。
7. worker が人の判断を要すると決めた issue には `blocked` と `question` が付く。人が issue にコメントすると、
   次の sweep が worker を起動し直し、worker が全コメントを読んで進む。

worker は調査の結果を必ず `blocked-by:` で書き戻す。調査は 1 回しか払わず、解消の検知は dispatcher が安く行う。

## イベントが落ちたときの回復

段階の遷移はすべて GitHub のイベント 1 回で起動する。イベントは 1 回きりで、その瞬間に Routine が
起動しなければ（Routine の停止・利用上限・環境の setup 失敗など）GitHub 側には何も残らず、誰も
その issue を再評価しない。これが「ゾンビ issue」の正体で、sweep はこれを拾うために存在する。

正常時。sweep の出番は無い。

```
人が #707 に stage:todo を付ける
  └→ GitHub が issues.labeled を送る
       └→ dispatch が 1 本起動
            └→ 手順 A: depends on を評価
                 ├ 解けている → [stage:propose] を書く → propose worker 起動
                 └ 塞がっている → blocked-by: コメント + [stage:todo, blocked]
```

異常時。dispatch が起動しなかった。

```
人が #707 に stage:todo を付ける
  └→ issues.labeled は送られたが、dispatch が起動しない
  └→ GitHub 側にはもう何のイベントも残っていない
  └→ #707 は stage:todo のまま放置  ← ゾンビ
```

sweep（Schedule）が拾う。dispatch の手順 A が完走した issue は「段階が進む」か「`[stage:todo, blocked]` に
なる」のどちらかなので、`stage:todo` のまま `blocked` も無く一定時間が過ぎた issue は dispatch が受け付けて
いないと判定できる。

```
sweep 起動（毎時）
  ├ 手順 1: 残骸掃除
  ├ 手順 2: blocked の再評価（人の回答はイベントにならないので、ここが唯一の拾い場所）
  ├ 手順 3a: dispatch が受け付けなかった stage:todo を、番号順に数件ずつ dispatch 手順 A で受け付ける
  │          → [stage:propose] を書く → propose worker 起動。残りは「順番待ち」として報告
  ├ 手順 3b: 死んだ worker を再起動（restart: を数え、3 回で人に戻す）
  └ 手順 4〜7: 止まった PR の引き継ぎ・循環ブロック・孤児 proposal / change
```

一斉に放出しないのは、worker が同時に多く起動すると利用上限で全員が途中で死に、3b の再起動に流れ込む
だけだから。10 件溜まっていれば数時間かけて順に動き出す。しきい値（放置とみなす時間・1 回に受け付ける
件数）は `skills/routine-sweep/SKILL.md` の手順 3a にある。

sweep の報告に「dispatch が受け付けなかった `stage:todo` の数」が出る。これが毎時 0 でないなら
dispatch の webhook が届いていないので、人が Routines の画面を確かめる合図になる。sweep 自身が
止まっている場合はこの仕組みでも拾えない。

## Routines の制約と設計判断

2026-09-06 の運用監査（1 日 170 session のうち半分が無駄起動・重複実装）と 2026-09-07 の実機検証を
踏まえた判断。

- **`Issue: Labeled` のフィルターは「追加されたラベル」ではなく「操作後の issue のラベル集合」で判定される。**
  追加ラベル単体を条件にはできない。そのため worker の Routine は `stage:X` かつ
  `NOT IN [wip, blocked, question]` で受け、worker 自身の `wip` 書き込みで再起動しないようにする。
- **GitHub コネクタのラベル操作は集合置換しかない。** 1 回の書き込みで増えたラベルの数だけイベントが出て、
  減っただけの書き込みは何も起動しない。この規則をラベル遷移表（`routine-common`）に落とし、
  「起動させたい書き込みは追加を含む」「dispatch は段階ラベル 1 つだけ書く」を守る。
- **同じ issue を同時に書く主体を減らす。** イベント起動の dispatch は起動の原因になった 1 件だけを扱い、
  全件の突き合わせは sweep に集約する。sweep は直近のラベルイベントがある issue を触らない。
  それでも dispatch と sweep が数秒差で同じ issue を書く窓は残る。skill の文面で零にはできない。
- **PR の受付は `PR labeled` で行う。** `PR opened` + ラベル条件は、作成後にラベルを付ける worker の
  手順では成立しない。
- **Routines に「Issue のコメント」イベントトリガーは無い。** issue 上で人へ問うても、答えを拾うのは
  次の sweep になる。PR のコメントは `autofix_on_pr_create` で作成元 worker の同じセッションが受け取るので、
  人との質疑応答（grill）は PR に寄せる。

## 人の役割

1. issue に `stage:todo` を付ける
2. `question` が付いた PR / issue にコメントで答える
3. PR を merge する

人が触るラベルは `stage:todo` だけ。`blocked` / `question` の付け外しと worker の再起動は routine が行う。
順番を飛ばして今すぐ着手させたいときだけ `stage:propose` / `stage:apply` を直接付ける。操作の一覧は
`skills/routine-common/SKILL.md` の「人が持つ操作」。

## プロジェクトごとの調整

`.claude/skills/issue-driven-sdd-custom/SKILL.md` に外れる点だけを書く。worker が `origin/main` から読む。
dispatch と sweep は読まないので、時間や回数のしきい値は plugin 側で変える。雛形は `routines-setup` にある。

## スコープ外

- GitHub Actions による遷移。Routines のイベント起動と sweep で足りる
- 複数リポジトリの横断。1 Routine 1 リポジトリ
- 同時実行数の上限。イベント起動の dispatch は解けたものを全部放出する。件数を絞るのは sweep の回復時だけ
- フォールバックタスクの自動生成。着手対象が無いときは「無い」と報告して終える
- PR の AI 評価（`assess-pr-risk`）と retro。プロジェクト側で任意に作る
