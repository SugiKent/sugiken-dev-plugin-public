---
name: 100-write-openspec-for-mvp-tasks
description: "`docs/mvp/implementation-tasks.md` に基づいて OpenSpec change を作成する"
disable-model-invocation: true
---

# やること

`docs/mvp/implementation-tasks.md` のタスクを、後続の実装へ渡せる OpenSpec change にする。
`docs/mvp/` を必ず読み、必要に応じて `docs/domain/` と `docs/quality/` の仕様・技術仕様・技術スタックを確認する。change は実装タスクに基づく粒度に分け、順番が分かる名前（例: `s01-<内容>`）にする。

# 進め方

change 間の認識齟齬を避けるため、作成は直列で行う。各 change の作成は SubAgent に `openspec:openspec-propose` を使わせ、対象タスク、MVP資料、依存する先行 change を渡す。保存先、選択されたスキーマの必要成果物、検証、承認の扱いは propose の契約に従い、ここで別の生成手順を作らない。

各 change が書き上がるたびに別の SubAgent へレビューを非同期で依頼し、指摘を解消する。先行 change を修正した場合は、それを参照する後続 change との整合も確認する。

## レビュー観点

* 選択スキーマの成果物間に矛盾がないか。
* `docs/mvp/` を中心とした docs 内のドキュメントとの矛盾がないか。
* 先行 change との矛盾、依存漏れ、考慮漏れがないか。
* 実装に必要な判断が確定しているか。

# 完了報告

change ごとに ID、成果物のパス、検証結果、依存先、未決事項、承認状態を返す。後続の `110-implement-all-openspec-changes` が受け取れるようにし、作成済みと承認済みを混同しない。
