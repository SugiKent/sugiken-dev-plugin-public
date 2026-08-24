# セキュリティ監査レポート: railway / aws / fastify / openspec 領域

- **実施日時**: 2026-08-24 22:43 UTC
- **対象**: `plugins/railway/`、`plugins/aws/`、`plugins/fastify/`、`plugins/openspec/`（前回監査 #9 / #11 の「次回確認事項」に記載の未カバー領域）
- **手法**: STRIDE ベースの read-only レビュー、grep によるパターン走査、代表スキルの精読
- **tracking issue**: #13

## 調査仮説

| # | 仮説 | 結果 |
|---|------|------|
| H1 | Railway ログ調査スキルが生ログをローカルに保存し、redact なしでレポート化すると PII / トークンが残る | **Medium** — 本レポートに記録 |
| H2 | AWS migrate Lambda の CI 例が `migrate-out.json` をそのまま Actions ログへ出力し、DB エラー詳細が漏洩する | **Medium** — 本レポートに記録 |
| H3 | OpenSpec `openspec-apply-change` が change 文書を信頼入力として tasks 完走を強制し、#3 / #9 の連鎖経路を独立して成立させる | **Medium** — 本レポートに記録 |

## Medium 指摘

### 1. Railway ログ調査の生ログ保存と redact 不足

**場所**: `plugins/railway/skills/01-railway-log-investigation/SKILL.md`（Step 3–7、`fetch_deps.sh` テンプレート）

**内容**: `railway logs --json` の生出力を `railway_logs_analysis/{TS}/dep_*.jsonl` に保存し、5xx レコードを `report.md` に貼り付ける。`.gitignore` 追加は必須としているが、保存前の redact 手順、Authorization / Cookie / email 等のマスク、レポート貼り付け前のサニタイズがない。HTTP 5xx の request/response ログには認証ヘッダやユーザ属性が含まれ得る。

**悪用シナリオ**: エージェントがレポート作成時に生 JSON を PR 本文や Artifact へ貼り付け、または `.gitignore` 漏れでコミット。共有 dev マシン上の `railway_logs_analysis/` が他ユーザーから読める。

**推奨**: 保存前に jq で known-sensitive キーを `[REDACTED]` 化する手順を必須化。レポートには集計表とタイムスタンプ・statusCode のみを載せ、生 JSON はオプトインにする。エージェント向けに「ログファイル内容を PR / Issue / Artifact へ貼らない」を絶対方針として追記。

### 2. Railway setup の診断出力とトークン取り扱い

**場所**: `plugins/railway/skills/01-railway-setup/SKILL.md`（§7 deploymentLogs、§10 診断クエリ）

**内容**: GraphQL の `deploymentLogs` / `meta` をそのまま確認・貼り付け前提で記述。環境変数名、接続エラー、スタックトレースにシークレット断片が混ざり得る。§8 は token の所在を説明するが、**token をログ・PR へ出さない**注意は PR #8（issue #7）で追加予定の改善と重なる。本調査時点の main には未反映。

**悪用シナリオ**: デプロイ失敗時の `deploymentLogs` をそのまま GitHub Issue に貼り、DATABASE_URL 断片や内部ホスト名が公開リポジトリに残る。

**推奨**: §7 / §10 の冒頭に「診断出力は機密を含み得る。貼り付け前に redact、公開チャネルには要約のみ」を明記（#7 PR merge 後も診断ログ本体の redact 手順は別途必要）。

### 3. migrate Lambda CI ログへの stderr 全文出力

**場所**: `plugins/aws/skills/prisma-migration-lambda/SKILL.md`（§5 GitHub Actions 例）

**内容**: 失敗時・成功時を問わず `cat migrate-out.json` で Lambda レスポンス全文を Actions ログへ出力。handler は migrate 失敗時に `stdout` / `stderr` を body に含める設計（§2）のため、Prisma エラーに schema パス、制約名、接続ヒントが載り得る。

**悪用シナリオ**: 失敗した migration の CI ログが org 内の広い閲覧権限を持つメンバーに露出。fork PR からの workflow 実行設定によっては外部にも漏れる。

**推奨**: CI 例を `jq` で `ok` / `error` のみ抽出してログ化し、raw JSON は artifact として短期 retention + 限定 ACL で保存する旨を追記。`migrate-out.json` を workspace から即削除する step を例示。

