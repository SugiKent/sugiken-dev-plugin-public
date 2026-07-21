# Web版 技術スタック リファレンス

このドキュメントは、個人開発のフルスタック TypeScript プロジェクト（Web）で採用する技術スタックの「デフォルト」を整理したものです。

> **バージョン固定はしない方針** — 各ライブラリのバージョンはこのドキュメントには記載しません。実プロジェクトの `package.json` の解決バージョンに従ってください。

---

## 1. 全体像

| 区分 | 採用技術 | 役割 |
|------|---------|------|
| ランタイム | Node.js（TypeScript 直接実行サポートを利用） | サーバー実行環境 |
| 言語 | TypeScript | 型安全な開発 |
| パッケージマネージャ | pnpm | 高速・効率的な依存管理 |
| モノレポ | Turborepo | タスクオーケストレーション・キャッシュ |
| バックエンドフレームワーク | Fastify | 高速 Web フレームワーク、Plugin Architecture |
| RPC | oRPC | エンドツーエンド型安全 RPC |
| 認証 | Better Auth | Email / パスワード + マジックリンク、`admin` / `user` ロール |
| ORM | Prisma | 型安全な DB アクセス |
| DB | PostgreSQL | メインデータベース |
| キャッシュ・セッションストア | Redis | セッション / キャッシュ（ジョブキュー用途は MVP では原則使わない） |
| ロギング | Pino | 高性能ロガー（Fastify 推奨） |
| フロントエンド | React | UI ライブラリ |
| ビルドツール | Vite | 開発サーバ & 本番ビルド |
| スタイリング | Tailwind CSS | ユーティリティファースト |
| ルーティング | React Router | クライアントサイドルーティング |
| 状態管理（クライアント） | React 標準（`useState` / `useContext` / `useReducer`）+ React Actions | Redux / Zustand は採用しない |
| サーバー状態管理 | TanStack Query（オプション） | サーバーデータのキャッシュ |
| Linter / Formatter | Biome | フォーマット・lint |
| テスト | Vitest + Playwright | ユニット & E2E |
| ホスティング | Railway | App Service + PostgreSQL + Redis |
| ローカル開発 | Docker Compose | DB / Redis のローカル起動 |
| ログ監視（任意） | Betterstack / Axiom | Pino と組み合わせる |

---

## 2. ディレクトリ構成（Web フルスタック）

```
apps/
├── client/   # React SPA（ユーザー画面・管理画面）
├── server/   # Fastify + oRPC + Prisma
└── worker/   # バックグラウンドジョブ（原則として MVP では作らない。下記「非同期 worker は原則使わない」を参照）
packages/     # 共有パッケージ（型定義、ユーティリティ）
prisma/       # スキーマ・マイグレーション
docs/         # アーキテクチャ・規約ドキュメント
```

**原則:**
- `apps/client` と `apps/server` は同一サーバーから配信できる構成（SPA + 静的ファイル）。
- 型定義・スキーマは `packages/` でクライアント・サーバー間共有。
- `prisma/schema.prisma` を単一の真実とする。

---

## 3. 認証設計（Better Auth）

- **Email / パスワード認証** + **マジックリンク（15 分有効）**。
- ロール: `admin`（管理画面 `/admin/*`） / `user`（ユーザー画面 `/user/*`）。
- 永続化は **PostgreSQL + Prisma Adapter**。
- Cookie ベースのセッション。
- `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` を環境変数で制御。

---

## 4. API 設計（oRPC）

- **エンドツーエンド型安全**: クライアントからサーバーまで型が貫通する。
- Fastify プラグインとして組み込み、React 側は oRPC Client を利用。
- Repository 層を通じて Prisma にアクセスし、ビジネスロジックは Service 層に集約。
- **WebSocket / SSE / ファイルアップロードも oRPC で対応**: 関連ライブラリ（`@orpc/client` の Event Iterator、`@orpc/server` のストリーミング対応、multipart 対応など）を利用することで、リアルタイム通信・サーバー送信イベント・ファイルアップロードまで同じ oRPC のレイヤー上で扱える。これらのユースケースが出てきた場合も、別プロトコル（生 WebSocket、独立した REST エンドポイントなど）を増やすのではなく oRPC 内で完結させる。
- **クライアント／サーバー間の型共有は oRPC に一本化**: tRPC / GraphQL / 手書きの型共有パッケージ / OpenAPI スキーマからの型生成 などの代替手段は、よほどの事情（oRPC で本質的に解決できない要件、外部公開 API として OpenAPI 仕様が契約上必須、など）が出ない限り採用しない。

