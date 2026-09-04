---
name: routine-common
description: issue-driven-sdd の routine-propose / routine-apply / routine-archive / routine-sweep が冒頭で参照する共通規則（ラベル定義・着手可否・wip 失効・PR の作り方・routine コメントの目印）。Routine から直接起動しない。
---

# routine-common

`issue-driven-sdd` の各 Routine スキルはこのスキルの規則に従う。矛盾する記述があれば、各スキルではなくこのスキルを直す。

## リポジトリと対象プロジェクトの解決

`{owner}/{repo}` は毎回 `gh repo view --json owner,name` で解決する。決め打ちしない。

着手してはいけない領域は、対象プロジェクトの `CLAUDE.md` に閉じた領域の節があればそれに従う。無ければ制約なしとして進める。プロジェクト固有のルールがあれば `.claude/rules/` を読み、そこに書かれた制約を優先する。

## ラベル

### issue（段階）

```
（なし）→ stage:propose → stage:apply → stage:archive → closed
           人が付ける      apply routine   archive routine   archive PR の Closes
```

同時に持てる段階ラベルは 1 つだけで、前にしか進まない。中間状態を表すラベルは持たない。仕様を詰めている途中かどうかは段階ラベルではなく、対応する PR 本文 1 行目の `未確定の判断: N 件` で表す。

### issue（修飾）

| ラベル | 意味 | 付ける | 外す |
| --- | --- | --- | --- |
| `wip` | AI が作業中。人間は触らない | 着手する routine | 完了した routine、または失効時に `routine-sweep` |

`wip` は open PR が無いまま既定 3 時間を超えると失効したとみなし、`routine-sweep` が外して回収する。この既定値を変えるときはここだけ直す。

### PR（段階）

`propose` / `apply` / `archive` / `docs` の 4 つ。次段階の Routine を起動するトリガー条件そのものなので、PR を作るときに必ずどれか 1 つを付ける。`docs` は `.claude/` と `docs/` だけを変える PR に使い、merge しても次段階は始めない。

### ラベル作成コマンド

新しいプロジェクトへこの構成を導入するときに実行する。

```bash
gh label create "stage:propose" --color 0E8A16 --description "AIが着手開始する。人間が唯一手動でつけるラベル。"
gh label create "stage:apply"   --color 1D76DB --description "proposal PR が merge されると AI が自動で付ける。ここから実装が始まる。"
gh label create "stage:archive" --color 5319E7 --description "実装 PR が merge されると AI が自動で付ける。archive PR の merge で issue が閉じる。"
gh label create "wip"           --color FBCA04 --description "AI が作業中。人間は触らない。open PR が無いまま 3 時間経つと AI が外す。"
gh label create "propose" --color 0E8A16 --description "AI が付ける PR ラベル。openspec の proposal を追加する PR。merge すると実装が始まる。"
gh label create "apply"   --color 1D76DB --description "AI が付ける PR ラベル。実装の PR。merge すると archive が始まる。"
gh label create "archive" --color 5319E7 --description "AI が付ける PR ラベル。openspec archive の PR。merge すると issue が閉じる。"
gh label create "docs"    --color C5DEF5 --description "AI が付ける PR ラベル。.claude/ と docs/ だけを変える PR。merge しても次の段階は始まらない。"
```

## 着手可否の判定

対象を決める前に、次をすべて確認する。いずれか 1 つでも満たさなければ着手せず、別候補を選ぶか終了する。

- 対象 issue に `wip` が付いていない、または付いていても失効条件を満たしている
- 対象 issue が他者にアサインされていない
- 依存する issue が閉じている、または依存関係がない
- 進行中の openspec change や open PR が同じファイル・同じ change を触っていない

着手すると決めたら、branch 作成やファイル編集より前に issue とラベルを再取得し、上記が変わっていないことを確認してから `wip` を付ける。ロックに失敗したら作業を奪わず、別候補を選ぶ。

並行性はセッションを複数走らせて出す。`wip` が衝突を防ぐので、着手可否は選定のたびに判断し、ラベルでは並行数を表さない。

## 不変条件

1. **`Closes #n` を書いてよいのは archive PR だけ。** propose / apply で書くと merge 時に issue が閉じ、以降の段階が起動しない。参照は `Refs #n` にする。
2. **draft PR は作らない。** 代わりに PR 本文 1 行目へ `未確定の判断: N 件` と書く。N > 0 の PR は `assess-pr-risk` が merge せず、merge されても `routine-apply` / `routine-archive` は実装せず差し戻す。
3. **routine のコメントは必ず `<!-- routine -->` で始める。** Routine の GitHub 操作は人と同じアカウントで現れ、アカウントでは判別できない。マーカー付きコメントは auto-fix で受け取っても反応しない。
4. **`tasks.md` に「投入後の実測」「本番で確認」節を作らない。** archive の判定は「全タスクが `[x]`」なので、セッション内で完了できない行が 1 本あると archive が止まる。実測は別 issue へ起票する。
5. **Routines の GitHub webhook は時間あたり上限を超えると黙って破棄される。** 状態の正本を起動成否に依存させない。`routine-sweep` が merge 済み PR と issue の段階を突き合わせて後追いで直す。
6. **grill（問いと回答の往復）を経た PR は自動 merge しない。** 人が答えたのは個別の問いであって、完成した proposal 全体は見ていない。
7. **1 セッション 1 issue 1 PR。** 複数の issue や複数の change をまたいで同時に進めない。

## PR の作り方

- title は `#<issue番号>: <要約>` にする。
- 本文 1 行目は必ず `未確定の判断: N 件`（N は現時点の未回答の問いの数。無ければ `未確定の判断: 0 件`）。
- 本文には目的、対象 change / plugin、検証コマンドと結果、既知の制約を書く。propose / apply では `Refs #<issue番号>`、archive では `Closes #<issue番号>`。
- 段階ラベルを 1 つ付ける（`propose` / `apply` / `archive` / `docs`）。未確定の判断があれば `question` も重ねて付ける。
- PR を作る直前に open PR を再取得し、同じ issue・同じ change・同じ plugin を扱う PR がないことを確認する。重複が見つかったら新規 PR を作らず、既存 PR に合流する。
