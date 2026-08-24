# セキュリティ監査レポート: sugiken-dev-plugins-public

- **実施日時**: 2026-08-24 16:43 UTC
- **対象**: `plugins/` 配下のスキル・エージェント定義、`.claude/skills/` の自動化スキル、`plugins/basic/hooks/`
- **手法**: STRIDE ベースの read-only レビュー（`35-architect-security` 参照）、grep によるパターン走査、代表スキルの精読
- **tracking issue**: #1

## 調査仮説

| # | 仮説 | 結果 |
|---|------|------|
| H1 | 自動化スキル（Routine / PR リスク評価）が外部入力を過信し、プロンプトインジェクションや無人 merge のリスクがある | **High** — 2 件の個別 issue を起票（#2, #3） |
| H2 | `86-dev-login-bypass` の多層ガードがステージング等の誤設定で破られる可能性がある | **Medium** — ガイダンス不足。本レポートに記録 |
| H3 | `plugins/basic/hooks/ja-writing-lint` が PostToolUse で任意コマンド実行し、パス経由の RCE がありうる | **Low** — Python 単体実行、シェル未使用。入力は JSON から file_path/content のみ参照 |

## High 指摘

### 1. Routine orchestration の Issue 本文過信（#3）

**場所**: `.claude/skills/claude-code-routine-orchestration/SKILL.md`（Propose セクション）

**内容**: Issue 本文・コメント・acceptance criteria をそのまま読み、change 作成・実装の根拠にしている。Cursor Automation の External Input 安全原則（未検証入力は権限を持たない）との整合が取れていない。

**悪用シナリオ**: Issue 作成権限を持つ第三者が cron 実行の Routine に対し、「機密を含むファイルを PR 本文へ」「認証チェックを削除」等の指示を埋め込む。

**推奨**: 外部入力は「要件の参考」に限定する旨を明記。構造化 AC のみを正本とする。apply 前に diff のセキュリティレビュー必須化。

### 2. assess-pr-risk の自動 merge にセキュリティ軸がない（#2）

**場所**: `.claude/skills/assess-pr-risk/SKILL.md`

**内容**: 3 軸（変更量・複雑度・動作確認推奨度）のみで人間レビュー要否を判定。認証・CI・シークレット関連の path ベース例外がない。

**悪用シナリオ**: 数十行の認証ミドルウェア改ざん PR が CI を通過し、自動 merge される。

**推奨**: セキュリティ敏感パスへの変更は常に人間レビュー必須。path ベースのブロックリストを追加。

## Medium 指摘

### 3. dev-login-bypass のステージング誤設定リスク

**場所**: `plugins/dev-utils/skills/86-dev-login-bypass/SKILL.md`

**内容**: `NODE_ENV !== "production"` と `import.meta.env.DEV` の二重ガードは適切に文書化されている。一方で、ステージング環境で `NODE_ENV=development` を使う運用や、Next.js 等 Vite 以外での tree-shaking 失敗時の注意は末尾に短く触れるのみ。

**推奨**: 「ステージングでは必ず `NODE_ENV=production`」「非 Vite スタックではルート定義ごとビルド時に除去」を絶対方針セクションへ昇格。デプロイ前チェックリストを追加。

### 4. llm-eval 参照コードの `JSON.parse(process.env.EVAL_CASES)`

**場所**: `plugins/llm-eval/skills/44-method-llm-judge-bineval/references/use-cases.md`

**内容**: CI ハーネス例で環境変数を `JSON.parse` している。攻撃者が CI env を制御できる場合、巨大 JSON による DoS や予期しないオブジェクト形状のリスクがある。

**推奨**: zod 等でのスキーマ検証、サイズ上限、配列長上限を例示コードに追加。

### 5. Railway スキルのトークン抽出パターン

**場所**: `plugins/railway/skills/01-railway-setup/SKILL.md` §8

**内容**: `~/.railway/config.json` から token を shell で抽出する例を多数掲載。エージェントがログに token を出力するリスクはスキル内で警告されていない。

**推奨**: 「token をログ・PR・Artifact に出力しない」注意書きを §8 冒頭に追加。

## Low / 問題なし

| 項目 | 評価 |
|------|------|
| ハードコードされた API キー | 検出なし（ダミー例のみ） |
| `ja-writing-lint` hook | Python のみ、shell 未使用。file_path は検査対象判定にのみ使用 |
| admin テンプレート middleware | 404 ステルス拒否パターンは適切 |
| `35-architect-security` | LLM 出力の信頼境界・SSRF 例が充実 |
| orchestration `apply-backend` | org スコープ・入力検証を必須化。codex exec は補助用途で限定 |

## 作成した GitHub Issues

| Issue | 重大度 | タイトル |
|-------|--------|----------|
| #2 | High | assess-pr-risk の自動 merge がセキュリティ敏感変更を検知しない |
| #3 | High | claude-code-routine-orchestration が GitHub Issue 本文を信頼入力として扱う |

## 次回監査時の確認事項

- #2 / #3 の修正がスキルに反映されたか
- `docs/securities/` 配下の過去レポートとの重複仮説の有無
- 新規追加 plugin の hooks / エージェント定義の権限範囲
