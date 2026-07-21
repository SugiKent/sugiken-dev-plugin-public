# MVP 意思決定カテゴリ一覧

> リファレンス技術スタック:
> - Web: `references/web-tech-stack.md`
> - モバイル: `references/mobile-tech-stack.md`（my-wish-list の `apps/mobile/` ベース）
>
> 各カテゴリ・各質問には **[共通] / [Web] / [モバイル]** のタグが付いている。SKILL.md の Phase 1 で判定した対象プラットフォームに該当するものだけ採用すること。docs と差分がある場合は必ず確認質問を行う。

## プレースホルダー規約

このスキルが扱うプレースホルダーの書式:

| プレースホルダー | 意味 | 例 |
|----------------|------|-----|
| `{TODO: 説明}` | 未入力の項目。テンプレートのデフォルト形式。 | `{TODO: サービス名}` |
| `{PENDING: 理由}` | 意思決定セッションで保留になった項目。後で決定が必要。 | `{PENDING: 未定 - ストア提出方針を検討中}` |

`{PENDING:` は `{TODO:` と区別するために使用する。`{TODO:` は「そもそも考えていない空欄」、`{PENDING:` は「一度検討したが決定を先送りにした空欄」を示す。

---

個人開発 MVP 実装前に確認すべき意思決定カテゴリと質問一覧。

---

## カテゴリ 1: プロジェクト基本情報 [共通]

docs/PROJECT.md の `{TODO}` プレースホルダーを埋めるための情報。

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| サービス名（英語・日本語）は何ですか？ | 共通 | PROJECT.md タイトル | P0 |
| サービスの目的を 1〜2 文で表現すると？ | 共通 | PROJECT.md §2.1 | P0 |
| 主なターゲットユーザーペルソナを 1〜3 つ挙げると？ | 共通 | PROJECT.md §2.3 | P0 |
| MVP に含める機能と後回しにする機能の境界線は？ | 共通 | PROJECT.md §3 | P0 |
| 提供プラットフォームは？（Web のみ / モバイル のみ / 両方） | 共通 | PROJECT.md §2.4 | P0 |
| モバイルの場合、iOS / Android のどちらを MVP で出しますか？ | モバイル | PROJECT.md §2.4 | P0 |
| スケジュール・マイルストーンのイメージは？ | 共通 | PROJECT.md §2.4 | P1 |
| ドメイン固有の用語（ユビキタス言語）はありますか？ | 共通 | PROJECT.md §6 | P1 |

---

## カテゴリ 2: 認証・認可

リファレンスのデフォルト:
- **Web**: Better Auth（Email / パスワード + マジックリンク）、`admin` / `user` ロール
- **モバイル**: Device ID ベースの匿名認証（`expo-secure-store` にトークンを保存、Better-Auth は不使用）

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| ソーシャルログイン（Google / GitHub など）は MVP に必要ですか？ | Web | docs/AUTH.md | P0 |
| ロールは `admin` / `user` の 2 種類でよいですか？追加ロールがあれば教えてください。 | Web | docs/AUTH.md §6 | P0 |
| メール確認（Email Verification）は MVP で必須ですか？ | Web | docs/AUTH.md §2 | P1 |
| 管理画面（`/admin/*`）は MVP に必要ですか？ | Web | docs/AUTH.md §1.2 | P0 |
| セッション有効期限のデフォルト（8 時間）を変更しますか？ | Web | docs/AUTH.md §2.1 | P2 |
| Device ID 匿名認証で問題ないですか？それともメール / パスワードやソーシャルログインが必要ですか？ | モバイル | docs/AUTH.md | P0 |
| 端末を跨いだデータ引き継ぎは MVP で必要ですか？（必要ならアカウント機構が必要） | モバイル | docs/AUTH.md | P0 |
| 管理者向けの管理画面が必要な場合、Web 側で別途用意しますか？ | モバイル | docs/AUTH.md §1.2 | P1 |
| トークン有効期限のデフォルト（90 日 + 期限前自動更新）を変更しますか？ | モバイル | docs/AUTH.md §2.1 | P2 |

---

## カテゴリ 3: データモデル・バックエンド

リファレンスのデフォルト:
- **Web**: PostgreSQL + Prisma（自前バックエンド）
- **モバイル**: サーバーが SSOT（ローカル永続化なし）。自前バックエンド or BaaS を選ぶ必要がある

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| バックエンドは自前で立てますか？BaaS（Supabase / Firebase 等）を使いますか？ | モバイル | docs/ARCHITECTURE.md | P0 |
| MVP で必要なメインエンティティ（テーブル）を列挙してください。 | 共通 | スキーマ（例: prisma/schema.prisma） | P0 |
| 各エンティティの主要フィールド（名前・型・必須/任意）は？ | 共通 | スキーマ | P0 |
| エンティティ間のリレーション（1対多・多対多など）は？ | 共通 | スキーマ | P0 |
| 論理削除（`deletedAt`）が必要なエンティティはありますか？ | 共通 | docs/DATABASE.md | P1 |
| 全文検索が必要なフィールドはありますか？ | 共通 | docs/DATABASE.md | P2 |
| API バージョニングは `/api/user/v1/rpc/*` のパスベースで揃えますか？ | モバイル | docs/BACKEND.md | P1 |
| オフライン対応は MVP で必要ですか？（リファレンスは Non-Goals） | モバイル | docs/MOBILE_APP.md | P1 |
| Redis（セッション / キャッシュ）は MVP で本当に必要ですか？ | Web | docs/ARCHITECTURE.md | P1 |

