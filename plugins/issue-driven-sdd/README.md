# issue-driven-sdd

GitHub Issue のラベル 1 本で開発の段階を表し、Claude Code の Routines が段階ごとに起動して OpenSpec の propose → apply → archive を回す構成。人は issue に `stage:todo` を付けるだけで、着手の順番は dispatcher が決める。同じ構成を別プロジェクトに 30 分で作れることを狙う。

前提として `openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。

## ラベル

issue の段階は「なし」→ `stage:todo` → `stage:propose` → `stage:apply` → `stage:archive` → closed の順に進む。`stage:todo` は人が付け、それ以降は `routine-dispatch` だけが付ける。段階ラベルは同時に 1 つだけ、前にしか進まない。

修飾ラベルは 2 つ。`wip` は worker が作業中のロック。`blocked` は宣言されたブロッカーが解けるまで着手しない印で、理由は issue の最新の `blocked-by:` コメントにある。

PR のラベル `propose` / `apply` / `archive` / `docs` は、merge を受けた dispatcher がどの段階へ進めるかを決める。`question` は人へ問うている未確定の判断が残っている PR に重ねて付け、merge してはいけないことを示す。詳しい規則は `skills/routine-common/SKILL.md` を参照。

## スキル

| スキル | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 全スキルが冒頭で参照 | ラベル定義・ラベルの書き手・対象の特定・着手可否・見送りの書き戻し・PR の作り方 |
| `routine-dispatch` | `Issue: Labeled` = `stage:todo`、`Issue: Closed`、`PR merged` = `propose` / `apply` | GitHub の状態だけを読んで、段階を進める・ブロックが解けた issue を放出する・死んだ worker を再起動する。段階ラベルの唯一の書き手 |
| `routine-propose` | `Issue: Labeled` = `stage:propose` | proposal を作る。未確定の判断があれば PR 上で問い、同じセッションで回答を受けて詰め切る |
| `routine-apply` | `Issue: Labeled` = `stage:apply` | merge 済み proposal の change を実装し `apply` PR を作る |
| `routine-archive` | `Issue: Labeled` = `stage:archive` | `openspec archive` を実行し `archive` PR（`Closes #n`）を作る |
| `routine-sweep` | Schedule | `routine-dispatch` と同じ手順を定期実行し、応答が止まった PR を引き継ぐ。イベントが落ちたときの保険 |
| `assess-pr-risk` | 手動 / `PR opened` ∧ label `apply` or `archive` | PR のリスクを評価し、低ければ merge する |
| `create-github-issues` | 手動 | バックログを issue にする。段階ラベルは付けない |
| `routines-setup` | 手動 | ラベルと Routine の現状を読み、あるべき状態との差分を直す。何度実行してもよい |

Routine 本文は次の 1 行だけにする。判断規則はすべてスキル側に置き、Routine を作り直しても規則が失われないようにする。

```
`routine-propose` skill を読み、そのとおりに実行する。
```

## 動きかた

1. 人が issue に `stage:todo` を付ける。dispatcher が起動し、本文の `depends on #m` などの宣言されたブロッカーを見る。解けていれば `stage:propose` を付け、解けていなければ `blocked` を付けて理由をコメントする。
2. `stage:propose` で propose worker が起動する。コードと spec を調べ、進行中の作業と衝突するなら `blocked-by: #m` を書き戻して `blocked` を付け、終える。着手できるなら `wip` を付けて proposal の PR を作る。
3. propose PR が merge されると dispatcher が起動し、issue を `stage:apply` へ進める。apply worker が起動し、実装して `apply` PR を作る。
4. apply PR が merge されると dispatcher が `stage:archive` へ進め、archive worker が archive PR を作る。merge で issue が閉じる。
5. issue が閉じると dispatcher が起動し、それを待っていた `blocked` の issue を放出する。
6. worker が利用上限などで途中で死んでも、次のイベントか sweep で dispatcher が段階ラベルを付け直して再起動する。3 回死んだら人に渡す。

