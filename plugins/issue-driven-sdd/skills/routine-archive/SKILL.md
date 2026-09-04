---
name: routine-archive
description: GitHub issue に stage:archive ラベルが付いたときに起動し、tasks 完了済みの openspec change を archive するスキル。openspec archive の実行・validate --strict・archive PR の作成までを担う。Routine「Issue: Labeled = stage:archive」の本体。段階ラベルは routine-dispatch が付けるので、このスキルは段階ラベルを書かない。「change を archive して」等の発話でも使う。
---

まず同じ plugin の `routine-common` skill を読み、そのラベル規約・PR の作り方に従う。

# 対象の特定

`routine-common` の「対象の特定」に従い、環境変数 `CCR_TRIGGER_ISSUE_NUMBER` から対象 issue を
読む。読めなければ推測せず、何が読めなかったかを報告して終える。

対象 issue の `Refs #n` を本文に持つ **merge 済みの `apply` ラベル PR** を探し、その PR が
触った change を起動の原因とする。見つからなければ issue へコメントして終える。

**このセッションで作る PR は 1 つ**（複数 change をまとめてよい）。

# 1. 着手できるかを判定する

`routine-common` の「着手可否の判定」を上から順に見る。`blocked` か生きた `wip` が付いていれば
黙って終える。着手すると決めたら「`wip` のロック」に従い、**`wip` を外して付け直す**。

# 2. archive 対象を判定する

`origin/main` の `openspec/changes/` 直下（`archive/` を除く）の各 change について
`tasks.md` を数える。

```bash
for d in openspec/changes/*/; do
  name="$(basename "$d")"
  [ "$name" = "archive" ] && continue
  [ -f "$d/tasks.md" ] || continue
  unchecked="$(grep -c '^- \[ \]' "$d/tasks.md")"
  checked="$(grep -c '^- \[x\]' "$d/tasks.md")"
  if [ "$unchecked" -eq 0 ] && [ "$checked" -ge 1 ]; then
    echo "ARCHIVABLE: $name"
  fi
done
```

**判定は決定論的にこのコマンドで行い、「終わっていそう」と主観で判断しない。**
`tasks.md` が無い change・未チェックが残る change は対象外。

起動の原因になった change が未チェックを残している場合は、その中身を読む。実行できない
タスク（本番実測・デプロイ後確認）が残っているなら、**その行を tasks から外して別 issue へ
起票し**（`routine-apply` と同じ措置）、そのうえで archive する。それ以外の未チェックが
残っているなら archive せず、issue へ何が残っているかをコメントし、`blocked-by: human` で
書き戻して終える。

該当が 0 件なら「archive 対象なし」と報告して終える。

# 3. archive を実行する

```bash
openspec archive "<change名>" --yes
```

- `--skip-specs` は使わない（tooling-only の変更でない限り）。デルタ仕様はメイン仕様へ同期する。
- **`openspec/specs/` は進行中 change が delta を持ちやすい。apply 直前に本文を読み直して
  delta を取り直す**（古いスナップショットのまま素朴に置換すると、他 change の delta を消す）。
- 既に `archive/` に同名がある等で失敗したら、その change だけスキップして報告し、他は続行する。

全対象を archive したら `openspec validate --strict` を緑にする。archive 済みの本文を
破壊するような修正が要る場合は、続行せず何が問題かを報告する。

# 4. コミットする

change 1 つにつき 1 つの `chore(openspec)` コミットにする（削除を含むので `git add -A`）。

```bash
git add -A "openspec/changes/<change名>" "openspec/changes/archive" "openspec/specs"
```

`git status --short` が空になったことを確認してから進む。

# 5. PR を作って終える

`routine-common` の「PR の作り方」に従う。

- title: `[archive] #<n> <change名>`（複数なら代表 1 件 + 件数）
- **本文に `Closes #n` を書く**（archive PR だけがこれを書いてよい）。複数 issue なら全件列挙する
- ラベル: `archive`
- archive した change 名と `validate --strict` が緑であることを本文に書く

PR を作った時点でセッションは完了。merge で issue が閉じ、`wip` ごと役目を終える。

# やってはいけないこと

- tasks 未完了の change を archive する（§2 の grep 判定に従う）
- **他セッションが作業中の change を archive する。** archive はディレクトリを移動するので、
  相手の編集を止め、古い設計で spec 正本を上書きする。open PR が触っている change は対象外
- PR が merge される前に issue を閉じる
- 段階ラベルを書く
