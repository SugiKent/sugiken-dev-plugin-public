---
name: 01-env-vars-setup
description: "個人開発プロジェクトのコードを書いていて環境変数（process.env / os.environ など）を扱った場合、可能な限り .env.example と .env の両方に値をセットするためのスキル。「.env」「環境変数」「process.env」「os.environ」「DATABASE_URL」「REDIS_URL」「API_KEY」「環境設定」等の発話・タスク要求時に使用。ローカルで完結する値は実値を、外部サービス由来の値はダミーをセットせず人間に追加指示を求める。"
---

# 環境変数セットアップスキル

個人開発プロジェクトで「コードに新しい環境変数を追加した」「ライブラリの設定に env を使う」など、`.env` 系ファイルの更新が必要になったときに毎回確実にやる手順をまとめる。

実装の途中で env を増やすと `.env.example` / `.env` の更新を忘れがちで、後で「動かない」「他人が clone した時に詰まる」という事故になる。コード変更と env ファイルの更新を **同じ作業単位で必ずペアにする** 。

---

## 0. 大原則

コードで新しい環境変数を参照したら、その作業単位の中で以下を必ず行う。

1. **`.env.example` を更新** する（リポジトリにコミットされる、全員が見るテンプレート）
2. **`.env` を更新** する（ローカル開発で実際に読み込まれる値、gitignore 対象）
3. ローカルで完結する値（後述）は **実値をセット** する
4. 外部サービス由来で正しい値が必要な変数は、 **ダミーをセットせず、人間に追加指示を求める**
5. monorepo 構成でも `.env` / `.env.example` は **project root に 1 つだけ** 配置する（後述の §1.5）

`.env` がそもそも無い場合は `.env.example` をコピーして作る。`.gitignore` に `.env` が入っているかも合わせて確認する。

---

## 1. 「実値をセットしてよい変数」と「人間に聞く変数」の判別

### 実値を自動でセットしてよい（ローカルで完結する）

開発者のローカルマシンや devcontainer 内で値が決まるもの。Claude が推測または既知のデフォルトでセットしてよい。

例:

| 変数 | セット例 |
|------|---------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/<app>_dev` |
| `REDIS_URL` | `redis://localhost:6379` |
| `PORT` | `3000` / `8000` など、コードのデフォルトに合わせる |
| `NODE_ENV` / `RAILS_ENV` / `APP_ENV` | `development` |
| `LOG_LEVEL` | `debug` or `info` |
| `HOST` / `BIND_ADDR` | `0.0.0.0` / `127.0.0.1` |
| `STORAGE_PATH` / `DATA_DIR` | `./data` 等のローカルパス |
| `SESSION_SECRET` / `JWT_SECRET`（開発時） | ランダム生成した dev 用文字列でOK（本番値ではないことを明示） |

判別の指針: **「他人が clone してきて、外部に何も登録せずに `pnpm dev` / `npm run dev` / `docker compose up` できる」値かどうか** 。Yes ならローカル完結、自動でセット。

### ダミーをセットしてはいけない（人間に追加指示を求める）

外部サービスの dashboard 等から正しい値を取得しないと **動作も検証もできない** もの。Claude が勝手にダミーを入れると「設定したつもりで動かない」状態になり、デバッグコストが高い。

例:

