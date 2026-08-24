# セキュリティ監査レポート（フォローアップ）: sugiken-dev-plugin-public

- **実施日時**: 2026-08-24 20:41 UTC
- **対象**: 前回監査（#1 / PR #4）で未カバーの `plugins/orchestration/`、`plugins/dev-tool-bootstrap/`、`plugins/e2e/` 配下
- **手法**: STRIDE ベースの read-only レビュー、grep によるパターン走査、代表スキル・テンプレートの精読
- **tracking issue**: #9

## 調査仮説

| # | 仮説 | 結果 |
|---|------|------|
| H1 | `110-implement-all-openspec-changes` が OpenSpec 文書を信頼入力としてサブエージェントへ渡し、#3（Issue 過信）と組み合わさると自動実装チェーンが成立する | **Medium** — 本レポートに記録 |
| H2 | `40-admin-readonly-dashboard` の `/admin/login` がレート制限なしで magic link を副作用発火し、メール DoS が可能 | **Medium** — 本レポートに記録 |
| H3 | `01-mini-sentry-setup` の ingest がクライアント bearer のみで、レート制限なしの書き込み濫用が可能 | **Medium** — 本レポートに記録 |

## Medium 指摘

### 1. OpenSpec change 文書の信頼境界不足

**場所**: `plugins/orchestration/skills/110-implement-all-openspec-changes/SKILL.md`（Phase 0–3）、`plugins/orchestration/agents/apply-backend.md` / `apply-frontend.md` / `apply-review.md`、`plugins/e2e/skills/20-enumerate-e2e-cases/SKILL.md`

**内容**: `proposal.md` / `design.md` / `tasks.md` / spec delta をそのままサブエージェント・Codex 呼び出し・E2E ケース設計へ渡している。Routine orchestration の Issue 過信（#3）と組み合わさると、未検証の外部入力 → OpenSpec change → 自動実装の連鎖が成立する。

**悪用シナリオ**: 悪意ある change 文書に「認証チェックをスキップ」「シークレットを `.env.example` へ」等を埋め込み、`Write` + `Bash` 権限のサブエージェントが従う。

**推奨**: OpenSpec markdown は要件参考に限定。構造化された `tasks.md` チェックリストと spec delta ID のみを自動化ゲートとする。委譲時はスキーマ境界付きの抜粋を渡す。auth / ingest / admin パスでは archive 前に `apply-review` + `architect-security` を必須化。

### 2. Admin login の副作用 DoS

**場所**: `plugins/dev-tool-bootstrap/skills/40-admin-readonly-dashboard-setup/references/admin-template/routes.ts`（`GET /admin/login`）

**内容**: 404 を返しつつ毎回 `signInMagicLink` を固定 admin email へ発火。IP / セッション単位のレート制限・クールダウンがテンプレートにもスキル文書にもない。

**悪用シナリオ**: パスを知った攻撃者が高頻度 GET により admin inbox とメールプロバイダを濫用（ハラスメント、コスト、プロバイダ throttling）。認証バイパスではないが、認可なしの状態変更副作用。

**推奨**: per-IP レート制限（例: 1 時間 1 回）、閾値超過時のサイレント drop、ログ記録。ステージングでは pre-shared header / HMAC を検討。繰り返し GET のテストを追加。

### 3. mini-sentry ingest の書き込み濫用

**場所**: `plugins/dev-tool-bootstrap/skills/01-mini-sentry-setup/SKILL.md`、`references/server-implementation.md`（`POST /v1/errors/ingest`）

**内容**: Bearer トークン認証と 64KB body cap はあるが、per-IP / per-token のレート制限がない。dedupe は webhook 連投防止であり DB 書き込み量の上限ではない。

**悪用シナリオ**: モバイルバイナリや env からトークン漏洩後、高頻度の valid payload で `error_events` を埋め、DB / ストレージコストと Discord / Slack 通知を増幅。新 fingerprint ごとに webhook が飛ぶ。

**推奨**: トークンローテーション手順の文書化。token + IP のレート制限、日次イベント上限、サーバ起点イベントの IP allowlist 検討。`message` / `stack` の PII マスク拡張。クライアント bearer は難読化であり強認証ではない旨を明記。

## 追加 Medium（参考）

| # | 場所 | 概要 |
|---|------|------|
| 4 | `apply-backend.md`、`00-install-openspec/references/apply.md` | `codex exec -p fugu -C . "..."` で OpenSpec 文をシェル文字列に埋め込むと command injection リスク。heredoc / ファイルベース prompt を推奨。 |
| 5 | `plugins/e2e/skills/10-setup-e2e-env/SKILL.md` | `curl \| bash` による Maestro インストールに checksum ピン留めなし（サプライチェーンリスク）。 |
| 6 | `110-implement-all-openspec-changes` + `apply-archive.md` | E2E 延期により archive 後に auth / admin 回帰が検知遅延する可能性。archive 前のセキュリティケースチェックリストを推奨。 |

## Low / 問題なし

| 項目 | 評価 |
|------|------|
| `apply-commit` / `apply-archive` agents | `git add -A` 禁止、push 禁止、archive 前提条件は適切 |
| `prisma-migration-lambda` | migrate/deploy 分離は妥当。IAM はデプロイ時の関心事 |
| `plugins/analytics/*` | PII 取扱いガイダンスは概ね妥当 |
| `plugins/basic/hooks/` | 前回監査どおり Python のみ、shell 未使用 |

## 起票した GitHub Issues

| Issue | 重大度 | タイトル |
|-------|--------|----------|
| #9 | — | 本レポートの tracking issue（read-only 調査記録） |

Critical / High の新規問題は検出されなかったため、個別の修正 issue は起票していない（Medium は本レポートに集約）。

## 前回監査（#1）との関係

| 前回 issue | 本調査での扱い |
|------------|----------------|
| #2 assess-pr-risk | 対象外（PR #5 で対応中） |
| #3 routine-orchestration | H1 で OpenSpec 層への拡張として関連。PR #6 で Routine 側は対応中 |
| #7 Medium 文書改善 | 対象外（PR #8 で対応中）。H2/H3 は別テンプレートの Medium |

## 次回監査時の確認事項

- #2 / #3 / #7 の PR が merge されたか
- OpenSpec 文書の信頼境界が `110` スキルに反映されたか
- admin / mini-sentry テンプレートにレート制限ガイダンスが追加されたか
