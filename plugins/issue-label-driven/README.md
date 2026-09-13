# issue-label-driven

GitHub Issue のラベル `To Do` → `In Progress` → `Done` だけで開発を進める構成。人が issue に `To Do` を
付けると Claude Code の Routine が起動して実装し、`Closes #n` の PR を作る。merge で issue が閉じ、`Done` が付く。
**issue 1 件 = 実装 PR 1 本。** OpenSpec の propose / apply / archive は挟まない。

導入には、Routine の作成・更新を共通化する `claude-code-routines` plugin も必要。

```bash
claude plugin install claude-code-routines@sugiken-dev-public
```

`issue-driven-sdd` の実測で確定した Routines の制約（ラベル集合で判定・追加だけが起動・N 追加で N 本起動）を
前提に、**ラベル遷移を全部「1 回の書き込みで追加を含む」形に揃えている**。sdd で面倒だった 2 回書きと
その修復（`release:` / `restart:`）は消える。

## ラベル

| ラベル | 意味 | 付ける |
| --- | --- | --- |
| `To Do` | 承認済み。worker が着手してよい | 人、または放出する dispatch / sweep |
| `In Progress` | worker が作業中 | worker |
| `Done` | merge 済み PR によって閉じた印 | dispatch |
| `blocked` | 依存や人の判断待ち。理由は `blocked-by:` コメント | worker |
| `question` | 人の入力待ち。issue では `blocked` に重ねる。PR では merge 禁止の印 | worker |

定義・遷移表・書き手は `skills/routine-common/SKILL.md` が正本。

## スキル

| スキル | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 全 routine が冒頭で読む | ラベル規約・遷移表・worker の共通手順 |
| `routine-work` | `Issue: Labeled` = `To Do` | 着手判定 → `In Progress` → 実装 → `Closes #n` の PR。レビューは同じセッションで対応 |
| `routine-dispatch` | `Issue: Closed` | merge 済み PR があれば `Done`、無ければ空集合。待っていた issue を `To Do` で放出 |
| `routine-sweep` | Schedule | 死んだ worker の再起動、`blocked` の再評価、merge されず閉じた PR、応答が止まった PR |
| `routines-setup` | 手動 | ラベル 5 本を揃え、`claude-code-routines:manage-routines` で Routine 3 本を適用・検証 |

## 動きかた

1. 人が issue に `To Do` を付ける。work が起動する。
2. worker が着手可否を判定する。着手なら `In Progress` に置き換えて実装し、PR を作る。見送りなら
   `blocked-by:` をコメントして `blocked`（人の判断なら `blocked, question`）に置き換える。
3. PR を merge すると GitHub が issue を閉じ、dispatch が `Done` を付け、その issue を待っていた
   `blocked` の issue を `To Do` で放出する。
4. worker が途中で死んでも sweep が `To Do` を付け直して再起動する。3 回で `question` を付けて人に問う。
5. `question` の issue に人がコメントすると、次の sweep が `To Do` を付け直し、worker が全コメントを読んで進む。

## 人の役割

1. issue に `To Do` を付ける
2. `question` が付いた PR / issue にコメントで答える
3. PR を merge する

## sdd から変えたこと

- すべての PR に `Closes #n` を書く。`Done` に至る唯一の経路
- `In Progress` は worker が書く。`To Do` / `Done` は dispatch / sweep が書く
- `blocked` の issue に `To Do` を残さない。`label:"To Do"` で「承認済みだが blocked」は出なくなるが、
  承認の事実は `blocked-by:` コメントに残る
- `PR closed` トリガーと `stage:*` / `wip` / PR ラベルは無い

## プロジェクトごとの調整

`.claude/skills/issue-label-driven-custom/SKILL.md` は Routine id の記録先なので常に置く。`## 共通` / `## work` には
既定から外れる点だけを書く。雛形は `routines-setup` にある。

## スコープ外

- OpenSpec。仕様を書いてから実装したいなら `issue-driven-sdd`
- PR の AI 評価（`assess-pr-risk`）。プロジェクト側で任意に作る
- 循環依存の検出。互いに `depends on` する issue は人が解く
- 複数リポジトリの横断、同時実行数の上限
