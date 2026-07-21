# モバイル版 技術スタック リファレンス

このドキュメントは [SugiKent/my-wish-list](https://github.com/SugiKent/my-wish-list) の **モバイルアプリ実装（`apps/mobile/`）** をベースに、個人開発の Expo + React Native プロジェクトで採用する技術スタックの「デフォルト」を整理したものです。

> **バージョン固定はしない方針** — 各ライブラリのバージョンはこのドキュメントには記載しません。実プロジェクトでは `apps/mobile/package.json` および `expo install` の互換性解決に従ってください。

---

## 1. 全体像

| 区分 | 採用技術 | 役割 |
|------|---------|------|
| ランタイム / プラットフォーム | Expo SDK + React Native | クロスプラットフォーム（iOS/Android）モバイルアプリ |
| 言語 | TypeScript | 型安全な開発 |
| ルーティング | Expo Router | ファイルベースルーティング |
| スタイリング | NativeWind（Tailwind CSS） | ユーティリティファースト |
| API 通信 | oRPC Client（`@orpc/client`） | サーバーとの型安全な RPC |
| サーバー状態管理 | TanStack Query（`@tanstack/react-query`） | キャッシュ・再フェッチ・楽観的更新 |
| ローカル UI 状態 | React Context + `useReducer` / `useState` | Redux / Zustand は採用しない |
| 認証 | Device ID ベースの匿名認証 | Better-Auth は使わず、自前の Device ID + トークン |
| セキュアストレージ | `expo-secure-store` | 認証トークンを Keychain / Keystore に保存 |
| 描画（ニューモーフィズム） | `@shopify/react-native-skia` | デュアルシャドウなど高度な描画 |
| アニメーション | `react-native-reanimated` | ネイティブスレッドで動く高性能アニメーション |
| ジェスチャー | `react-native-gesture-handler` | スワイプ・タップなどのネイティブハンドリング |
| ボトムシート | `@gorhom/bottom-sheet` | モーダル系 UI |
| アイコン | `lucide-react-native` | SVG アイコンセット |
| 通知（Push） | `expo-notifications` | プッシュ通知の受信・スケジュール |
| エラートラッキング | `@sentry/react-native` | クラッシュ・エラー監視 |
| 解析 | `@amplitude/analytics-react-native` | プロダクト解析（採用は任意） |
| シェア・共有 | `expo-sharing` | OS のシェアシート連携 |
| ウィジェット（iOS Today / Android） | `react-native-android-widget` 等 + ネイティブ拡張 | ホーム画面ウィジェット（必要に応じて） |
| ビルド / 配信 | EAS（Build / Update / Submit / Workflows） | クラウドビルド + OTA + ストア提出自動化 |
| Linter / Formatter | Biome（`format`）+ ESLint（Expo 設定） | コードスタイル統一 |
| 型チェック | `tsc --noEmit` | CI で型チェック |
| モノレポ | pnpm workspaces + Turborepo | サーバー / Web 管理画面と共通パッケージを共有 |

> **Web 管理画面とは別物**: `apps/client`（管理画面 = React + Vite + Tailwind + Better-Auth）や `apps/server`（Fastify + oRPC + Prisma）はこのリファレンスのスコープ外です。MVP がモバイル中心であっても、サーバーが必要な場合は別途バックエンドの技術選定が必要です。

---

## 2. ディレクトリ構成（モバイル）

```
apps/mobile/
├── app/                  # Expo Router（ファイルベースルーティング）— 画面定義のみ
│   ├── (tabs)/           # タブナビゲーショングループ
│   ├── (onboarding)/     # オンボーディングフローグループ
│   └── _layout.tsx       # ルートレイアウト
├── src/
│   ├── components/       # 共通コンポーネント
│   ├── hooks/            # カスタムフック
│   ├── services/         # 外部サービス連携（oRPC クライアント、通知、シェア等）
│   ├── providers/        # Context プロバイダー（Auth / Query / Theme / Onboarding / Analytics / Notification）
│   ├── constants/        # 定数
│   ├── lib/              # ライブラリ設定（Sentry 等）
│   ├── types/            # 型定義
│   ├── utils/            # ユーティリティ
│   └── widgets/          # ウィジェット（Today Widget 等）
└── assets/               # 静的アセット
```

**原則:**
- `app/` はルーティング専用。ロジックは `src/` に分離する。
- `src/services/` で外部通信を集約し、コンポーネントから直接 API を呼ばない。
- `src/providers/` でアプリ全体の Context をまとめて管理。

---

## 3. データ管理

### Single Source of Truth（SSOT）= サーバー

- **サーバーがすべてのアプリデータの SSOT**。
- ローカルにアプリデータを永続化しない（オフラインファーストは Non-Goals）。
- TanStack Query のメモリキャッシュで UX を担保する。

### ストレージの使い分け

| ストレージ | 用途 | 禁止用途 |
|-----------|------|----------|
| サーバー（SSOT） | すべてのアプリデータ | — |
| `expo-secure-store` | 認証情報（Device ID、トークン）のみ | アプリデータの保存 |
| React State | 一時的な UI 状態、フォーム入力 | 永続化が必要なデータ |
| TanStack Query キャッシュ | サーバーデータのメモリキャッシュ | ローカル専用データ |

### 禁止事項

- AsyncStorage / MMKV にアプリデータを保存（サーバーが SSOT のため）
- ローカル DB（SQLite 等）の利用（オフラインファーストは将来対応）

---

## 4. 認証設計（Device ID 認証）

- **Better-Auth は使わない**。モバイル独自に Device ID + トークン方式を採用。
- アプリ起動時に Device ID を取得（なければ UUID v4 を生成）→ サーバーに登録 → アクセストークンを SecureStore に保存。
- トークン有効期限はやや長めに設定し、期限切れ前に自動更新（ユーザーに意識させない）。
- 認証失敗時は認証データをクリアして再登録（デバイス紛失対策）。

> ユーザー登録のフリクションをゼロにすることを優先しており、メール / パスワードを要求しない。

---

## 5. API 設計

### バージョニング

- パスベース: `/api/user/v1/rpc/*`
- v1 は破壊的変更禁止（フィールド追加は OK、削除 / 変更は NG）
- 破壊的変更が必要な場合のみ v2 を新設

### アプリバージョン追跡

API リクエストに以下のヘッダーを付与してサーバー側で利用バージョンを追跡する:

- `X-App-Version`（SemVer）
- `X-OS-Version`（`{OS}/{Version}` 形式）

### oRPC クライアント

- **`expo/fetch` を使用**: React Native の `fetch` の制限（Event Iterator など）を回避するため。
- 認証ヘッダーは RPCLink 内で SecureStore からトークンを取得して自動付与。
- `queryFn` / `mutationFn` から oRPC クライアントを直接呼ぶ。`queryKey` は `['リソース名', ...パラメータ]` 形式で統一。
- Mutation 成功時は関連クエリを `invalidateQueries` で無効化する。
- **WebSocket / SSE / ファイルアップロードも oRPC で対応**: 関連ライブラリ（`@orpc/client` の Event Iterator や multipart 対応など）を使えば、リアルタイム通信・サーバー送信イベント・ファイルアップロードも同じ oRPC レイヤーで扱える。生 WebSocket や独立した REST エンドポイントを別建てしない。
- **クライアント／サーバー間の型共有は oRPC に一本化**: 手書きの型共有パッケージ・GraphQL・OpenAPI からの型生成 などの代替手段は、よほどの事情（oRPC で本質的に解決できない要件など）が出ない限り採用しない。

### 非同期 worker / バックグラウンド処理は原則使わない

- **MVP では `expo-background-task` / `expo-task-manager` / `expo-background-fetch` などのバックグラウンド処理を原則として採用しない**。理由は (1) 複雑性の回避（OS 別の挙動差・実行保証の弱さ・デバッグ難度の高さ）、(2) MVP の実装速度を最優先するため。
- 同期がしたいデータは **アプリがフォアグラウンドに復帰したタイミングで TanStack Query の `refetchOnWindowFocus` / `invalidateQueries` で取りに行く** のを基本とする。
- どうしてもバックグラウンド実行が必要な要件（位置情報の常時取得、フォアグラウンド外での通知トリガーなど）が出てきた場合のみ、その時点で個別に検討する。
- サーバー側で非同期処理を肩代わりできるなら、可能な限り **クライアントは「リクエスト → 即レスポンス → push 通知で完了通知」のパターン** に倒し、デバイス側のバックグラウンド worker は持たない。

---

## 6. UI / スタイリング

- **NativeWind（Tailwind CSS）** を採用。Web 版と同じクラス名で書ける。
- **インラインスタイル禁止** / **CSS-in-JS 禁止**。`className` のみ使用する。
- プラットフォーム差異（shadow / hover / grid 等）は `Platform.OS` 分岐や `active:` で吸収。
- デザイン方針: **ニューモーフィズム / クレイ風**。`@shopify/react-native-skia` でデュアルシャドウを描画し、引き算の美学（控えめなシャドウ強度）を基本とする。

---

## 7. ナビゲーション

- Expo Router（ファイルベースルーティング）。
- ルートレイアウトで `QueryProvider` → `AuthProvider` の順にラップ。
- Device ID 認証はアプリ起動時に自動実行 → **ログイン画面は不要**。
- `(tabs)` / `(onboarding)` で画面グループを切り分け、オンボーディング完了状態で遷移先を決定。

---

## 8. 状態管理

| 状態の種類 | 管理方法 |
|-----------|---------|
| サーバー状態 | TanStack Query |
| ローカル UI 状態 | Context API + `useReducer` |
| フォーム状態 | React State（`useState`） |

**禁止:**
- Redux / Zustand（Context + TanStack Query で十分）
- グローバルストアへのサーバーデータ格納（TanStack Query のキャッシュを使う）
- フォームライブラリの導入（不要な複雑性のため）

---

## 9. ビルド・配信（EAS フル活用）

| サービス | 用途 |
|---------|------|
| EAS Build | クラウドビルド（Mac 不要で iOS ビルド可能） |
| EAS Update | OTA アップデート（JS バンドルを即時配信、ストア審査不要） |
| EAS Submit | ストア提出自動化 |
| EAS Workflows | CI/CD（PR ごとに Preview Update を自動生成） |

### ビルドプロファイル

| プロファイル | 用途 | 配信 |
|-------------|------|------|
| development | 開発用（Dev Client） | 内部配布（シミュレーター） |
| preview | テスト用 | 内部配布 + OTA |
| production | 本番用 | ストア配布 + OTA |

### 開発フロー

1. 初回: Development Build をクラウドで作成 → シミュレーターにインストール
2. 日常: JS の変更のみで高速イテレーション
3. PR 作成: EAS Workflows が Preview Update を自動生成（QR でプレビュー）
4. マージ: 自動でビルド → ストア提出
5. 緊急修正: hotfix/* ブランチ → OTA で即時配信（審査なし）

---

## 10. ネイティブライブラリ追加時のルール

- **`pnpm add` でネイティブライブラリを追加しない**。
- 必ず **`npx expo install <pkg>`** を使う（Expo SDK との互換バージョンを自動解決するため）。

---

## 11. コーディング規約

### 共通

- Class コンポーネント禁止 → 関数コンポーネントのみ
- Enum 禁止 → `as const` を使った const assertion

### モバイル固有

- AsyncStorage / MMKV にアプリデータを保存しない
- ローカル DB（SQLite 等）を使わない
- バージョンなし API（`/api/user/rpc`）を呼ばない。必ず `/api/user/v1/rpc` を使用
- ネイティブライブラリの追加は `npx expo install`

### React Native 固有の制約と回避策

| 制約 | 回避策 |
|------|--------|
| `File` / `Blob` 非サポート | Base64 エンコード |
| Event Iterator 制限 | `expo/fetch` を使用 |
| Streaming 制限 | `expo/fetch` で対応 |

---

## 12. このリファレンスとの差分が出やすいポイント

意思決定セッションでユーザーに **必ず確認** すべきポイント（docs と上記のデフォルトに差があり得る箇所）:

- 認証: Device ID 匿名認証で問題ないか？（メール/パスワード認証が必要な場合は方針見直し）
- データの永続化: 本当にサーバー SSOT で良いか？（オフライン要件があれば再検討）
- スタイリング: NativeWind で進めるか？
- デザイン: ニューモーフィズム / クレイ風を採用するか？別テイストにするか？
- 通知: Push 通知（`expo-notifications`）は MVP に含めるか？
- バックグラウンド処理: `expo-background-task` / `expo-task-manager` などのバックグラウンド worker を使わずに済むか？（フォアグラウンド復帰時の refetch で代替できないか確認する）
- ウィジェット: iOS Today Widget / Android Widget は MVP に含めるか？
- 解析・モニタリング: Sentry / Amplitude を MVP から入れるか？
- バックエンド: 自前サーバーが必要か？BaaS（Supabase / Firebase 等）で代替するか？
- API バージョニング: `/api/user/v1/rpc` パスベースで揃えるか？
- ストア提出: iOS / Android 両方を MVP で出すか？片方のみか？
