---
name: routine-archive
description: apply ラベルの PR が merge されたときに起動し、対応する issue を stage:archive へ進めて tasks 完了済みの openspec change を archive するスキル。openspec archive の実行・validate --strict・archive PR の作成までを担う。Routine「PR merged = apply」の本体。「change を archive して」等の発話でも使う。
---

まず同じ plugin の `routine-common` skill を読み、そのラベル規約・PR の作り方に従う。

# 対象の特定

**対象はトリガーとなった PR。起動時の `github-trigger-context` に PR の ID が書かれている。**
これはセッション開始から遅れて届くので、`routine-common` の「`github-trigger-context` の待ち方」に
従って待ってから読み、対象を確定させる。待ちきっても読み取れない場合は、推測で対象を決めず、
何が読めなかったかを報告して終える（`routine-sweep` が後追いで拾う）。

起動条件は **`apply` ラベルの PR が merge されたこと**。その PR 本文の `Refs #n` から
対象 issue を引く。**このセッションで作る PR は 1 つ**（複数 change をまとめてよい）。

# 1. issue を進める

`origin/main` を取り直したうえで、対象 issue のラベルを付け替える。

```
stage:apply を外す → stage:archive を付ける → wip を外して付け直す（無ければ付ける）
```

`wip` を付け直すのは付与時刻を merge より新しくするためである（`routine-apply` と同じ理由。
`routine-sweep` が「merge より古い `wip`」を途中終了の残骸として外す）。外す操作と付ける操作は
別々に行い、付け直したらタイムラインで最新の `wip` 付与が merge 時刻より新しいことを確認する。

複数 issue を束ねた change なら全件。付け替えたら読み直して確認する。

`Refs #n` が見つからない archive（教訓の archive 等）は、issue が無いだけなので何もしない。

# 2. archive 対象を判定する

`openspec/changes/` 直下（`archive/` を除く）の各 change について `tasks.md` を数える。

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
残っているなら archive せず、issue へ何が残っているかをコメントして終える。

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