worker は調査の結果を必ず `blocked-by:` で書き戻す。調査は 1 回しか払わず、解消の検知は dispatcher が安く行う。

## 人の役割

1. issue に `stage:todo` を付ける
2. PR のスレッドで質問に答える
3. PR を merge する
4. `blocked-by: human` で戻ってきた issue の方針を決める

順番を飛ばして今すぐ着手させたいときは `stage:propose` を直接付ける。死んだ worker をやり直させたいときは段階ラベルを外して付け直す。

## Routine の設定表

| Name | Trigger | Filter | model | autofix_on_pr_create |
| --- | --- | --- | --- | --- |
| `<project> dispatch` | `Issue: Labeled` / `Issue: Closed` / `PR merged` / `PR merged` | `stage:todo` / なし / `propose` / `apply` | sonnet | false |
| `<project> propose` | `Issue: Labeled` | `stage:propose` | 既定 | **true** |
| `<project> apply` | `Issue: Labeled` | `stage:apply` | 既定 | **true** |
| `<project> archive` | `Issue: Labeled` | `stage:archive` | 既定 | false |
| `<project> sweep` | Schedule（間隔はプロジェクトで決める） | なし | 既定 | false |
| `<project> assess-pr-risk` | `PR opened` | `apply` または `archive` | 既定 | false |

導入と追従は `routines-setup` skill が行う。

## 守る不変条件

規則本体は `skills/routine-common/SKILL.md` に置く。要点だけここに書く。

1. `Closes #n` を書いてよいのは archive PR だけ。propose / apply では `Refs #n`
2. draft PR は作らない。代わりに PR 本文の 1 行目に未確定の判断の件数を書き、件数が 0 より大きいあいだは `question` ラベルを付ける。件数とラベルは常に一致させる
3. routine のコメントは必ず `<!-- routine -->` で始める
4. `tasks.md` に事後の実測・確認節を作らない。archive の判定は全タスク `[x]` のため
5. 段階ラベルを書くのは `routine-dispatch` だけ。worker は `wip` と `blocked` と PR ラベルだけを書く
6. ラベルの書き込みは routine を再起動させる。worker は起動直後に `blocked` と `wip` を見て、付いていれば黙って終える。ラベルは 1 操作 1 ラベルで付け外しする
7. 見送りの理由は必ず `blocked-by:` で書き戻す。dispatcher はそれ以外の理由を知らない
8. webhook は上限超過で黙って破棄され、セッションは利用上限で途中で死ぬ。`routine-sweep` が同じ判定を定期実行して拾う
9. grill を経た PR は自動 merge しない
10. 1 セッション 1 issue 1 PR。並行性はセッションを複数走らせて出し、`wip` が衝突を防ぐ
11. Routines の仕様は UI と API 応答で確かめる。公式ドキュメントに無い `Issue: Labeled` トリガーや `autofix_on_pr_create` が UI には存在する

## パラメータ化する箇所

| 項目 | この plugin での扱い |
| --- | --- |
| リポジトリ名 `{owner}/{repo}` | `CCR_TRIGGER_REPO`、無ければ GitHub コネクタで解決する |
| 着手してはいけない領域 | 対象プロジェクトの `CLAUDE.md` に閉じた領域の節があればそれに従う |
| propose / apply / archive の実体 | `openspec` plugin のスキルを参照する |
| `wip` の失効時間 | 既定 3 時間。`routine-common` と `routine-dispatch` で変える |
| 再起動の上限 | 既定 3 回。`routine-dispatch` で変える |
| sweep の間隔 | プロジェクトごとに決める |
| プロジェクト固有のルール | `CLAUDE.md`・`.claude/rules/`・`.claude/skills/` を読む |

## スコープ外

- GitHub Actions による遷移。Routines のイベント起動と sweep で足りる
- 複数リポジトリの横断。1 Routine 1 リポジトリ
- 同時実行数の上限。解けたものは全部放出する
- フォールバックタスクの自動生成。着手対象が無いときは「無い」と報告して終える
