# セキュリティ監査レポート: dev-utils 環境ブートストラップ領域

- **実施日時**: 2026-08-25 01:45 UTC
- **対象**: `plugins/dev-utils/skills/86-dev-login-bypass/`、`plugins/dev-utils/skills/01-local-dev-random-port/`、`plugins/dev-utils/skills/01-env-vars-setup/`（host 露出・`NODE_ENV` 関連の記述のみ）
- **手法**: STRIDE ベースの read-only レビュー、grep によるパターン走査、代表スキルの精読
- **tracking issue**: #19

## 調査仮説

| # | 仮説 | 結果 |
|---|------|------|
| H1 | `86-dev-login-bypass` の `NODE_ENV !== "production"` ガードがステージング等で破られ、未認証の任意ユーザー切替が成立する | **Medium** — 本レポートに記録 |
| H2 | `01-local-dev-random-port` が `0.0.0.0` bind と docker host port 露出を推奨し、LAN 上から dev DB / API を列挙・接続できる | **Medium** — 本レポートに記録 |
| H3 | `01-local-dev-random-port` の広い `<auto_invoke>` が docker / port 文脈で誤発動し、意図しない port 再採番や `.env` 改変を誘発する | **Medium** — 本レポートに記録 |

## Medium 指摘

### 1. dev-login の環境判定が staging / preview を本番同等に扱わない

**場所**: `plugins/dev-utils/skills/86-dev-login-bypass/SKILL.md`（絶対方針 2、Step 5 / 7、Step 8 テスト）

**内容**: サーバ側ガードは `process.env.NODE_ENV !== "production"`、クライアント側は `import.meta.env.DEV` のみ。Railway / Vercel / Render 等の **staging・preview は `NODE_ENV=production` でビルド・起動される** のが一般的であり、このスキルどおり実装すると **ステージングで `/api/dev/login/users`（全ユーザー一覧）と `/api/dev/login/as?userId=`（任意ユーザーへのセッション確立）が有効** になりうる。認証なしでメール列挙 + 1 クリック impersonation が成立する。スキルは `ENABLE_DEV_LOGIN` 等の明示フラグを禁止しており、誤設定を止める第二ゲートがない。cloudflared 公開時の `BETTER_AUTH_URL` は脚注のみで、**トンネル経由のインターネット露出**に対する IP allowlist / mTLS / 追加シークレットの記載がない。

**悪用シナリオ**: ステージング URL が漏洩（PR プレビュー、Slack 共有）した状態で dev-login が有効。攻撃者が `/api/dev/login/users` で admin メールを取得し、`/api/dev/login/as` で admin セッションを確立。本番 DB を指すステージングではデータ漏洩・権限昇格に直結。

**推奨**: `NODE_ENV` 単独ガードをやめ、`APP_ENV=development` 等の **明示的 dev-only フラグ**（デフォルト off、本番・ステージングのテンプレートでは未設定）を必須化。少なくともスキル文書に「staging / preview では絶対に有効化しない」警告と、有効化時の **loopback bind + IP allowlist** を必須手順化。一覧 API にレート制限と監査ログを追加する設計を推奨セクションへ移動（「やってはいけない」のみでは不足）。

### 2. ランダム port スキルが LAN 露出を暗黙に許容

**場所**: `plugins/dev-utils/skills/01-local-dev-random-port/SKILL.md`（§4 `host: "0.0.0.0"` 例）、`plugins/dev-utils/skills/01-env-vars-setup/SKILL.md`（`HOST` / `BIND_ADDR` の例）

**内容**: port 衝突回避は丁寧だが、Fastify の listen 例が **`host: "0.0.0.0"` 固定**。docker compose の `ports:` はデフォルトで **全インターフェースに bind** するため、採番した高位 port の Postgres / Redis / API が **同一 LAN から到達可能** になる。ファイアウォール無しのカフェ Wi‑Fi / 共有オフィス LAN で、隣マシンから `postgresql://<victim-ip>:34521/...`（`.env.example` に弱い dev パスワードが載ることが多い）へ接続しうる。`01-env-vars-setup` は `HOST` の例に `0.0.0.0` を列挙しており、**localhost-only を第一選択にしていない**。

**悪用シナリオ**: 開発者がカフェで `docker compose up` + `pnpm dev`。攻撃者が同一 LAN で port scan（30000–49151）→ Postgres / Redis へ接続 → seed データ・セッション・PII を取得。