| 変数 | 取得元 |
|------|--------|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 各 LLM provider の console |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App 設定 |
| `GOOGLE_OAUTH_CLIENT_ID` 等 | GCP console |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Supabase project settings |
| `SENTRY_DSN` | Sentry project settings |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` | 各 mail provider |
| 本番 `DATABASE_URL`（Railway / Neon 等の managed DB） | 各 PaaS の dashboard |
| 各種 webhook URL（受信側のエンドポイント） | デプロイ後に確定 |

これらは:
- **`.env.example`** には **空または `your-xxx-here` 形式のプレースホルダ** を入れる（値の形式を伝えるコメントは可）
- **`.env`** には **書かない、または空のまま** にする（ダミーを入れて「設定済み」に見せない）
- 最後にユーザに以下のフォーマットで報告する:

  ```
  以下の環境変数は外部サービスから取得する必要があります。値を取得して .env にセットしてください:

  - <VAR_NAME>: <取得元の URL もしくは説明>
  - ...
  ```

判別の指針: **値が「あなたの environment」ではなく「外部サービスのアカウント」に紐付くか** 。Yes なら人間案件。

---

## 1.5. monorepo での `.env` 配置ルール

monorepo（`apps/server`, `apps/client`, `packages/*` 等）の場合でも、 **`.env` / `.env.example` は project root に 1 つだけ置く** 。各 app 配下に `.env` を分散させない。

理由:
- 同じ DB / Redis / API key を複数 app が参照することが多く、二重管理は事故の元
- secret rotation 時に 1 ファイル直せば済む
- `.gitignore` のルールが単純（root の `.env` だけ無視）

### 開発時の読み込み（推奨: Node.js `--env-file`、依存ゼロ）

各 app の `package.json` の `dev` / `start` で `--env-file` フラグを使って root の `.env` を相対パス指定で渡す。`dotenv` 等のライブラリは入れない。

`apps/server/package.json`:

```json
{
  "scripts": {
    "dev":   "tsx watch --env-file=../../.env src/index.ts",
    "start": "tsx --env-file=../../.env src/index.ts"
  }
}
```

`node` を直接使う場合も同じ:

```json
{
  "scripts": {
    "dev":   "node --watch --env-file=../../.env src/index.js",
    "start": "node --env-file=../../.env src/index.js"
  }
}
```

相対パスは **その app から見た root の `.env`** を指す。`apps/server` → `../../.env`、`apps/client` → `../../.env`、`packages/foo` → `../../.env`。

### Next.js / Vite など framework 側で env を読む app

- **Next.js**: `next dev` は app 配下の `.env.local` を自動で読む。root に集約する場合は `apps/web/.env.local` を root `.env` へのシンボリックリンクにする（`ln -s ../../.env apps/web/.env.local`）か、起動スクリプトで `--env-file=../../.env` を渡す ( `NEXT_PUBLIC_*` 等は別途 Next の規約に従う ) 。
- **Vite**: `loadEnv` の `envDir` オプションで root を指定する（`vite.config.ts` 内 `envDir: path.resolve(__dirname, '../../')`）。

### 本番環境

Railway 等の PaaS では **dashboard の環境変数機能** に直接セットする。`.env` ファイルはデプロイしない（そもそも `.gitignore` 対象）。`--env-file` はローカル開発専用と割り切る。

---

## 2. 作業手順

コードに `process.env.FOO` / `os.environ["FOO"]` / `Deno.env.get("FOO")` 等を追加・参照する変更を行ったら:

1. **追加された env を列挙** する。grep で diff を確認して漏れを防ぐ。
   ```bash
   git diff | grep -E "(process\.env|os\.environ|Deno\.env\.get|getenv|ENV\[)" | sort -u
   ```
2. 各変数を **ローカル完結 / 人間案件** に分類する。
3. **`.env.example`** を更新:
   - 全変数を記載する（ローカル完結も人間案件も）
   - ローカル完結の変数は **動く dev 値** を入れる（`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp_dev` のように）
   - 人間案件はプレースホルダ（`OPENAI_API_KEY=your-openai-api-key-here`）にし、必要なら 1 行コメントで「取得元」を書く
   - 既存変数の並びを乱さない（セクション分けがある場合は維持）
4. **`.env`** を更新:
   - ローカル完結の変数の値を実際に書き込む
   - 人間案件は **書かない、もしくは空（`OPENAI_API_KEY=`）のまま** にする
5. **gitignore 確認**: `.env` が `.gitignore` に入っていることを確認する。入っていない場合は追加する。`.env.example` は **コミットされるべき** ので gitignore から除外する。
6. **報告**: 人間案件がある場合は最後に明示的に列挙してユーザに依頼する。

---

## 3. ファイル雛形

### `.env.example`（コミット対象）

```dotenv
# --- App ---
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# --- Database (local) ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379

# --- Auth (dev secret, replace in prod) ---
SESSION_SECRET=dev-only-change-me-in-prod

# --- External services (get from each provider's dashboard) ---
OPENAI_API_KEY=your-openai-api-key-here
STRIPE_SECRET_KEY=your-stripe-secret-key-here
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret-here
```

### `.env`（gitignore 対象、ローカル）

```dotenv
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379

SESSION_SECRET=dev-only-change-me-in-prod

# Below are intentionally empty — fill in from each provider's dashboard.
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## 4. ユーザへの報告フォーマット

人間案件がある作業の終わりに必ず以下のような報告を出す（無い場合は不要）:

```
以下の環境変数は外部サービスから取得する必要があります。.env を編集して値をセットしてください:

- OPENAI_API_KEY: https://platform.openai.com/api-keys
- STRIPE_SECRET_KEY: Stripe Dashboard → Developers → API keys
- STRIPE_WEBHOOK_SECRET: `stripe listen` を実行すると表示される whsec_xxx

セット後、`pnpm dev` で起動確認してください。
```

URL や手順がはっきり分からない場合は「`<サービス名>` の dashboard で発行してください」程度でも良いが、 **何を取得すべきかは曖昧にしない** 。

---

## 5. やってはいけないこと

- **外部 API キーにそれっぽいダミー値を入れる** （例: `OPENAI_API_KEY=sk-test1234567890`）。ユーザが「設定済み」と誤認する。
- **`.env` をコミット対象にする** 。`.env.example` だけがコミットされる。
- **`.env.example` を作らず `.env` だけ更新する** 。他人（未来の自分含む）が clone した時に何が必要か分からなくなる。
- **コード変更と同じ作業単位で env を更新しない** 。後でやる、は忘れる。
- **本番値・個人の API key を `.env.example` に書く** 。リーク事故。
- **monorepo で各 app 配下に `.env` を分散させる** 。値が二重管理になり同期漏れの事故になる。 root に集約して `--env-file=../../.env` で参照する。
- **`dotenv` 等のライブラリを足す** 。Node.js 標準の `--env-file` で十分（依存ゼロ）。

---

## 自動起動

<auto_invoke>
<trigger_phrases>
- ".env"
- ".env.example"
- "環境変数"
- "env vars"
- "process.env"
- "os.environ"
- "Deno.env"
- "getenv"
- "DATABASE_URL"
- "REDIS_URL"
- "API_KEY"
- "SECRET_KEY"
- "dotenv"
- "環境設定"
- "env ファイル"
</trigger_phrases>
</auto_invoke>
