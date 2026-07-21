---
name: 30-implement-e2e
description: "洗い出し済みの `e2e/cases/*_cases.md` を正として、網羅的な E2E テストを実装するスキル。Web は Playwright、モバイルは Maestro。ケース ID 単位で実装し、その場で実行→失敗→修正の recursive ループを回し、テスト側/実装側どちらのバグかを判定して両方を適切に直す。緑になったケースは cases.md の実装列を更新する。「E2E 実装」「e2e を実装して」「Playwright テスト作成」「Maestro フロー作成」「ケースファイルで実装」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
model: opus
context: fork
---

# E2E 実装スキル

**目的**: cases.md を「正」として E2E を実装し、ローカルで緑にするまで持っていく。**人間ポチポチの完全代替**が到達点。

> `context: fork` で subagent 化して走る。会話履歴は引き継がないため、**入力（cases.md のパス・プラットフォーム）は起動プロンプトから受け取る**。実行系（Playwright / ブラウザ、Maestro / シミュレータ）は fork 内で自分で回す。

## 前提

- 環境は [[10-setup-e2e-env]] で構築済みであること。未構築なら先にセットアップする（または呼び出し側へ差し戻す）。
- ケースは [[20-enumerate-e2e-cases]] が作った `e2e/cases/{timestamp}_cases.md`。指定がなければ最新のレビュー済みケースファイルを使う。

## リファレンス（着手前に必読）

対象プラットフォームのものを全文読む。locator 優先順位・POM/subflow・storageState 認証・flaky 対策・trace/実行コマンドが載っている。

- Web: [references/web-e2e-playwright.md](references/web-e2e-playwright.md)
- モバイル: [references/mobile-e2e-maestro.md](references/mobile-e2e-maestro.md)

## Step 1: 共通基盤を先に作る

ケース実装より前に土台を用意する（後で並列実装しても衝突しないように）：

- Web: Page Object（`e2e/pages/`）+ `fixtures.ts` + `auth.setup.ts`（storageState）。
- モバイル: `subflows/`（`login.yaml` / `reset_state.yaml`）。

## Step 2: ケース ID 単位で実装

cases.md の 1 行 = 1 テストファイル：

- Web: `e2e/tests/{domain}/{C-XXX}_{slug}.spec.ts`
- モバイル: `.maestro/flows/{C-XXX}_{slug}.yaml`

方針：

- locator / selector はリファレンスの優先順位に従う（Web: `getByRole` > `getByLabel` > … > `getByTestId`。モバイル: `testID`）。
- 認証は storageState（Web）/ login subflow（モバイル）で使い回す。UI ログインを毎回叩かない。
- assertion は auto-retry 形式（Web: `await expect(locator).toX()`）。`waitForTimeout` は禁止。
- 1 ケース = 1 ファイル。大きなフローも 1 ストーリー単位に閉じる。
- 並列化可能なドメインは `Agent`（subagent）で並列実装してよい（共通基盤は先に作ってから）。

## Step 3: 実行→失敗→修正の recursive ループ（最重要）

1. ケースを書いたら**即実行**（Web: `npx playwright test e2e/tests/...` / モバイル: `maestro test .maestro/flows/...`）。
2. 失敗したら **trace / screenshot / view hierarchy を必ず読んでから**原因を切り分ける（推測で直さない）：
   - **テスト側**（locator 誤り、wait 不足、前提状態の作り忘れ）→ テストを修正。
   - **実装側のバグ**（ボタンが効かない、API 500、表示が出ない）→ アプリ実装を修正。
   - **仕様の曖昧さ**（期待結果が未定）→ cases.md に戻し、呼び出し側／人間へ確認を上げる。
3. **緑になったケースは即座に cases.md の `実装` 列を `[ ]` → `[x]` に更新**（1 ケース緑ごとに `Edit`。会話が途切れても cases.md だけで進捗を復元できるように）。
4. 全 P0 / P1 が緑になるまで継続。
5. **同一ケースで 3 回連続失敗したら一旦停止し状況を報告**（API クレジット保護）。

## Step 4: 最終検証

- フルランを 2〜3 回連続で回し flaky がないか確認。
- 失敗時のスクショ・trace が artifact として残る設定か確認。
- `e2e/README.md` に「ローカル実行コマンド」「CI 実行方法」「testID 付与ルール（モバイル）」を書く。
- cases.md の `実装` 列を目視確認。`[ ]` 残りは未実装 or skip を明示（skip は理由を残す）。

## テスト方針（一貫適用）

[[20-enumerate-e2e-cases]] と同じスコープを守る：**VRT はやらない**（スクショは失敗 artifact のみ）／**メールは実送せず** API・DB・mock で確認（確認リンクはトークンを DB/API から取得）／**AI 処理は mock**（ただし失敗 UI は mock で失敗を返してテスト）。

## 出力（親エージェント／人間へ返す）

```
## E2E 実装完了
- 対象: [Web / モバイル / 両方] / ケースファイル: e2e/cases/{filename}.md
- 実装ケース数: N / N（P0: x / P1: y / P2: z）
- 生成物: e2e/tests/ または .maestro/flows/ 配下 N ファイル、共通基盤: [POM/subflow/fixtures]
- 実行結果: 全 P0/P1 緑（連続 N 回）、flaky: 0% / N%
- 実装中に直したアプリコード（あれば）: path — 何を直したか
- 次: 継続的な実行と結果報告は [[40-run-and-report-e2e]]
```

## 注意事項

- **AI 生成を盲信しない**: 初回で動く確率は 70〜80%。**必ず 1 回実行して通してから** commit する。
- **実装も直す**: E2E は「実装の正しさ」を検証する手段。テストを通すために実装を壊さない。逆も同様。
- **本番データ厳禁**: MCP 経由で context に出るため、本番 DB / 本番認証情報に繋がない。
