---
name: 30-implement-e2e
description: "洗い出し済みの `docs/quality/e2e/cases/*-cases.md` を正として、網羅的な E2E テストを実装するスキル。Web は Playwright、モバイルは Maestro。ケース ID 単位で実装し、その場で実行→失敗→修正の recursive ループを回し、テスト側/実装側どちらのバグかを判定して両方を適切に直す。緑になったケースは cases.md の実装列を更新する。呼び出し元はケースファイルのパス・担当ケース ID・プラットフォームを引数で渡す。「E2E 実装」「e2e を実装して」「Playwright テスト作成」「Maestro フロー作成」「ケースファイルで実装」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
model: opus
context: fork
---

# E2E 実装スキル

**目的**: cases.md を「正」として E2E を実装し、ローカルで緑にするまで持っていく。**人間ポチポチの完全代替**が到達点。

> `context: fork` で subagent 化して走る。会話履歴は引き継がないため、**入力（cases.md のパス・プラットフォーム）は起動プロンプトから受け取る**。実行系（Playwright / ブラウザ、Maestro / シミュレータ）は fork 内で自分で回す。

## 前提

* 環境は [[10-setup-e2e-env]] で構築済みであること。未構築なら先にセットアップする（または呼び出し側へ差し戻す）。
* ケースは [[20-enumerate-e2e-cases]] が作った指定または既定のケースファイル。選び方は次の「解決順序」に従う。

## ケースファイルの解決順序（厳守）

集約台帳（`docs/quality/e2e/all-changes-cases.md`）でオーケストレーションされている場合、個別ケースには並行セッションが propose 中の無関係な change のファイルが存在しうる。最新タイムスタンプに機械的に飛びつくと、指定と異なる change を実装し、他セッションの資産を書き換える事故になる。

1. 呼び出し元がケースファイルのパス（または節・ケース ID 範囲）を明示した場合、それだけを正とする。個別ケースの探索は行わない。
2. 指定が無い場合に限り、対象 change に対応し、かつレビュー済みの `docs/quality/e2e/cases/{timestamp}-cases.md` のうち最新のものを拾う。候補が絞れなければ実装せず報告する。
3. 作業開始前に「これから読むケースファイルのパス」を宣言する。指定と異なるファイルを開いてしまったと気づいた時点で作業を止め、呼び出し元へ報告する（そのまま実装を続けない）。指定ファイルが存在しない場合も、代替を探さず報告する。

## リファレンス（着手前に必読）

対象プラットフォームのものを全文読む。locator 優先順位・POM/subflow・storageState 認証・flaky 対策・trace/実行コマンドが載っている。修正の進め方とテスト方針は参照ではなくこの本文が正。

* Web: [references/web-e2e-playwright.md](references/web-e2e-playwright.md)
* モバイル: [references/mobile-e2e-maestro.md](references/mobile-e2e-maestro.md)

## Step 1: 共通基盤を先に作る

ケース実装より前に土台を用意する（後で並列実装しても衝突しないように）：

* Web: Page Object（`e2e/pages/`）+ `fixtures.ts` + `e2e/tests/auth.setup.ts`（storageState。testDir の内側に置く）。
* モバイル: `subflows/`（`login.yaml` / `reset_state.yaml`）。

## Step 2: ケース ID 単位で実装

cases.md の 1 行 = 1 テストファイル：

* Web: `e2e/tests/{domain}/{C-XXX}_{slug}.spec.ts`
* モバイル: `.maestro/flows/{C-XXX}_{slug}.yaml`

方針：

* locator / selector はリファレンスの優先順位に従う（Web: `getByRole` > `getByLabel` > … > `getByTestId`。モバイル: `testID`）。
* 認証は storageState（Web）/ login subflow（モバイル）で使い回す。UI ログインを毎回叩かない。
* assertion は auto-retry 形式（Web: `await expect(locator).toX()`）。`waitForTimeout` は禁止。
* 1 ケース = 1 ファイル。大きなフローも 1 ストーリー単位に閉じる。
* 並列化可能なドメインは `Agent`（subagent）で並列実装してよい（共通基盤は先に作ってから）。

