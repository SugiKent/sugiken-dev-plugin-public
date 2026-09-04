# issue-driven-sdd

GitHub Issue のラベル 1 本で開発の段階を表し、Claude Code の Routines が段階ごとに起動して OpenSpec の propose → apply → archive を回す構成。同じ構成を別プロジェクトに 30 分で作れることを狙う。

前提として `openspec` plugin（propose / apply / archive の実体）を対象プロジェクトへ導入していること。

## ラベル

```
issue:  （なし）→ stage:propose → stage:apply → stage:archive → closed
                   人が付ける      apply routine   archive routine   archive PR の Closes
        修飾: wip（作業中ロック。open PR 無しで 3 時間超なら失効）

PR:     propose / apply / archive / docs   ← 次段階の Routine のトリガー条件そのもの
        修飾: question（人へ問うている未確定の判断が残っている。merge してはいけない）
```

段階ラベルは同時に 1 つだけ、前にしか進まない。`question` は段階ラベルと直交するので重ねて付ける。仕様を詰めている途中かどうかは PR 本文 1 行目の `未確定の判断: N 件` と `question` ラベル（N > 0 ⇔ 付いている）の両方で表す。詳しい規則は `skills/routine-common/SKILL.md` を参照。

## スキル

| スキル | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 全スキルが冒頭で参照 | ラベル定義・着手可否の判定・`wip`・PR の作り方・`<!-- routine -->` マーカー |
| `routine-propose` | `Issue: Labeled` = `stage:propose` | proposal を作る。未確定の判断があれば PR 上で問い、同じセッションで回答を受けて詰め切る |
| `routine-apply` | `PR merged` ∧ label `propose` | issue を `stage:apply` へ → 実装 → `apply` PR |
| `routine-archive` | `PR merged` ∧ label `apply` | issue を `stage:archive` へ → `openspec archive` → `archive` PR（`Closes #n`） |
| `routine-sweep` | schedule（1 時間以上の間隔） | ラベルと実態の修復・`wip` 失効回収・応答が止まった PR の引き継ぎ・着手可能な issue を 1 つ実行 |
| `assess-pr-risk` | 手動 / `PR opened` | PR のリスクを評価し、低ければ merge する |
| `create-github-issues` | 手動 | バックログを issue にする。段階ラベルは付けない |

Routine 本文は次の 1 行だけにする。判断規則はすべてスキル側に置き、Routine を作り直しても規則が失われないようにする。

```
`.claude/skills/routine-propose/SKILL.md` を読み、そのとおりに実行する。
```

（この plugin を導入すると skill は `plugins/issue-driven-sdd/skills/<name>/SKILL.md` に配置されるので、実際の Routine 本文は導入方法に応じたパスに読み替える。）

## Routine の設定表

| Name | Trigger | Filter | autofix_on_pr_create |
| --- | --- | --- | --- |
| `<project> propose` | Custom → `Issue: Labeled` | Labels contains `stage:propose` | **true** |
| `<project> apply` | `PR merged` | Labels contains `propose` | **true** |
| `<project> archive` | `PR merged` | Labels contains `apply` | false |
| `<project> sweep` | Schedule | なし | **true**（sweep 自身が propose を実行しうる） |
| `<project> assess-pr-risk` | `PR opened` | なし | false |

`autofix_on_pr_create` は Routine 単位の設定（API の `session_context`、UI にもトグル）。`true` の Routine が作った PR は、その PR を作ったセッションがレビュー・会話コメントを受け取り続ける。仕様を詰める往復（grill）はこれに乗せる。

## 人の役割は 3 つだけ

1. issue に `stage:propose` を付ける
2. PR のスレッドで質問に答える
3. PR を merge する

## 導入手順

1. ラベル 9 個を作る（コマンドは `skills/routine-common/SKILL.md` の「ラベル作成コマンド」参照）
2. `openspec` plugin を前提として導入する
3. Claude GitHub App をリポジトリに install する（webhook 配送に必須。Web セットアップだけでは届かない）
4. Routine 5 本を上記の設定表どおりに作る。schedule の sweep は Routines の schedule 機能から、イベント起動の 4 本は UI から
5. 最初の 1 件で確認する
   - `Issue: Labeled` の Filter が発火する（起票時にラベルを付けた場合と、既存 issue に付けた場合の両方）
   - propose セッションが作った PR に auto-fix が付き、会話コメントへ同じセッションが応答する
   - Routine セッションから `gh api` で issue のラベルを付け替えられる（GraphQL は 403 になるので REST を使う）
   - `propose` PR の merge で apply Routine が起動する

## 守る不変条件

規則本体は `skills/routine-common/SKILL.md` に置く。要点だけここに書く。

1. `Closes #n` を書いてよいのは archive PR だけ。propose / apply では `Refs #n`
2. draft PR は作らない。代わりに PR 本文 1 行目へ `未確定の判断: N 件` と、N > 0 のあいだ `question` ラベル。この 2 つは常に一致させる
3. routine のコメントは必ず `<!-- routine -->` で始める
4. `tasks.md` に事後の実測・確認節を作らない。archive の判定は全タスク `[x]` のため
5. Routines の webhook は上限超過で黙って破棄されうるため、`routine-sweep` が後追いで直す
6. grill を経た PR は自動 merge しない
7. 1 セッション 1 issue 1 PR。並行性はセッションを複数走らせて出し、`wip` が衝突を防ぐ
8. Routines の仕様は UI と API 応答で確かめる。公式ドキュメントに無い `Issue: Labeled` トリガーや `autofix_on_pr_create` が UI には存在する

## パラメータ化する箇所

| 項目 | この plugin での扱い |
| --- | --- |
| リポジトリ名 `{owner}/{repo}` | `gh repo view` で解決する |
| 着手してはいけない領域 | 対象プロジェクトの `CLAUDE.md` に閉じた領域の節があればそれに従う |
| propose / apply / archive の実体 | `openspec` plugin のスキルを参照する |
| `wip` の失効時間 | 既定 3 時間。`routine-common` の 1 箇所で変える |
| プロジェクト固有のルール | `.claude/rules/` を読む |

## スコープ外

- GitHub Actions による遷移。Routines の `Issue: Labeled` / `PR merged` で足りる
- 複数リポジトリの横断。1 Routine 1 リポジトリ
- フォールバックタスクの自動生成。着手対象が無いときは「無い」と報告して終える
