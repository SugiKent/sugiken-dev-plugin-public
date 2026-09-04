---
name: create-github-issues
description: issue-driven-sdd 用にバックログ項目を GitHub Issue へ変換する。手動起動。「issue にして」「バックログを issue 化して」等の依頼で使用する。段階ラベルは付けない。
---

# create-github-issues

バックログ（メモ、Slack のやり取り、口頭の要望など）を GitHub Issue に変換する。この skill は Issue を作るだけで、着手はしない。段階ラベル（`stage:propose` 等）は付けない。付けるのは人であり、それが `routine-propose` の起動条件になる。

## 進め方

1. 対象リポジトリを GitHub コネクタで解決する（`gh` コマンドは Claude Code のクラウド環境では使えない）。
2. バックログ項目ごとに、既存 issue との重複を GitHub コネクタで検索して確認する。重複があれば新規作成せず、既存 issue にコメントで補足するか、報告のみに留める。
3. 1 項目 1 issue にする。複数の変更をまとめて 1 issue にしない。
4. issue 本文には次を含める。
   - 概要（何を・なぜ）
   - 分かっている範囲での受け入れ条件
   - 分かっている場合は対象 plugin / 対象ファイル
   - 未確定な点があれば明記する（`routine-propose` が問いとして拾えるように）
5. `todo` ラベルを付ける。段階ラベルやアサインは付けない。

## 完了報告

作成した issue の番号と URL を一覧する。重複と判断して作成しなかった項目があれば、その理由と参照した既存 issue を添える。
