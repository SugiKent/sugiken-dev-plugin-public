---
name: routine-propose
description: issue-driven-sdd の propose 段階。`stage:propose` が付いた issue から openspec の proposal を作り、未確定の判断が残っていれば PR 上で人に問い、同じセッションで回答を受けて詰め切る。Routine のトリガーは Custom → Issue: Labeled、Filter は Labels contains stage:propose、autofix_on_pr_create は true にする。
---

# routine-propose

まず同じ plugin の `routine-common` を読み、ラベル定義・着手可否・不変条件・PR の作り方に従う。ここではこの段階固有の手順だけを書く。

## 起動条件

`stage:propose` が付いた issue 1 件につき 1 セッション。着手可否の判定（`routine-common`）を満たさない issue には着手しない。

## 4.1 最初の proposal を作る

1. issue 本文・受け入れ条件・関連コメントを読む。
2. `routine-common` の着手可否を確認し、満たしていれば issue に `wip` を付ける。
3. branch を作り、対象プロジェクトが前提とする `openspec` plugin の propose 系スキルで change（proposal）を作る。
4. 未確定の判断（設計上の選択肢、要件の曖昧さ、スコープの境界など）を洗い出し、件数を数える。
5. PR を作る。段階ラベルは `propose`。本文 1 行目は `未確定の判断: N 件`。`Refs #<issue番号>`（`Closes` は書かない）。

## 4.2 問いを投稿する

未確定の判断が 1 件以上あれば、同じ PR に `<!-- routine -->` から始まるコメントで問いを投稿する。1 つのコメントに問いをまとめ、それぞれ何を選べば何が変わるかが人に分かるように書く。

新しい枝の proposal を書き足して問いが増えた場合、`routine-common` の付け外し規則に従い `question` ラベルが外れていれば付け直す。

## 4.3 回答を受けて進める

`autofix_on_pr_create: true` により、このセッションが PR の会話コメントへの応答を受け取り続ける。人からの回答が来たら、同じセッション内で次を行う。

1. 回答を proposal・design・tasks へ反映する。
2. 反映によって新たに未確定の判断が出た場合、件数を数え直し、本文 1 行目を更新する。
3. 残っている枝があれば `question` を付けたまま次のラウンドへ進み、4.2 に戻って問いを投稿する。
4. 人と無関係な CI 失敗やレビュー bot の指摘は、通常の PR 修正として同じ PR に反映する。

## 4.4 詰め切ったとき

未確定の判断が 0 件になったら、本文 1 行目を `未確定の判断: 0 件` にし、`question` を外す。openspec の validate（`openspec validate --strict` 等、対象プロジェクトの規約に従う）を通し、結果を PR にコメントする。

`tasks.md` に「投入後の実測」「本番で確認」節を作らない（`routine-common` 不変条件 4）。実測が要る内容は別 issue として起票する提案を PR コメントに書く。

## 完了報告

最初に issue 番号と PR URL を述べ、未確定の判断の件数、`question` ラベルの状態、検証結果を簡潔に報告する。
