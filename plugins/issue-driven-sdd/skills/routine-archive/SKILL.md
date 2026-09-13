---
name: routine-archive
description: '`stage:archive` の issue に対応する完了済み OpenSpec change を archive し、`Closes #n` の archive PR を作る。「#n を archive して」でも使う。'
---

`routine-common` と `routine-common/references/worker.md` を読む。

# 1. 対象を決める

worker の「対象の特定」に従う。issue を `Refs #n` に持つ merge 済み `apply` PR が触った change を起点にし、
無ければコメントして終える。worker の「着手可否の判定」を通ったら「着手の印」を付ける。

`origin/main:openspec/changes/` 直下の changes を対象に、`tasks.md` があり、`- [ ]` が 0、`- [x]` が 1 以上の
ものだけを archive 候補とする。open PR が触る change は除く。起点 change に未完 task があれば、session 外 task は
worker の「変更範囲」に従い、それ以外は `blocked-by: human` で見送る。候補が無ければ報告して終える。

# 2. archive する

無人処理なので対話型 skill ではなく、候補ごとに次を実行する。

```bash
openspec archive "<change名>" --yes
```

`--skip-specs` は tooling-only の change だけに使う。直前に main specs と delta を読み直す。失敗した change は
報告して飛ばし、他を続ける。最後に `openspec validate --strict` を通す。

change ごとに `chore(openspec)` commit を作り、削除を含む対象パスを `git add -A` で stage する。
全候補の処理後、`git status --short` が空であることを確認してから PR を作る。

# 3. PR を作る

worker の「PR の作り方」に従い、archive した changes と validation 結果、全対象 issue の `Closes #n` を本文に
持つ archive PR を 1 件作る。PR を作ったら終了する。
