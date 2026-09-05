---
name: routine-archive
description: Routine「Issue: Labeled = stage:archive」の本文から呼ばれる skill。tasks 完了済みの openspec change を archive し、validate --strict を緑にして、Closes #n を持つ archive PR を作る。手動で「change を archive して」「#n を archive して」と言われたときもこの skill を使う。段階ラベルは書かない。
---

まず同じ plugin の `routine-common` skill と、その `references/worker.md` を読む。

# 1. 対象と着手可否

`worker.md` の「対象の特定」で issue を決める。対象 issue を `Refs #n` に持つ**merge 済みの `apply` PR**
が触った change を起動の原因とする。無ければ issue へコメントして終える。

「着手可否の判定」を上から見て、着手するなら「`wip` のロック」を行う。作る PR は 1 つで、
複数 change をまとめてよい。

# 2. archive 対象を判定する

`origin/main` の `openspec/changes/` 直下（`archive/` を除く）の各 change について `tasks.md` を数える。
判定はこのコマンドで決定論的に行い、「終わっていそう」と主観で決めない。

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

起動の原因になった change に未チェックが残る場合、それがこのセッションで実行できないタスク
（本番実測・デプロイ後確認）なら、その行を tasks から外して別 issue へ起票したうえで archive する。
それ以外の未チェックなら archive せず、何が残っているかをコメントし `blocked-by: human` で終える。
open PR が触っている change は、相手の編集を止めて古い設計で spec を上書きするので対象外。

該当が 0 件なら「archive 対象なし」と報告して終える。

# 3. archive して PR を作る

```bash
openspec archive "<change名>" --yes
```

`--skip-specs` は tooling-only の変更でない限り使わない。`openspec/specs/` は進行中 change の delta を
持ちやすいので、直前に本文を読み直して delta を取り直す。失敗した change はスキップして報告し、
他は続行する。全対象を archive したら `openspec validate --strict` を緑にする。

change 1 つにつき 1 つの `chore(openspec)` コミットにし（削除を含むので `git add -A` で対象パスを
ステージ）、`git status --short` が空になったことを確認する。

`worker.md` の「PR の作り方」に従う。title は `[archive] #<n> <change名>`、**本文に `Closes #n`**
（複数 issue なら全件）、ラベルは `archive`。archive した change 名と validate が緑であることを本文に書く。
PR を作った時点で完了。merge で issue が閉じ、`wip` ごと役目を終える。