---

## 5. データ層

- **PostgreSQL + Prisma** が前提。`prisma/schema.prisma` がデータモデルの真実。
- マイグレーションは `prisma migrate` で管理。
- **Redis** はセッションストア / キャッシュとして利用（ジョブキュー用途は下記「非同期 worker は原則使わない」を参照）。
- BaaS（Supabase / Firebase 等）は採用しない（Railway 上で自己ホスト）。

### 非同期 worker は原則使わない

- **MVP では BullMQ / Redis ジョブキュー / 別 worker プロセス などの非同期ワーカーを原則として採用しない**。理由は (1) 複雑性の回避（プロセス追加・キュー監視・冪等性設計・失敗時リトライ設計などの実装コスト）、(2) MVP の実装速度を最優先するため。
- 重い処理が必要になっても、まずは **同期処理** または **Fastify のリクエスト内で完結する短時間処理** で済ませる方向を最初に検討する。
- どうしても必要な場合（数十秒以上かかる処理 / 外部 API のレートリミット待ち / メール一斉送信 等）でも、まずは **Postgres を簡易キューとして使う pg-boss のようなライブラリ**、または **外部マネージドサービス（Resend のキュー機能、Cloudflare Queues 等）への委譲** を検討し、独自 worker プロセスを立てるのは最後の手段とする。
- `apps/worker/` ディレクトリはテンプレートに存在するが、MVP では作らないことが基本方針。

---

## 6. フロントエンド

- React + Vite + Tailwind CSS。
- **状態管理**: React 標準フックで構成。Redux / Zustand は禁止。
- **React 19 Actions** を活用したフォーム・非同期処理パターンを推奨。
- **shadcn/ui** などコンポーネントライブラリは必要に応じて導入（強制はしない）。
- 多言語対応（i18n）が必要な場合は別途検討。

---

## 7. インフラ・デプロイ

| サービス | 用途 |
|---------|------|
| Railway App Service | Node.js アプリのホスティング |
| Railway PostgreSQL | マネージド DB |
| Railway Redis | マネージドキャッシュ |
| Railway Variables（Sealed Variables 対応） | 環境変数・シークレット管理 |
| Railway Environments | 本番 / 開発 / PR プレビュー環境 |
| Docker Compose | ローカル開発用の DB / Redis |

> リージョン選定や Replica Limits の指針は global の CLAUDE.md にあるルールに従う。

---

## 8. 開発ツール

- **Biome**: format + lint。
- **Vitest**: ユニットテスト（API / Service / ユーティリティ）。
- **Playwright**: E2E テスト。
- **OpenSpec**: 仕様駆動開発（任意・テンプレ同梱）。

---

## 9. コーディング規約

- **Class コンポーネント禁止** → 関数コンポーネントのみ
- **Enum 禁止** → `as const` を使う
- **Redux / Zustand 禁止** → React 標準フック + （必要なら）TanStack Query
- **CSS-in-JS 禁止** → Tailwind の `className` のみ
- **インラインスタイル禁止**
- **`any` の濫用禁止** → 型を切る

---

## 10. このリファレンスとの差分が出やすいポイント

意思決定セッションでユーザーに **必ず確認** すべきポイント（docs と上記のデフォルトに差があり得る箇所）:

- 認証: Better Auth（Email/PW + マジックリンク）で良いか？ソーシャルログイン（Google / GitHub 等）追加は？
- ロール: `admin` / `user` の 2 種類で良いか？追加ロールは？
- 管理画面: `/admin/*` を MVP に含めるか後回しか？
- DB: PostgreSQL + Prisma で良いか？BaaS（Supabase 等）を使うか？
- キャッシュ: Redis が本当に MVP で必要か？
- 非同期処理: 非同期 worker / ジョブキューを使わずに済むか？（同期処理や pg-boss などの簡易キューで代替できないか確認する）
- フロントエンド: React + Vite + Tailwind で揃えるか？shadcn/ui は導入するか？
- 状態管理: React 標準で十分か？TanStack Query を入れるか？
- ホスティング: Railway を使うか？フロントとバックを同一サーバー or 別ホストにするか？
- ファイルアップロード: 必要か？必要なら S3 / Cloudflare R2 / Supabase Storage？
- メール送信: トランザクションメールのサービスは？（Resend / SendGrid / AWS SES 等）
- 決済: Stripe などが MVP で必要か？
- 多言語対応 / SEO / OG 画像: MVP で必要か？
