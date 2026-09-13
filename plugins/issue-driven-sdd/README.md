# issue-driven-sdd

GitHub Issue のラベルを状態として、Claude Code Routines が OpenSpec の propose → apply → archive を進める plugin。
対象プロジェクトには `openspec` plugin も必要。setup は `claude-code-routines` plugin の共通操作 skill を使う。

```bash
claude plugin install claude-code-routines@sugiken-dev-public
```

```text
人: stage:todo
  → dispatch: stage:propose
  → propose PR merge
  → dispatch: stage:apply
  → apply PR merge
  → dispatch: stage:archive
  → archive PR merge / issue close
```

`blocked` は依存待ち、`wip` は worker の実行中、`question` は人の回答待ちを表す。詳しい状態・書き手・
コメント形式の正本は `skills/routine-common/SKILL.md`。

## skills

| skill | 起動 | 責務 |
| --- | --- | --- |
| `routine-common` | 他 routine から参照 | 状態モデルと共通 protocol |
| `routine-dispatch` | issue labeled / closed、PR merged | 対象 event を次段階へ進め、依存を解放 |
| `routine-propose` | `stage:propose` | proposal PR と意思決定の grill |
| `routine-apply` | `stage:apply` | change を実装して apply PR を作成 |
| `routine-archive` | `stage:archive` | 完了 change を archive して closing PR を作成 |
| `routine-sweep` | Schedule | event 漏れ、停止 worker、残骸、循環、孤児を修復 |
| `routines-setup` | 手動 | labels と Routines を導入・更新 |

Routine の本文は対応 skill を読む 1 行だけにし、判断規則は skill 側に置く。設定表は
`skills/routines-setup/SKILL.md`。

## 人が行うこと

1. issue に `stage:todo` を付ける
2. `question` の issue / PR にコメントで答える
3. PR を merge する

順番を飛ばす操作、事後起票、依存の取り下げは `routine-common` の「人が持つ操作」を参照する。

## 回復

event 起動に失敗すると issue 側に再評価の契機が残らない。`routine-sweep` が定期的に、受け付けられなかった
`stage:todo`、死んだ worker、人の回答、却下 PR、孤児 change を回収する。しきい値と修復手順の正本は
`skills/routine-sweep/SKILL.md`。

## プロジェクト固有の調整

既定から外れる点だけを `.claude/skills/issue-driven-sdd-custom/SKILL.md` に書く。worker は
`origin/main` から読む。dispatch / sweep の時間・回数しきい値は plugin 側の正本を使う。

PR の AI 評価は plugin の外にある任意機能。導入方法は
`skills/routines-setup/references/assess.md`。
