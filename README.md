# sugiken-dev-plugins-public

SugiKent の個人開発用 Claude Code plugin 集（公開版）。
この repo を Claude Code の plugin marketplace として各マシン・各プロジェクトに配布する。

個人開発（MVP 構想 → OpenSpec 化 → 実装オーケストレーション → E2E → リリース）を一貫して支える skill 群を、カテゴリごとの plugin にまとめている。

## インストール

```bash
# marketplace を登録
claude plugin marketplace add SugiKent/sugiken-dev-plugins-public

# 必要な plugin を install (user scope = 全プロジェクト共通)
claude plugin install mvp-workflow@sugiken-dev-public
claude plugin install architect@sugiken-dev-public

# プロジェクト単位で入れたい場合
claude plugin install mobile-release@sugiken-dev-public --scope project
```

または対話 UI: `/plugin` → sugiken-dev-public から選択。

plugin 化された skill の呼び出しは namespace 付きになる: `/mvp-workflow:01-write-mvp` など。
description による自動呼び出しは従来どおり機能する。

## 収録 plugin

| plugin | カテゴリ | 概要 |
| --- | --- | --- |
| `mvp-workflow` | workflow | 個人開発 MVP の構想〜OpenSpec 化までのワークフロー (skill はフェーズ番号順) |
| `openspec` | workflow | OpenSpec の change ワークフロー (explore / propose / apply / sync-specs / archive) の日本語化スキル集 |
| `orchestration` | workflow | openspec/changes 全実装のオーケストレーション (単一セッション多段 SubAgent 方式 + Orca 並列方式) |
| `architect` | quality | 設計原則 (SOLID/KISS/YAGNI/DRY) / コードレビュー / DB 設計 / 疑い駆動開発 / セキュリティ |
| `e2e` | quality | 網羅的 E2E の 4 フェーズ分解。Web=Playwright, モバイル=Maestro |
| `design` | quality | UI/UX 設計・ユーザビリティ評価系スキル |
| `llm-eval` | quality | LLM-as-a-Judge 評価基盤のセットアップ (BINEVAL 手法準拠) |
| `dev-utils` | utility | ローカル開発・検証を支える汎用ユーティリティ (env vars / port / feature flag / CLI / dev ログイン) |
| `dev-tool-bootstrap` | utility | 運用ツールのスキャフォールド (mini-sentry / READ-only admin ダッシュボード) |
| `basic` | utility | 表現思考 / retro / スケジュール抑制の汎用スキル |
| `analytics-tools` | infra | プロダクト分析ツール導入 (Amplitude: Web / モバイル / サーバ) |
| `fastify` | infra | Fastify + pino の dev エラーログ基盤 |
| `railway` | infra | Railway のデプロイ・運用ガイドとログからのエラー調査 |

## 更新の反映

- skill の編集はこの repo で行い、commit → push する
- `plugin.json` に `version` を書いていないため、**commit ごとに新バージョン扱い** (git SHA) になる
- 各マシンでは `claude plugin update <plugin>@sugiken-dev-public` か marketplace の自動更新で反映される

## 運用ルール

- skill の数字接頭辞は MVP 開発のフェーズ順を表す (00 準備 → 01 構想 → … → 110 全実装)
- skill を追加するときは、どの plugin (カテゴリ) に属するかを決めて `plugins/<name>/skills/` に置く