---

## カテゴリ 4: フロントエンド / UI・画面構成

リファレンスのデフォルト:
- **Web**: React + Vite + Tailwind CSS + React Router
- **モバイル**: Expo Router + NativeWind（Tailwind）+ ニューモーフィズム / クレイ風デザイン

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| MVP に必要な画面の一覧を教えてください。 | 共通 | PROJECT.md §4 | P0 |
| 各画面の主な機能・表示内容は？ | 共通 | PROJECT.md §4 | P0 |
| モバイル対応（レスポンシブ）は MVP で必須ですか？ | Web | docs/FRONTEND.md | P1 |
| shadcn/ui などのコンポーネントライブラリを導入しますか？ | Web | docs/FRONTEND.md | P2 |
| ダークモード対応は MVP で必要ですか？ | 共通 | docs/FRONTEND.md / docs/MOBILE_APP.md | P2 |
| OG 画像や SEO 対応は MVP で必要ですか？ | Web | docs/FRONTEND.md | P2 |
| ナビゲーション構成は？（タブ / スタック / モーダル） | モバイル | docs/MOBILE_APP.md | P0 |
| デザインテイストはニューモーフィズム / クレイ風で進めますか？別テイストにしますか？ | モバイル | docs/MOBILE_APP.md | P1 |
| アクセシビリティ（VoiceOver / TalkBack）対応はどこまで MVP に含めますか？ | モバイル | docs/MOBILE_APP.md | P2 |

---

## カテゴリ 5: 外部サービス・ネイティブ機能連携

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| トランザクションメール送信サービスは何を使いますか？（Resend / SendGrid / AWS SES など） | Web | .env.example | P0 |
| ファイルアップロード機能は MVP に必要ですか？必要ならストレージは（S3 / Cloudflare R2 / Supabase Storage など）？ | 共通 | docs/ARCHITECTURE.md | P1 |
| 決済機能（Stripe / StoreKit / Google Play Billing 等）は MVP に必要ですか？ | 共通 | docs/ARCHITECTURE.md | P1 |
| Push 通知（Web Push / `expo-notifications`）は MVP に必要ですか？ | 共通 | docs/ARCHITECTURE.md / docs/PUSH_NOTIFICATION.md | P0 |
| リアルタイム更新（WebSocket / SSE）は MVP に必要ですか？ | Web | docs/ARCHITECTURE.md | P1 |
| ホーム画面ウィジェット（iOS Today Widget / Android Widget）は MVP に含めますか？ | モバイル | docs/MOBILE_APP.md | P1 |
| OS のシェアシート連携（`expo-sharing`）は MVP に必要ですか？ | モバイル | docs/MOBILE_APP.md | P2 |
| Sentry によるエラートラッキングを MVP から導入しますか？ | 共通 | docs/MOBILE_APP.md | P1 |
| プロダクト解析（Amplitude / PostHog 等）を MVP から導入しますか？ | 共通 | docs/ARCHITECTURE.md | P2 |
| その他の外部 API 連携（地図、AI、SNS など）はありますか？ | 共通 | docs/ARCHITECTURE.md | P1 |

---

## カテゴリ 6: デプロイ・ビルド・インフラ

リファレンスのデフォルト:
- **Web**: Railway（App Service + PostgreSQL + Redis）
- **モバイル**: EAS（Build / Update / Submit / Workflows）

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| バックエンドのホスティング先は？（Railway / Fly.io / Render / Cloud Run など） | 共通 | docs/DEVELOPMENT.md | P0 |
| フロントエンドのホスティング先は？（Cloudflare Pages / Vercel / バックエンドと同一サーバー） | Web | docs/DEVELOPMENT.md | P0 |
| 本番 DB は何を使いますか？（Neon / Supabase / Railway PostgreSQL / RDS など） | 共通 | docs/DEVELOPMENT.md | P0 |
| カスタムドメインは取得済みですか？使用予定のドメインは？ | Web | docs/DEVELOPMENT.md | P1 |
| EAS で Build / Update / Submit を運用する想定でよいですか？ | モバイル | docs/DEVELOPMENT.md | P0 |
| ストア提出は iOS / Android 両方を MVP で行いますか？ | モバイル | docs/DEVELOPMENT.md | P0 |
| Apple Developer Program / Google Play Console のアカウントは取得済みですか？ | モバイル | docs/DEVELOPMENT.md | P1 |
| CI/CD（GitHub Actions / EAS Workflows）は MVP からどの程度整備しますか？ | 共通 | docs/DEVELOPMENT.md | P2 |

---

## カテゴリ 7: 非機能要件・制約 [共通]

| 質問 | 対象 | 対応ドキュメント | 優先度 |
|------|------|----------------|--------|
| 対応言語・ロケールは日本語のみですか？多言語対応は必要ですか？ | 共通 | PROJECT.md §5 | P1 |
| 個人情報を扱いますか？プライバシーポリシーの整備タイミングは？ | 共通 | PROJECT.md §5.2 | P0 |
| 利用規約ページは MVP に必要ですか？ | 共通 | PROJECT.md §5.2 | P1 |
| 月間アクティブユーザー数の初期想定は？（スケーリング方針に影響） | 共通 | docs/ARCHITECTURE.md | P2 |
| 想定する最低 OS バージョン（iOS / Android）は？ | モバイル | docs/MOBILE_APP.md | P1 |
| 想定する最低ブラウザ環境は？（Chrome / Safari の最新 N 世代など） | Web | docs/FRONTEND.md | P2 |