### 4. OpenSpec apply-change の change 文書信頼境界

**場所**: `plugins/openspec/skills/openspec-apply-change/SKILL.md`（手順 4–7、「ガードレール」「tasks への執着」）

**内容**: `contextFiles`（proposal / design / tasks / spec delta）をそのまま読み、「完了かブロックまで tasks を進め続ける」「tasks.md は一度の apply ですべて完了」と強制。change markdown が未検証の外部入力（共同編集、悪意ある spec delta、Issue 由来の propose）である旨の記述がない。#9 レポートは orchestration プラグインの `110-implement-all-openspec-changes` を対象としており、**standalone の openspec プラグイン経路**は別レイヤー。

**悪用シナリオ**: 悪意ある `tasks.md` に「認証ミドルウェアを削除」「`.env` をコミット」をタスクとして列挙し、`openspec-apply-change` 単体で実装が走る。

**推奨**: change 文書は構造化タスク ID と spec delta 参照に限定し、自由記述は参考情報と明記。auth / ingest / admin / CI 変更タスクには `35-architect-security` レビューを必須化。orchestration 連鎖時は #3 の外部入力ガードと併記。

## 追加 Medium（参考）

| # | 場所 | 概要 |
|---|------|------|
| 5 | `plugins/fastify/skills/01-fastify-dev-error-logging/SKILL.md` | `LOG_FILE` で dev の `requestBody` / `errorStack` をディスクへ二重書き込み。`.gitignore` はあるが、共有 dev 環境・エージェント Artifact 経路・CI で `LOG_FILE` が誤設定された場合のフェイルファストがない。 |
| 6 | `plugins/aws/skills/prisma-migration-lambda/SKILL.md` §4 | CI の `lambda:InvokeFunction` を `<service>-migrate*` wildcard で許可。multi-stage 同一アカウントで関数名衝突時、意図しない stage の migrate を invoke し得る。stage 固定の ARN 列挙を推奨。 |
| 7 | `plugins/railway/skills/01-railway-setup/SKILL.md` §4.2 | `serviceInstanceUpdate` の mutation 例が shell 文字列連結。`<SERVICE_ID>` / `$ENV_ID` を未検証入力から渡すと GraphQL ペイロード改ざんの余地（低確率だがエージェント自動化時に顕在化）。変数は env から取り出し、JSON は `jq -n` / heredoc で組み立てる例を推奨。 |

## Low / 問題なし

| 項目 | 評価 |
|------|------|
| `prisma-migration-lambda` 設計全般 | Secrets Manager 解決、起動時 migrate 禁止、FunctionError + body 二重チェックは妥当 |
| `01-fastify-dev-error-logging` production ガード | `NODE_ENV === "production"` で dev フック無効化は適切 |
| `openspec-propose` / `archive-change` | 実装権限は apply より限定的。explore は read 中心 |
| `35-architect-security` / agents | 外部入力敵対・LLM 出力不信頼の記述は充実 |

## 起票した GitHub Issues

| Issue | 重大度 | タイトル |
|-------|--------|----------|
| #13 | — | 本レポートの tracking issue（read-only 調査記録） |

Critical / High の新規問題は検出されなかったため、個別の修正 issue は起票していない（Medium は本レポートに集約）。

## 前回監査との関係

| 前回 | 本調査での扱い |
|------|----------------|
| #1 / PR #4 | railway token 所在は言及済み。H2 は診断ログ redact の未記載を補完 |
| #7 / PR #8 | railway §8 の token 出力禁止は対応中。H2 と重複部分あり、診断ログ本体は未カバー |
| #9 / PR #10 | orchestration / dev-tool-bootstrap をカバー。H3 は openspec プラグイン単体経路 |
| #11 / PR #12 | analytics / workshop / mvp をカバー。本調査はその「次回未カバー」領域 |

## 次回監査時の確認事項

- #7 PR（railway token 警告）の merge 後、診断ログ redact 手順が追加されたか
- #13 Medium 指摘のスキル文書改善 PR の有無
- 未カバー: `plugins/orchestration/agents/` の Codex CLI 埋め込み（#9 参考項目 #4）、`plugins/e2e/` Maestro インストール（#9 参考項目 #5）
