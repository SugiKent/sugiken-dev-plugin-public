---
name: 10-setup-e2e-env
description: "E2E テストの実行環境をゼロからセットアップするスキル。まず対象が Web / モバイル / 両方かを AskUserQuestion で確定し、プラットフォームに応じて Playwright（Web）または Maestro（モバイル）を導入・設定し、ディレクトリ・config・.gitignore・Claude Code 連携（MCP）まで整える。ケース列挙や実装より前の土台作りに使う。「E2E 環境構築」「E2E セットアップ」「Playwright 導入」「Maestro 導入」「e2e の準備」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, AskUserQuestion
model: sonnet
---

## Step 1: 対象プラットフォームの確定

まずリポジトリを走査して手がかりを集め、**候補を提示したうえで** `AskUserQuestion` で確定する。

自動判定の手がかり：

- `apps/mobile/` / `app.config.js` / `app.json`（Expo 設定）→ **モバイル**
- `apps/client/` + `apps/server/` / `playwright.config.ts` / `package.json` deps の `@playwright/test` → **Web**
- 両方の痕跡 → **両方**

`AskUserQuestion` で「Web / モバイル / 両方」を1問確認する（自動判定結果を推奨選択肢の先頭に置く）。両方の場合はセットアップも両方行う。

## Step 2-A: Web（Playwright）セットアップ

未導入の項目のみ実施する（既存を壊さない）。

1. **インストール**
   ```bash
   pnpm add -D @playwright/test
   npx playwright install              # ブラウザバイナリ
   # CI(Linux): npx playwright install --with-deps
   ```
2. **ディレクトリ**: `e2e/{cases,tests,pages}` / `e2e/fixtures.ts` / `e2e/auth.setup.ts` を用意（雛形の詳細は Web リファレンス §1-2）。
3. **`playwright.config.ts`**: `testDir: './e2e/tests'`、`trace: 'on-first-retry'`、`screenshot: 'only-on-failure'`、`setup` プロジェクトで storageState 依存、初期は chromium 単体。完全形は Web リファレンス §1-3。
4. **`.gitignore`** に追加: `playwright/.auth/` / `test-results/` / `playwright-report/` / `blob-report/`
5. **Claude Code 連携（任意）**:
   ```bash
   claude mcp add --scope project playwright npx @playwright/mcp@latest
   ```

## Step 2-B: モバイル（Maestro）セットアップ

1. **インストール**
   ```bash
   curl -fsSL "https://get.maestro.mobile.dev" | bash   # or: brew tap mobile-dev-inc/tap && brew install maestro
   maestro --version                                    # Java 17+ 必須
   ```
2. **ディレクトリ**: `.maestro/{flows,subflows}` / `.maestro/config.yaml` / `e2e/cases/`（詳細は Mobile リファレンス §2-2）。
3. **アプリ側の準備（必須）**: 全インタラクティブ要素へ `testID`（命名規則 `{screen}_{action}_{target}`）を付与。E2E フラグでアニメ・splash・analytics を無効化（Mobile リファレンス §2-4）。testID の付与状況を確認し、不足を洗い出す。
4. **Claude Code 連携（任意）**:
   ```bash
   claude mcp add maestro -- maestro mcp
   ```

## Step 3: 完了確認とハンドオフ

- Web: `npx playwright test` が「0 tests」でも正常終了することを確認（ハーネスが起動する）。
- モバイル: `maestro --version` とシミュレータ/エミュレータ起動を確認。
- 完了したら次フェーズを案内する:
  - OpenSpec の propose 段階にいるなら [[20-enumerate-e2e-cases]] でケースを列挙。
  - 既にケースがあるなら [[30-implement-e2e]] で実装。

## やらないこと（このスキルの範囲外）

- ケースの列挙（→ [[20-enumerate-e2e-cases]]）／テスト実装（→ [[30-implement-e2e]]）／実行（→ [[40-run-and-report-e2e]]）はここでは行わない。
- 本番 DB・本番認証情報に MCP を繋がない（context として外部に出るため）。
