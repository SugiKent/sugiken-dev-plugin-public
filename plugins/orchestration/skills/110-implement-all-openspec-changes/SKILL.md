---
name: 110-implement-all-openspec-changes
description: "単一の Claude Code セッションで、openspec/changes 配下のすべての承認済み OpenSpec change を最後まで実装しきるためのオーケストレーションスキル。apply のたびに change 専属の apply SubAgent を 1 つ起動し、その SubAgent がさらに専門サブエージェント（apply-frontend / apply-backend で実装、apply-review で多段レビュー）を従え、E2E は 40-run-and-report-e2e skill を直接 invoke して 1 change を完遂する。完了後は apply-archive / apply-commit の専用サブエージェントで archive・commit する。最後に docs/e2e_case.md の全ケースがグリーンになり、結合レビューで OK が出るまで再帰的にブラッシュアップする。「openspec を全部実装」「changes を実装しきる」「MVP 全実装」「apply を回しきる」「全 change archive まで」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Agent, Skill, AskUserQuestion, mcp__codex__codex, mcp__codex__codex-reply
---

# OpenSpec Changes 完全実装スキル

/goal すべての changes の実装完了とアーカイブ。そしてE2Eの完全グリーンを達成してください。すべての実装が完了したら db reset 後に e2e を実行して all green になるまで挑戦してください.

`openspec/changes/` 配下に並んでいる **change をすべて、単一の Claude Code セッションで実装しきる** ためのスキル。

あなたは最上位の **オーケストレーター** に徹する。手は動かさない。**apply のたびに change 専属の apply SubAgent を 1 つ起動** し、実装・レビュー・E2E・archive・commit はすべて下位の専門サブエージェントに委ねる。あなた自身のコンテキストは常にクリーンに保つ。

## 専門サブエージェント（このスキルの実行部隊）

実装から commit までを、役割ごとに分けた専門サブエージェント（`orchestration` plugin の `agents/`、および `architect` plugin の `agents/`）へ委譲する。各サブエージェントは対応するスキルを読み込んで動くため、方針の重複記述はしない。

| サブエージェント | model | 役割 | 参照スキル |
|-----------------|-------|------|-----------|
| `apply-frontend` | sonnet | フロント実装（画面 / コンポーネント / クライアント状態） | `frontend-implementation` |
| `apply-backend` | opus | バックエンド実装（API / Service / Repository / スキーマ / migration） | `backend-implementation` |
| `apply-review` | opus | **多段レビュー統括**（配下で `35-architect-*` を pop して集約） | architect 各スキル |
| `apply-archive` | sonnet | change の archive と `openspec validate --strict` | `.claude/commands/openspec/archive.md` |
| `apply-commit` | sonnet | 意味のある単位での外科的コミット | `20-commit-meaningful-diffs`（basic plugin） |

> **E2E の実行・報告は agent ではなく skill 直接 invoke**。`40-run-and-report-e2e` skill（e2e plugin, `model: sonnet` + `context: fork`）を invoke すると、skill 自身が subagent へ fork してヘッドレス実行・報告する。専用の e2e agent は挟まない（二重 fork を避けるため）。

## 最終ゴール（最上位の成功条件）

**最終ゴール**: すべての change が `archive` され、`openspec validate --strict` がグリーンで、すべてのE2E ケースがグリーンになり、最終的に結合レビューで **OK が出る** こと。
---

# 全体フロー

```
Phase 0  全 change の把握（Codex の利用可否確認を含む）
Phase 1  実装順序の確定（依存グラフ / Wave 分割）
Phase 2  change に取り組む（可能なら並行作業）
Phase 3  全 change 完了後の結合レビュー（再帰・OK が出るまで）
Phase 4  報告
```

## 並列作業の原則

- **土台は逐次が安全**: 共有依存（モノレポ基盤・Prisma スキーマ・org スコープ機構・認証認可・共通 UI・E2E ハーネス）を持つ change は 1 つずつ直列に実装する。前段が緑になるまで次へ進まない。
- **Wave 内は並列可、可能なら同時起動する**: write スコープ（ファイル / モジュール）が重ならず、前後依存もない change は、同一 Wave 内で複数の apply SubAgent を同時に立てて並列実装する。依存関係上安全な change 群はまとめて起動する。

# 全 change 完了後の結合レビュー

すべての change が archive・commit されたら、システム全体の結合レビューを行う。

- 全E2Eケースヘッドレス実行は ** `40-run-and-report-e2e` skill を直接 invoke**（実行と報告のみ）。失敗があれば該当 change の apply SubAgent（実装修正）に差し戻し、再度 skill を invoke して再実行する。E2E ハートビート遵守。
- 35-architect-* 系のスキルを適宜用いてレビューをする