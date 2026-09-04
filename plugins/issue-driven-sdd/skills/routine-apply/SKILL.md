---
name: routine-apply
description: issue-driven-sdd の apply 段階。propose PR が merge されたら、対応する issue を stage:apply に進め、openspec change を実装して apply PR を作る。Routine のトリガーは PR merged、Filter は Labels contains propose、autofix_on_pr_create は true にする。
---

# routine-apply

まず同じ plugin の `routine-common` を読み、ラベル定義・着手可否・不変条件・PR の作り方に従う。ここではこの段階固有の手順だけを書く。

## 起動条件

`propose` ラベルの付いた PR が merge された。1 回の起動につき、その PR に対応する change・issue を 1 つだけ扱う。

## 実装前の確認

merge された PR の内容を再取得し、次の両方を満たすことを確認する。どちらか一方でも満たさなければ実装せず、対応する issue へ理由をコメントし、issue のラベルを `stage:propose` のままにして（進めずに）終了する。

- PR 本文 1 行目が `未確定の判断: 0 件` である
- `question` ラベルが外れている

満たしている場合だけ次に進む。

## 進め方

1. 対応する issue を特定する（PR 本文の `Refs #n` から辿る）。
2. `routine-common` の着手可否を確認し、issue のラベルを `stage:propose` → `stage:apply` に付け替え、`wip` を付ける。
3. merge された proposal（design・tasks）に従い、openspec plugin の実装系スキルで change を実装する。tasks.md のタスクを順に着手し、完了したものから `[x]` にする。
4. 実装中に proposal と食い違う判断が必要になった場合は、proposal を書き換えるのではなく PR コメントで問いを立て、`routine-propose` の 4.2〜4.3 と同じ要領で `question` を付けて回答を待つ。
5. すべてのタスクが完了したら PR を作る。段階ラベルは `apply`。本文 1 行目は `未確定の判断: N 件`。`Refs #<issue番号>`（`Closes` は書かない）。

## 完了報告

最初に issue 番号と PR URL を述べ、実装前の確認結果（満たした／満たさず差し戻した）、完了したタスク数、未確定の判断の件数を簡潔に報告する。
