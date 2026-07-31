---
name: 110-implement-all-openspec-changes
description: "単一の Claude Code セッションで、openspec/changes 配下のすべての承認済み OpenSpec change を最後まで実装しきるためのオーケストレーションスキル。apply のたびに change 専属の apply SubAgent を 1 つ起動し、その SubAgent がさらに専門サブエージェント（apply-frontend / apply-backend で実装、apply-review で多段レビュー）を従える。E2E 基盤があるプロジェクトでは、開始時に全 change を読ませた専属 SubAgent が docs/e2e_case.md を先行作成し、各 change 内では E2E を作成・実行せず、全 change 完了後にケース実装・全件実行・失敗修正をオールグリーンまで再帰的に繰り返す。change 完了後は apply-archive / apply-commit の専用サブエージェントで archive・commit する。「openspec を全部実装」「changes を実装しきる」「MVP 全実装」「apply を回しきる」「全 change archive まで」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Agent, Skill, AskUserQuestion, mcp__codex__codex, mcp__codex__codex-reply
---

# OpenSpec Changes 完全実装スキル

/goal すべての changes の実装完了とアーカイブを達成してください。既存の E2E 基盤がある場合は、すべての実装が完了した後に db reset を行って E2E を実行し、完全グリーンになるまで改善してください。

`openspec/changes/` 配下に並んでいる **change をすべて、単一の Claude Code セッションで実装しきる** ためのスキル。

あなたは最上位の **オーケストレーター** に徹する。手は動かさない。**apply のたびに change 専属の apply SubAgent を 1 つ起動** し、実装・レビュー・archive・commit はすべて下位の専門サブエージェントに委ねる。E2E は change ごとに扱わず、開始時のケース設計と全 change 完了後の実装・実行ループに分離する。あなた自身のコンテキストは常にクリーンに保つ。

## 専門サブエージェント（このスキルの実行部隊）

実装から commit までを、役割ごとに分けた専門サブエージェント（`orchestration` plugin の `agents/`、および `architect` plugin の `agents/`）へ委譲する。各サブエージェントは対応するスキルを読み込んで動くため、方針の重複記述はしない。

| サブエージェント | model | 役割 | 参照スキル |
|-----------------|-------|------|-----------|
| `apply-frontend` | sonnet | フロント実装（画面 / コンポーネント / クライアント状態） | `frontend-implementation` |
| `apply-backend` | opus | バックエンド実装（API / Service / Repository / スキーマ / migration） | `backend-implementation` |
| `apply-review` | opus | **多段レビュー統括**（配下で `35-architect-*` を pop して集約） | architect 各スキル |
| `apply-archive` | sonnet | change の archive と `openspec validate --strict` | `.claude/commands/openspec/archive.md` |
| `apply-commit` | sonnet | 意味のある単位での外科的コミット | `20-commit-meaningful-diffs`（basic plugin） |

> **E2E の実行・報告は、全 change 完了後にだけ skill を直接 invoke**。`40-run-and-report-e2e` skill（e2e plugin, `model: sonnet` + `context: fork`）を invoke すると、skill 自身が subagent へ fork してヘッドレス実行・報告する。専用の実行 agent は挟まない（二重 fork を避けるため）。一方、開始時のケース設計は `20-enumerate-e2e-cases`、最終段階の E2E テスト実装・改善は `30-implement-e2e` を、それぞれ書き込み責務を分離した専属 SubAgent として invoke する。

## 最終ゴール（最上位の成功条件）

**最終ゴール**: すべての change が `archive` され、`openspec validate --strict` がグリーンで、最終的に結合レビューで **OK が出る** こと。既存の E2E 基盤がある場合は、`docs/e2e_case.md` の全ケースが実装済みかつグリーンであることも成功条件に加える。
---

# 全体フロー

```
Phase 0  全 change の把握（Codex の利用可否確認を含む）
Phase 1  E2E 基盤の検出と E2E ケース設計の先行開始
Phase 2  実装順序の確定（依存グラフ / Wave 分割）
Phase 3  change に取り組む（可能なら並行作業、change 単位の E2E は行わない）
Phase 4  全 change 完了後の E2E 実装・実行・修正ループ
Phase 5  結合レビュー（再帰・OK が出るまで）
Phase 6  報告
```

