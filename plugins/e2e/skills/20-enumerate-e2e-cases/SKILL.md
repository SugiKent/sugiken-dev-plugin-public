---
name: 20-enumerate-e2e-cases
description: "OpenSpec の propose 段階で、提案中の change 仕様から網羅的な E2E テストケースを列挙し `e2e/cases/{YYYY-MM-DD-HHmm}_cases.md` に書き出すスキル。仕様コンテキストが新鮮なうちに 9 観点でケースを洗い出しておくことで、後の実装フェーズが網羅性を見失わず走り切れる。「テストケース列挙」「E2E ケース洗い出し」「propose 段階のテスト設計」「網羅的ケース」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Bash, Write
model: opus
context: fork
---

# E2E ケース列挙スキル（propose 段階）

**目的**: OpenSpec の propose 段階で、提案中の仕様から E2E ケースを網羅的に列挙し、1 つの `cases.md` に固定する。実装はしない。ここで作ったケースファイルが後段 [[30-implement-e2e]] の「正」になる。

> このスキルは `context: fork` で subagent 化して走る。会話履歴は引き継がないため、**入力（対象 change / プラットフォーム）は起動時のプロンプトから受け取る**。成果物はファイルとして残し、人間レビューは呼び出し側（メインコンテキスト）が行う。

## 入力（起動プロンプトで受け取る）

- 対象 OpenSpec change（例 `openspec/changes/<id>/`）。指定がなければ最新の propose 中 change を探す。
- 対象プラットフォーム（Web / モバイル / 両方）。不明なら仕様とリポジトリ構成から推定する。

## Step 1: 仕様からユーザーフローを抽出

以下を優先度順に読み、ユーザーが体験するフローを網羅的に収集する：

**アプリケーションコード > openspec / docs**

- `openspec/changes/<id>/proposal.md` / `specs/` / `tasks.md`、`docs/` を読む。
- 既存アプリコードがあれば主要画面・主要 API・認証の有無・ロール種別を把握する。

## Step 2: 9 観点で網羅する

各ユーザーフローに、以下 9 観点を機械的に当てて漏れを潰す：

| # | 観点 | 例 |
|---|-----|-----|
| 1 | Happy path | 標準フロー成功 |
| 2 | Sad / Validation error | 必須欄空欄、形式不正、最大長超過 |
| 3 | Boundary | 0 件 / 1 件 / N 件最大、文字数境界、最小値 |
| 4 | Empty state | データなし時・初回画面 |
| 5 | Error / Network failure | 4xx/5xx モック、タイムアウト、オフライン |
| 6 | Permission / Auth boundary | 未認証で保護画面、別ロールで保護画面 |
| 7 | A11y | キーボード操作、role/label（Web）/ accessibilityLabel（mobile） |
| 8 | Responsive / OS 差異 | iPhone / Pixel / desktop、iOS / Android 差 |
| 9 | State persistence | リロード、再起動、deeplink 直アクセス、認証失効 |

## Step 3: `e2e/cases/{YYYY-MM-DD-HHmm}_cases.md` を作成

タイムスタンプは `date "+%Y-%m-%d-%H%M"`（`Bash`）で取得。冒頭にメタ情報、本体は表形式：

```markdown
# E2E テストケース一覧

- 作成日時: 2026-05-17 14:30
- 対象 change: openspec/changes/<id>
- 対象: [Web / モバイル / 両方]
- レビュー状態: 未レビュー

## ユーザーフロー
1. [フロー A の概要]
2. [フロー B の概要]

## ケース表

`実装` 列は E2E 実装の進捗チェックボックス。列挙直後は全て `[ ]`。[[30-implement-e2e]] で緑を確認できた時点で `[x]` に更新される。

| ID | カテゴリ | 観点 | 前提状態 | 操作 | 期待結果 | 優先度 | 実装 |
|----|----------|------|----------|------|----------|--------|------|
| C-001 | auth | happy | ゲスト | サインアップ→確認リンク踏む | ホーム着地 | P0 | [ ] |
| C-002 | auth | sad | ゲスト | メール空欄で送信 | エラー表示/送信不可 | P0 | [ ] |
| C-004 | post | empty | ログイン済 | 投稿 0 件で一覧 | 空状態表示 | P0 | [ ] |
| ... | ... | ... | ... | ... | ... | ... | [ ] |

## 優先度の意味
- **P0**: リリース blocker。CI で必ず実行
- **P1**: 重要だがリリースは止めない。nightly / pre-release
- **P2**: できれば。手動 or 週次

## 観点別カバレッジ
- Happy: N / Sad: N / Boundary: N / Empty: N / Error: N / Auth: N / A11y: N / Responsive: N / State: N
```

**ケース数の目安**: MVP で 30〜80 ケース。これ未満は網羅不足の可能性が高いので 9 観点に立ち戻る。ドメインが多ければ `Agent`（subagent）でドメイン別に並列列挙し、最後に 1 ファイルへマージしてよい。

## テスト方針（列挙時から一貫適用するスコープ）

以下はコスト・非決定性を避けるため意図的にスコープ外／mock 扱い。ケースにもこの前提を反映する：

- **VRT（Visual Regression）はやらない**。スクショは失敗時 artifact のみ、pixel diff を合否基準にしない。
- **メール送信は実送しない**。「送信されたこと」を API/DB/mock サーバ（Mailpit 等）で確認。確認リンクはトークンを DB/API から取得して URL を組む。
- **AI 処理（LLM / 埋め込み / 画像・音声）は実呼びしない**。固定レスポンスの mock に差し替え。ただし「AI 失敗時の UI（エラー/リトライ）」は mock で失敗を返してテストする。

## 出力（親エージェント／人間へ返す）

```
## E2E ケース列挙完了
- 出力: e2e/cases/{filename}.md
- 対象 change: <id> / プラットフォーム: <Web/モバイル/両方>
- 総ケース数: N（P0: x / P1: y / P2: z）
- 観点別: Happy N / Sad N / ... / State N
- レビュー状態: 未レビュー（人間レビュー後に [[30-implement-e2e]] へ）
```

> **網羅性は人間にしか最終判断できない**。このスキルは列挙して停止する。実装へ進む前に、呼び出し側が cases.md を人間レビューにかける前提。
