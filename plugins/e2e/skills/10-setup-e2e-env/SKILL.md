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

リファレンス: `../30-implement-e2e/references/web-e2e-playwright.md`

未導入の項目のみ実施する（既存を壊さない）。

1. **インストール**: リファレンス §1-1 に従い Playwright とブラウザバイナリを導入する。
2. **ディレクトリと config**: §1-2 / §1-3 に従い `e2e/` の構成と `playwright.config.ts` を用意する（`setup` プロジェクトで storageState 依存、初期は chromium 単体、trace / screenshot は失敗時のみ）。
3. **`.gitignore`**: §1-4 の項目を追加する。
4. **Claude Code 連携（任意）**: §4-1 に従い Playwright MCP を登録する。

## Step 2-B: モバイル（Maestro）セットアップ

リファレンス: `../30-implement-e2e/references/mobile-e2e-maestro.md`

1. **インストール**: リファレンス §2-1 に従い Maestro を導入する。
2. **ディレクトリ**: §2-2 / §2-3 に従い `.maestro/` と `docs/quality/e2e/cases/` を用意する。E2E の設計・進捗は後者を正本とし、テスト実装そのものは `.maestro/` に置く。
3. **アプリ側の準備（必須）**: 全インタラクティブ要素へ `testID`（命名規則 `{screen}_{action}_{target}`）を付与。E2E フラグでアニメ・splash・analytics を無効化（§2-4）。testID の付与状況を確認し、不足を洗い出す。
4. **Claude Code 連携（任意）**: Maestro MCP を登録する。

## Step 3: 完了確認とハンドオフ

- Web: `npx playwright test` が「0 tests」でも正常終了することを確認（ハーネスが起動する）。
- モバイル: `maestro --version` とシミュレータ/エミュレータ起動を確認。
- 完了したら次フェーズを案内する:
  - OpenSpec の propose 段階にいるなら [[20-enumerate-e2e-cases]] でケースを列挙。
  - 既にケースがあるなら [[30-implement-e2e]] で実装。

## やらないこと（このスキルの範囲外）

- ケースの列挙（→ [[20-enumerate-e2e-cases]]）／テスト実装（→ [[30-implement-e2e]]）／実行（→ [[40-run-and-report-e2e]]）はここでは行わない。
- 本番 DB・本番認証情報に MCP を繋がない（context として外部に出るため）。