## Phase 1: E2E ケース設計を先行させる

Phase 0 で全 change を把握した直後に、既存の E2E 基盤があるか確認する。E2E 用ディレクトリ、テストランナー設定、実行スクリプト、既存 E2E テストを調べ、実行可能な E2E の構成を確認できれば E2E 基盤ありとして扱う。

E2E 基盤がある場合は、次の専属 SubAgent を最優先で起動する。

- `20-enumerate-e2e-cases` skill を invoke し、`openspec/changes/` 配下の **全 change** の proposal・spec・design・tasks と、既存 E2E の構成・規約を対象にする。
- このスキルでは標準の `e2e/cases/{timestamp}_cases.md` ではなく、集約ファイル **`docs/e2e_case.md`** を出力先として明示する。既存ファイルがあれば内容を保持しつつ更新する。
- 全 change を横断した E2E ケースを洗い出す。正常系だけでなく、権限境界・入力エラー・空状態・主要な change 間連携を含め、各ケースから根拠となる change を追跡できるようにする。
- 書き込み先は原則 `docs/e2e_case.md` のみに限定し、実装 SubAgent との競合を避ける。

この SubAgent の起動後は完了を待たず、Phase 2 と Phase 3 を進める。ケース設計を実装と並走させることで、他の実装作業をブロックしない。Phase 4 に入る前に SubAgent の完了を待ち、全 change がケースへ反映されていることを確認する。

E2E 基盤がない場合は、E2E 基盤そのものを暗黙に新設せず、Phase 1 と Phase 4 をスキップしたことを最終報告へ記載する。

## 並列作業の原則

- **土台は逐次が安全**: 共有依存（モノレポ基盤・Prisma スキーマ・org スコープ機構・認証認可・共通 UI・E2E ハーネス）を持つ change は 1 つずつ直列に実装する。前段が緑になるまで次へ進まない。
- **Wave 内は並列可、可能なら同時起動する**: write スコープ（ファイル / モジュール）が重ならず、前後依存もない change は、同一 Wave 内で複数の apply SubAgent を同時に立てて並列実装する。依存関係上安全な change 群はまとめて起動する。

## change 単位では E2E を行わない

各 change の apply SubAgent には、E2E テストの作成、`40-run-and-report-e2e` の invoke、E2E 成功の完了条件化を指示しない。change 単位では実装、必要な unit / integration test、多段レビュー、archive、commit までを担当させる。

`apply-archive` には、このスキルが **E2E を全 change 完了後へ集約する延期ポリシー**を採用していることを明示する。これにより、個別 change の E2E 未実行だけを理由に archive を止めず、最終ゴールとしての E2E オールグリーンは Phase 4 で担保する。

# 全 change 完了後の E2E と結合レビュー

すべての change が archive・commit されたら、システム全体の結合レビューを行う。

- Phase 1 の SubAgent を完了させ、`docs/e2e_case.md` と最終的な全 change の仕様に漏れやずれがないか確認する。
- `30-implement-e2e` skill を E2E 実装専属 SubAgent として invoke する。標準の `e2e/cases/*_cases.md` ではなく **`docs/e2e_case.md` を正とする**ことを起動プロンプトで明示し、未実装ケースのテストファイルを追加し、既存ケースも必要に応じて改善させる。
- 全 E2E ケースのヘッドレス実行は **`40-run-and-report-e2e` skill を直接 invoke**する（実行と報告のみ）。E2E ハートビートを遵守する。
- 失敗を「E2E テストの不備」「プロダクト実装の不備」「環境・データ準備の不備」に分類し、それぞれ E2E 実装 SubAgent、該当領域の実装 SubAgent、環境を担当できる SubAgent に修正させる。
- 修正後は `docs/e2e_case.md` を正として、**E2E テストの作成・改善 → 全件実行 → 失敗分類 → テストまたは実装の修正**を再帰的に繰り返す。未実装ケースがなく、全ケースがグリーンになるまで終了しない。
- 35-architect-* 系のスキルを適宜用いてレビューをする。レビュー修正でプロダクト実装または E2E に変更が入った場合は Phase 4 へ戻り、全件グリーンを再確認する。
