---
name: 100-write-openspec-for-mvp-tasks
description: "IMPL_MVP_TASKS.md に基づいて openspec の specs を書く"
---

# やること

@docs/MVP_IMPL_TASKS.md に基づいて spec を作成してください.
docs 内の仕様や技術仕様、技術スタックの記述を完全に理解をして作業をしてください。
spec は @docs/MVP_IMPL_TASKS.md に基づいた粒度で細かく分けてください.

# spec の書き方

spec 名には順番が分かりやすいように先頭に数字を付けてください. 例: `s01`

# 進め方

一気に spec を書く重厚なタスクですが、spec 間の認識齟齬が生まれないように作業は直列で行ってください。
しかしコンテキスト消費節約のため、spec を各作業自体は SubAgent に委譲して行い、あなたはオーケストレーションをしてください

# レビューを行うこと

作成した spec は SubAgent にレビューさせて再帰的にブラッシュアップしてください.このレビュープロセスは、一つのspecが書き上がるたびに SubAgent に依頼をして非同期で行ってください

## レビュー観点

- spec内の design/proposal/tasks で矛盾がいないか
- docs 内ドキュメントとの矛盾がないか
- すでに書かれている spec との矛盾や齟齬がないか
- 考慮漏れがないか
- 誰しもが迷わず実装可能なほど書かれているか