## Step 3: 実行→失敗→修正の recursive ループ（最重要）

その場実行・最終検証とも [40-run-and-report-e2e の「共通の実行管理」](../40-run-and-report-e2e/SKILL.md#共通の実行管理) に従う。この節だけを共通化し、30 では引き続きテストと実装を修正する。並列実装の担当にも同じ実行管理を渡す。

1. ケースを書いたら**即実行**（Web: `npx playwright test e2e/tests/...` / モバイル: `maestro test .maestro/flows/...`）。
2. 失敗したら **trace / screenshot / view hierarchy を必ず読んでから**原因を切り分ける（推測で直さない）：
   * **テスト側**（locator 誤り、wait 不足、前提状態の作り忘れ）→ テストを修正。
   * **実装側のバグ**（ボタンが効かない、API 500、表示が出ない）→ アプリ実装を修正。
   * **仕様の曖昧さ**（期待結果が未定）→ cases.md に戻し、呼び出し側／人間へ確認を上げる。
3. **緑になったケースは即座に cases.md の `実装` 列を `[ ]` → `[x]` に更新**（1 ケース緑ごとに `Edit`。会話が途切れても cases.md だけで進捗を復元できるように）。
4. 呼び出し元が指定したケース集合を、優先度によらずすべて緑にする。範囲指定がなければ全 P0 / P1 を対象にし、P2 は未実行として区別する。「全件」指定なら P2 も含む。
5. **同一ケースで 3 回連続失敗したら一旦停止し状況を報告**（API クレジット保護）。

## Step 4: 最終検証

* 今回の対象ケース集合を 2〜3 回連続で回し flaky がないか確認。リポジトリの E2E 全件は、呼び出し元が全件実行を明示したとき（`110-implement-all-openspec-changes` の Phase 4 など）だけ流す。
* 失敗時のスクショ・trace が artifact として残る設定か確認。
* `e2e/README.md` に「ローカル実行コマンド」「CI 実行方法」「testID 付与ルール（モバイル）」を書く。
* cases.md の `実装` 列を確認する。`[x]` は対象コードで成功を実測したケースだけに付け、実行根拠を残す。`[ ]` 未実装・未実行、`[c]` コード上のカバーのみ、`[s]` skip は成功に数えない。`[u]` への変更は呼び出し側が E2E 対象外とする根拠・代替 unit テストの結果を確認した場合だけにし、E2E 成功とは分ける。指定集合からの未実行・除外を隠して全件成功と報告しない。

## テスト方針（一貫適用）

[[20-enumerate-e2e-cases]] と同じスコープを守る：**VRT はやらない**（スクショは失敗 artifact のみ）／**メールは実送せず** API・DB・mock で確認（確認リンクはトークンを DB/API から取得）／**AI 処理は mock**（ただし失敗 UI は mock で失敗を返してテスト）。

## 出力（親エージェント／人間へ返す）

```
## E2E 実装完了
* 対象: [Web / モバイル / 両方] / ケースファイル: <実際の指定または既定パス>
* 実装ケース数: N / N（P0: x / P1: y / P2: z）
* 生成物: e2e/tests/ または .maestro/flows/ 配下 N ファイル、共通基盤: [POM/subflow/fixtures]
* 実行結果: <指定集合 / 既定 P0/P1> の N passed / M failed / K skipped / L 未実行（連続 N 回）
* 実行根拠: run ID / 終了コード / ログ
* 対象外: <ケース ID・理由・代替検証結果>
* 実装中に直したアプリコード（あれば）: path — 何を直したか
* 次: 継続的な実行と結果報告は [[40-run-and-report-e2e]]
```

## 注意事項

* **AI 生成を盲信しない**: 初回で動く確率は 70〜80%。**必ず 1 回実行して通してから** commit する。
* **実装も直す**: E2E は「実装の正しさ」を検証する手段。テストを通すために実装を壊さない。逆も同様。
* **本番データ厳禁**: MCP 経由で context に出るため、本番 DB / 本番認証情報に繋がない。
