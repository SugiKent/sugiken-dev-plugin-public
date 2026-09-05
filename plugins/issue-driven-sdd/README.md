# issue-driven-sdd

GitHub Issue のラベル 1 本で開発の段階を表し、Claude Code の Routines が段階ごとに起動して OpenSpec の
propose → apply → archive を回す構成。人は issue に `stage:todo` を付けるだけで、着手の順番は dispatcher が
決める。同じ構成を別プロジェクトに 30 分で作れることを狙う。

前提として `openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。

## ラベル

issue の段階は「なし」→ `stage:todo` → `stage:propose` → `stage:apply` → `stage:archive` → closed の順に進む。
`stage:todo` は人が付け、それ以降は `routine-dispatch` だけが付ける。修飾ラベル `wip` は worker のロック、
`blocked` は宣言されたブロッカーが解けるまで着手しない印。PR のラベル `propose` / `apply` / `archive` は
merge を受けた dispatcher がどの段階へ進めるかを決める。`question` は issue と PR に共通の「人の入力待ち」で、
`is:open label:question` の 1 検索で人が見るべきものが全部出る。定義と書き手は `skills/routine-common/SKILL.md` が正本。

## スキル

| スキル | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 全 routine が冒頭で読む | ラベル規約。worker 用の手順は `references/worker.md` |
| `routine-dispatch` | `Issue: Labeled` = `stage:todo`、`Issue: Closed`、`PR merged` = `propose` / `apply` | GitHub の状態だけを読んで段階を進め、ブロックが解けた issue を放出し、死んだ worker を再起動する。段階ラベルの唯一の書き手 |
| `routine-propose` | `Issue: Labeled` = `stage:propose` | proposal を作る。未確定の判断は PR 上で問い、同じセッションで詰め切る |
| `routine-apply` | `Issue: Labeled` = `stage:apply` | merge 済み proposal の change を実装し `apply` PR を作る |
| `routine-archive` | `Issue: Labeled` = `stage:archive` | `openspec archive` を実行し `archive` PR（`Closes #n`）を作る |
| `routine-sweep` | Schedule | dispatch と同じ修復を定期実行し、止まった PR と循環ブロックを拾う |
| `routines-setup` | 手動 | ラベルと Routine の現状を読み、あるべき状態との差分を直す |

Routine の本文は skill を読んで実行する 1 行だけにし、判断規則は skill 側に置く。設定表は `routines-setup` にある。
PR の自動 merge（`assess-pr-risk`）はこの plugin に含めず、プロジェクトごとに任意で作る。

## 動きかた

1. 人が issue に `stage:todo` を付ける。dispatcher が本文の `depends on #m` を見て、解けていれば
   `stage:propose` を付け、解けていなければ `blocked` を付けて理由をコメントする。
2. propose worker が起動する。進行中の作業と衝突するなら `blocked-by:` を書き戻して終え、着手できるなら
   `wip` を付けて proposal の PR を作る。
3. propose PR が merge されると dispatcher が `stage:apply` へ進め、apply worker が実装して `apply` PR を作る。
4. apply PR が merge されると dispatcher が `stage:archive` へ進め、archive worker が archive PR を作る。
   merge で issue が閉じる。
5. issue が閉じると dispatcher が、それを待っていた `blocked` の issue を放出する。依存が解けた順に
   次々と着手が始まる。
6. worker が利用上限などで途中で死んでも、次のイベントか sweep で dispatcher が段階ラベルを付け直して
   再起動する。3 回死んだら `question` を付けて人に問う。
7. worker が人の判断を要すると決めた issue には `blocked` と `question` が付く。人が issue にコメントすると、
   次の dispatcher（sweep）が worker を起動し直し、worker が全コメントを読んで進む。

worker は調査の結果を必ず `blocked-by:` で書き戻す。調査は 1 回しか払わず、解消の検知は dispatcher が安く行う。

## Routines の制約と設計判断

- **Routines に「Issue のコメント」イベントトリガーは無い。** issue に人がコメントしても routine は
  起動しない。issue 上で人へ問うても、答えを拾うのは次の sweep になる。
- **PR のコメントは、その PR を作った worker が同じセッションで受け取る**（`autofix_on_pr_create`）。
  問いと答えと修正が 1 セッションに閉じ、文脈を失わない。
- したがって **人との質疑応答（grill）は PR に寄せる**（`routine-propose`）。issue への
  `blocked-by: human` は、方針の変更・人による却下・worker の連続失敗など、PR が存在しない例外に限り、
  答えは sweep の間隔で拾われる。

## 人の役割

1. issue に `stage:todo` を付ける
2. `question` が付いた PR / issue にコメントで答える
3. PR を merge する

人が触るラベルは `stage:todo` だけ。`blocked` / `question` の付け外しと worker の再起動は routine が行う。
順番を飛ばして今すぐ着手させたいときだけ `stage:propose` を直接付ける。操作の一覧は
`skills/routine-common/SKILL.md` の「人が持つ操作」。

## プロジェクトごとの調整

`.claude/skills/issue-driven-sdd-custom/SKILL.md` に外れる点だけを書く。worker が `origin/main` から読む。
dispatch は読まないので、時間や回数のしきい値は plugin 側で変える。雛形は `routines-setup` にある。

## スコープ外

- GitHub Actions による遷移。Routines のイベント起動と sweep で足りる
- 複数リポジトリの横断。1 Routine 1 リポジトリ
- 同時実行数の上限。解けたものは全部放出する
- フォールバックタスクの自動生成。着手対象が無いときは「無い」と報告して終える