**推奨**: ローカル開発の default を `127.0.0.1` bind に変更し、`0.0.0.0` は「LAN デバイス実機テストが必要なときだけ明示 opt-in」と注記。docker は `ports: - "127.0.0.1:${POSTGRES_HOST_PORT:-...}:5432"` 形式を推奨例に昇格。`.env.example` の DB パスワードは「ローカル専用・LAN 露出時は即ローテーション」を明記。

### 3. local-dev-random-port の auto_invoke 過剰トリガ

**場所**: `plugins/dev-utils/skills/01-local-dev-random-port/SKILL.md`（`<auto_invoke>` — `"port"` / `"5432"` / `"3000"` / `"vite"` 等 30 以上）

**内容**: `"port"` や `"5432"` 単体でスキルが自動起動しうる。Routine / PR 本文 / Issue コメントにこれらの語が含まれると、**ユーザーの意図と無関係に port 再採番・`.env` / `docker-compose.yml` / `vite.config.ts` 改変** が走る。`01-retro`（#17 H1）や Routine #3 の External Input 連鎖と組み合わさると、外部入力が「docker compose の port を直して」と言うだけで `.env` の `DATABASE_URL` を書き換え、**接続先 DB を意図せず変更** する経路がある。スキル自体は fail-fast を重視しているが、**誤発動の入口**は広い。

**悪用シナリオ**: Issue 本文に「port 3000 が使えない」とだけ書かれ、Routine が本スキルを起動。`.env` の `PORT` / `VITE_API_URL` が再採番され、開発者が気づかないうちに別プロセスの DB を指す（データ汚染）。

**推奨**: `<auto_invoke>` を削除するか、トリガーを `"ランダム port 採番"` / `"local-dev-random-port"` 等の明示フレーズに限定。自動起動時は **読み取り専用の現状診断のみ** とし、`.env` / compose の書き込みはユーザー明示承認後に限定する旨をスキル先頭に明記。

## 追加 Medium（参考）

| # | 場所 | 概要 |
|---|------|------|
| 4 | `86-dev-login-bypass` Step 3 `listLoginableUsers` | 認証なしで全テナントのユーザー email / role を返す API 設計。dev 限定前提だが、ガード破り時の blast radius が大きい。最低限の shared secret ヘッダまたは loopback-only を推奨例に含める。 |
| 5 | `86-dev-login-bypass` + `01-env-vars-setup` | `DATABASE_URL` 例が `postgres:postgres` 等の弱い dev 資格情報。LAN 露出（H2）と組み合わせると実害が増幅。スキル横断で「dev 資格情報は LAN 露出とセットで扱う」警告を統一。 |
| 6 | `01-env-vars-setup` §1 | `HOST` / `BIND_ADDR` の例に `0.0.0.0` が並列記載。env-vars セットアップは広く auto_invoke されうるため、デフォルトを `127.0.0.1` に寄せると H2 の連鎖を断てる。 |

## Low / 問題なし

| 項目 | 評価 |
|------|------|
| `86-dev-login-bypass` 方針 1（本番パイプライン再利用） | Better Auth verify 経由で `session.create.before` をバイパスしない設計は妥当 |
| `86-dev-login-bypass` E2E 禁止 | dev 専用入口を E2E に使わない方針は適切 |
| `01-local-dev-random-port` fail-fast / `strictPort: true` | port 衝突の握り潰しを避ける設計は良い |
| `01-local-dev-random-port` ephemeral port 回避 | `49152-65535` 回避の記載は適切 |

## 起票した GitHub Issues

| Issue | 重大度 | タイトル |
|-------|--------|----------|
| #19 | — | 本レポートの tracking issue（read-only 調査記録） |

Critical / High の新規問題は検出されなかったため、個別の修正 issue は起票していない（Medium は本レポートに集約）。

## 前回監査との関係

| 前回 | 本調査での扱い |
|------|----------------|
| #1 / PR #4 | H2 として `86-dev-login-bypass` を浅く言及。本調査で staging 露出・一覧 API・cloudflared を深掘り |
| #9 / PR #10 | orchestration / e2e をカバー。dev-utils は未カバー |
| #15 / PR #16 | `01-env-vars-setup` / feature-flag をカバー。host bind と dev-login の組み合わせは未カバー |
| #17 / PR #18 | basic / architect agents。dev-utils は未カバー |

## 次回監査時の確認事項

- `86-dev-login-bypass` に staging 無効化・loopback bind・明示フラグのガイダンスが追加されたか
- `01-local-dev-random-port` の `0.0.0.0` 例が `127.0.0.1` 優先に改訂されたか
- `01-local-dev-random-port` の `<auto_invoke>` が縮小または削除されたか
- #2 / #3 / #7 の対応 PR（#5 / #6 / #8）の merge 状況
