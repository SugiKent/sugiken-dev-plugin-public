---
name: routine-archive
description: issue-driven-sdd の archive 段階。apply PR が merge されたら、対応する issue を stage:archive に進め、openspec archive を実行して archive PR を作る。この PR の merge で issue が閉じる。Routine のトリガーは PR merged、Filter は Labels contains apply、autofix_on_pr_create は false にする。
---

# routine-archive

まず同じ plugin の `routine-common` を読み、ラベル定義・着手可否・不変条件・PR の作り方に従う。ここではこの段階固有の手順だけを書く。

## 起動条件

`apply` ラベルの付いた PR が merge された。1 回の起動につき、その PR に対応する change・issue を 1 つだけ扱う。

## 実装前の確認

merge された PR の内容を再取得し、対応する change の tasks.md が全タスク `[x]` であることを確認する。満たさない場合は archive せず、対応する issue へ理由をコメントし、issue のラベルは `stage:apply` のまま終了する。

## 進め方

1. 対応する issue を特定する（PR 本文の `Refs #n` から辿る）。
2. `routine-common` の着手可否を確認し、issue のラベルを `stage:apply` → `stage:archive` に付け替え、`wip` を付ける。
3. 対象プロジェクトが前提とする `openspec` plugin の archive スキルで `openspec archive` を実行する。
4. PR を作る。段階ラベルは `archive`。本文 1 行目は `未確定の判断: 0 件`。`Closes #<issue番号>` を書く（この段階だけ `Closes` を使う）。

この PR に `question` が付くことは想定しない。archive は機械的な後処理であり、人への問いが生じる場合は archive を止めて issue へ理由をコメントする。

## 完了報告

最初に issue 番号と PR URL を述べ、archive した change 名、`Closes` の対象、既知の制約を簡潔に報告する。
