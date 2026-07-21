---
name: 01-amplitude-setup
description: "個人開発プロジェクトに Amplitude を導入する際の実装スキル。Web 版（Browser SDK 2 / full-ts-template）、モバイル版（React Native SDK / Expo + my-wish-list）、サーバ版（Node SDK / Fastify）の 3 面をカバーし、PV / クリック / 異常系 / サーバイベント の 4 系統を漏れなく拾う標準設計、event property 設計パターン、命名規約、PII 取り扱い、anonymous → identify の移行、autocapture の取捨選択、dev/prod 切り替え、検証フロー、アンチパターンまでを提供する。「Amplitude」「analytics」「イベントトラッキング」「event tracking」「track event」「user property」「tracking plan」「@amplitude/analytics-browser」「@amplitude/analytics-react-native」「@amplitude/analytics-node」「session replay」「autocapture」「identify」「setUserId」「ampli」等の発話・タスク要求時に使用。"
---

# Amplitude セットアップスキル

個人開発に Amplitude を導入し、 **「あとから分析できる粒度」と「あとから捨てられる柔軟さ」を両立** させるためのスキル。

Amplitude は「とりあえず入れて全部 track」すると 1 週間で破綻する（命名がブレ、PII が漏れ、同一ユーザーが複数 device で分裂し、event 量が読めなくなる）。逆に「完璧な tracking plan ができてから入れる」と永遠に入らない。**最小の tracking plan を先に固め、後述する 4 系統を漏れなく拾う標準構造で始める** のが個人開発の正解。

このスキルは「何をどう track するか」の **設計判断** を中心に書く。SDK の細かい API は公式 docs を見れば足りるので、ここでは要点だけ示す。

---

## 0. 大原則

1. **tracking plan を先に書く** （`docs/analytics/tracking-plan.md`）
2. **命名規約は最初に決めて二度と変えない**: event 名は **日本語** で `名詞_動詞過去形`（例: `画面_表示`, `CTA_クリック`, `サインアップ_失敗`）。property 名は `snake_case` 英語
3. **必ず拾う 4 系統**:
   - **A: PV (page / screen view)** — Web も Mobile も全画面
   - **B: クリック / タップ** — 主要 CTA は明示 track、それ以外は Web autocapture / Mobile wrapper で網羅
   - **C: 異常系** — 4xx / 5xx、JS unhandled error、RN ErrorUtils、API timeout
   - **D: サーバイベント** — メール送信、決済確定、cron 実行など、クライアントでは検知できない非同期処理
4. **PII を user_id に入れない**: 内部 UUID（DB の users.id）を使う。メール・電話・名前は user_id にしない
5. **dev と prod で Amplitude project を分ける** （API key も別）。同じ project に混ぜると分析が壊れる
6. **anonymous → identify on login → reset on logout** を必ず実装する
7. **クライアントとサーバで device_id / user_id を必ず一致させる**。一致しないとユーザー単位の funnel が分断される
8. **dev で実機検証を必ずやる**（Chrome 拡張 Instrumentation Explorer / `logLevel: Debug`）

---

## 1. tracking plan を先に書く

`docs/analytics/tracking-plan.md` を以下の構造で書き、 **実装前に user に内容を確認してもらう** 。

### 1.1 含めるセクション

1. **命名規約**
   - event 名: **日本語** 、 `名詞_動詞過去形`（例: `ウィッシュ_作成`, `サインアップ_完了`, `メール_送信失敗`）
   - property 名: `snake_case` 英語（`is_*` / `has_*`、単位付き `duration_ms` など）
   - 言語を混ぜない（event 名は全部日本語、property 名は全部英語に揃える）
2. **Identity 戦略** （user_id は内部 UUID、ログアウトで reset、サーバへ device_id 引き回し）
3. **4 系統の Event 一覧** （後述）
4. **User Properties 一覧**
5. **送らない情報（PII）の明示**

### 1.2 4 系統の標準 event 設計

#### 系統 A: PV

| event_name | trigger                                        |
| ---------- | ---------------------------------------------- |
| `画面_表示` | 画面遷移完了時に 1 回（SPA は route 変更ごと） |

共通 event_properties:

- `screen_name` (論理名: `home`, `wish_detail`, `settings`)
- `screen_path` (テンプレ化済み: `/wishes/[id]`。 **raw id を入れない**)
- `referrer_screen` (直前の screen_name)
- `is_first_view` (そのセッションの初回か)
- `query_params` (PII キーを strip 済みの object)

#### 系統 B: クリック / タップ

| event_name      | trigger                                   |
| --------------- | ----------------------------------------- |
| `CTA_クリック`  | 主要 CTA（signup, purchase, share）押下時 |
| `ナビ_クリック` | グローバルナビ / タブ切替時               |

共通 event_properties:

- `cta_id` （ **分析の主軸**: `signup_hero`, `purchase_premium`, `share_to_line`。 UI 変更で変わらない安定 ID）
- `cta_label` （表示テキスト。参考用）
- `screen_name`, `position` (`header` / `footer` / `card_n`)

それ以外の generic な click は Web autocapture / Mobile の共通 Pressable wrapper に拾わせる（保険）。主軸は明示 track した `cta_id` で行う。

#### 系統 C: 異常系

**業務的失敗** （ユーザー操作が失敗で終わった）:

| event_name        | trigger                             |
| ----------------- | ----------------------------------- |
| `サインアップ_失敗` | サインアップが失敗（API 4xx 含む） |
| `決済_失敗`        | 決済が失敗                          |

共通 event_properties:

- `reason_code` （ **enum 事前列挙**: `invalid_email` / `email_taken` / `rate_limited` / `network_error`）
- `reason_message` （ユーザーに見せたメッセージ。PII 不可）
- `http_status`, `retry_count`

**技術的異常** （unhandled error、API 通信失敗）:

| event_name              | trigger                                  |
| ----------------------- | ---------------------------------------- |
| `クライアントエラー_発生` | JS 例外 / unhandled rejection / RN crash |
| `APIエラー_発生`         | API call が想定外 status / timeout       |

共通 event_properties:

- `error_name` （`TypeError` 等のクラス名）
- `error_message` （ **先頭 200 文字に truncate** 。raw で送ると cardinality 爆発）
- `error_stack_top` （ **上位 3 行のみ** 。容量と PII 観点）
- `feature` （`auth.login` / `wish.create` / `payment.checkout`）
- `screen_name`

#### 系統 D: サーバイベント

クライアントでは検知できない event を Node SDK で送る。

| event_name       | trigger                          |
| ---------------- | -------------------------------- |
| `メール_送信`     | transactional メール送信成功    |
| `メール_送信失敗` | メール送信失敗                  |
| `Webhook_受信`    | Stripe / LINE 等の webhook 受信 |
| `決済_確定`       | 決済確定処理完了                |
| `定期処理_実行`   | 定期処理の実行                  |

共通 event_properties:

- `event_source: "server"` 固定（client event との区別用）
- `service` （`mailer` / `stripe` / `cron`）
- `correlation_id` / `job_id` （リクエスト単位で串刺し可能な ID）
- `duration_ms`, `is_success`, `error_code`

---

## 2. Event Property 設計パターン

event property は **気軽に増やすと cardinality が爆発して分析できなくなる** 。以下のパターンを書く前に必ず思い出す。

### 2.1 ID 系は『何の ID か』を名前に含める

- ❌ `id` （何の id か不明）
- ❌ `user_id` を event_property に入れる（Amplitude が自動付与する予約 field と衝突）
- ✅ `wish_id` / `stripe_payment_intent_id`

### 2.2 enum は事前列挙し、型で縛る

`reason_code` / `signup_method` / `share_target` のような分類軸は tracking plan に **取りうる値を列挙** 。コード側は TypeScript の Union 型で縛る。自由文字列を許すと `"network error"` / `"NetworkError"` / `"network_error"` が並ぶ。

### 2.3 cardinality 爆発を避ける

property の取りうる値の総数は数百〜数千以内に抑える。

- ❌ `screen_path` に raw id（`/wishes/abc-123-def-...`）→ ✅ テンプレ化（`/wishes/[id]`）
- ❌ `error_message` 生送り（末尾に request id / timestamp が混ざる）→ ✅ 先頭 200 文字 + 動的部分を strip
- ❌ 検索クエリ自由文字列をそのまま入れる → ✅ 文字数 / カテゴリ等の派生指標にする

### 2.4 単位を名前に含める

- ❌ `duration` / `price`  → ✅ `duration_ms` / `price_jpy`

### 2.5 boolean は `is_*` / `has_*`

- ❌ `premium: true` → ✅ `is_premium: true`

### 2.6 共通 property は基盤で自動付与する

すべての event に乗せたい property（`app_version`, `env`, `platform`）は track のたびに引数で渡さず、SDK ラッパーで **自動注入する** 。ラッパーは `withCommonProps(props)` のような薄い関数 1 つで足りる。

### 2.7 event_property と user_property の使い分け

「次の event でも同じ値が変わらず欲しいか？」で判断する:

- **event_property**: その event 固有の文脈（`wish_category`）
- **user_property**: ユーザーに紐づき、次以降の event にも残る（`plan: "premium"`, `signup_at`）

`plan` のような「すべての event を絞り込みたい値」は user_property に置く。

### 2.8 PII を property に入れない

- ❌ `email` / `phone` / `full_name`
- ✅ `email_domain` （`@example.com` だけ）、カテゴリ化した値
- 自由記述本文は **文字数 / 文字種** などの派生指標に変換

---

## 3. Identity 戦略（最重要）

個人開発で最も事故りやすい部分。

### 3.1 ルール

1. **anonymous 期間**（未ログイン）: user_id は設定しない → Amplitude は device_id だけで追跡
2. **ログイン時**: `setUserId(user.id)` + `identify(...)` を 1 度だけ呼ぶ → device_id と user_id が自動 merge され、anonymous 期間の event も同じユーザーに統合される
3. **ログアウト時**: `reset()` を呼ぶ → 新しい device_id が振られる（次のユーザーが同じ端末を使っても混線しない）

### 3.2 クライアント ↔ サーバの id 引き回し

サーバから送る event を **同じユーザーに紐付ける** ため、API リクエストごとに device_id を HTTP ヘッダで送る:

- クライアント: `getDeviceId()` の結果を `X-Amp-Device-Id` ヘッダに乗せる（API client のラッパーで一律付与）
- サーバ: ヘッダから device_id を取り出し、Node SDK の `track` に **明示的に渡す** （`user_id` は認証 session から）

### 3.3 アンチパターン

- ❌ user_id にメールアドレスを使う（変更で別人扱い + GDPR リスク）
- ❌ ログアウトで `setUserId(null)` だけ、`reset()` を呼ばない
- ❌ サーバ event で device_id / user_id を渡さず Amplitude に自動生成させる（毎回別ユーザー扱い）
- ❌ `setUserId` を毎 event 前に呼ぶ（init / login の 1 度だけで十分）

---

## 4. Web (full-ts-template) の実装方針

- パッケージ: `@amplitude/analytics-browser`
- 設定:
  - **autocapture は `pageViews` / `sessions` / `elementInteractions` / `formInteractions` / `frustrationInteractions` / `fileDownloads` / `attribution` を ON**（全 PV / 全 click の保険）
  - `networkTracking` / `webVitals` は OFF （自前 `api_error_occurred` を送る、Web Vitals は別ツールに任せる）
  - dev は `logLevel: Debug`、prod は `Warn`
  - `minIdLength: 1` （内部 UUID 短縮形が弾かれないよう明示）
- 起動: アプリ初期化時に 1 度だけ `init()`、`pagehide` で `setTransport("beacon")` + `flush()`
- PV: autocapture と並行して **明示の `page_viewed` も SPA route 変更で送る** （screen_name の論理名を持たせるため）。React Router なら `useLocation` の effect で発火、 **`screen_path` はテンプレ化する**
- Click: 主要 CTA は明示 `cta_clicked`。それ以外は autocapture に任せる
- Error: `window.addEventListener("error" / "unhandledrejection")` + `ErrorBoundary` の `componentDidCatch` で `client_error_occurred` を送る
- API client: `fetch` ラッパーで `X-Amp-Device-Id` を自動付与
- env: `VITE_AMPLITUDE_API_KEY` （`01-env-vars-setup` の規約に従い、 dev key を user に取得依頼）

実装は `apps/web/src/lib/analytics.ts` に 1 ファイルでまとめる。関数の最小セット: `initAnalytics()` / `trackEvent()` / `trackPageView()` / `trackCtaClick()` / `trackClientError()` / `trackApiError()` / `identifyUser()` / `incrementUserProperty()` / `resetAnalytics()` / `getAmplitudeHeaders()` / `setupBeaconFlush()` / `setupGlobalErrorTracking()`。

---

## 5. モバイル (Expo + React Native / my-wish-list) の実装方針

- パッケージ: `@amplitude/analytics-react-native` + `@react-native-async-storage/async-storage`
- Expo v2.0.9 以降は Podfile 修正不要。Expo managed workflow でも config plugin 追加なし
- 設定:
  - `flushQueueSize: 30`, `flushIntervalMillis: 10_000`
  - `trackingOptions` で `adid: false`, `carrier: false` （個人開発で広告属性は不要）
  - dev は `Debug`、prod は `Warn`
- 起動: `App.tsx` の `useEffect` で `init()` を await、 `AppState` 'background' で `flush()`
- PV: RN は autocapture がないので、Expo Router の `usePathname` / `useSegments` を effect で監視し、 **画面遷移ごとに `page_viewed` を明示発火** 。`screen_name` は segments の末尾、`screen_path` は pathname
- Click: **共通 `TrackedPressable` ラッパー** を作る。`ctaId` prop があれば `cta_clicked`、無ければ generic `element_tapped` を吐く。主要 button はすべてこのラッパーに差し替える
- Error: `ErrorUtils.setGlobalHandler` で `client_error_occurred` を送る。既存ハンドラを保存して chain する
- API client: `getDeviceId()` を `X-Amp-Device-Id` ヘッダに付与
- env: `EXPO_PUBLIC_AMPLITUDE_API_KEY` （ **クライアントバンドルに埋め込まれる前提** の public key なので OK。秘密鍵は絶対に `EXPO_PUBLIC_` に入れない）
  - **EAS Environment Variables に登録する場合は visibility を `sensitive` (または `plaintext`) にする。 `secret` で登録すると `EXPO_PUBLIC_*` であっても client bundle に注入されず `undefined` になり、 init が呼ばれず event が一切送られない** 。 build ログに警告も出ないので発覚が遅れる典型パターン（EAS の Environment Variables の visibility 仕様に起因）

実装は `apps/mobile/src/lib/analytics.ts` に集約し、`TrackedPressable` だけ `components/` に置く。

---

## 6. サーバ (Fastify / Node) の実装方針

- パッケージ: `@amplitude/analytics-node`
- 設定:
  - `flushQueueSize: 100`, `flushIntervalMillis: 10_000`
- 起動: `initServerAnalytics()` を app 起動時に呼ぶ。 `SIGTERM` で `await flush()`
- track 時の identity:
  - リクエスト経由 event（メール送信など）: ヘッダ `X-Amp-Device-Id` + session の `user_id` を **明示的に** Node SDK に渡す
  - cron / worker: 特定ユーザーに紐付かないので、固定 device_id（`server-prod` / `server-dev`）を使う
  - **user_id / device_id のどちらも無い event は drop して warn** （Amplitude が拒否するため）
- 共通 event_property:
  - `event_source: "server"` を必ず付与（client event との区別軸）
  - `app_version`, `env`, `service`, `correlation_id`, `duration_ms`, `is_success`
- env: `AMPLITUDE_API_KEY_SERVER` （クライアントとは別 key にしても良いが、個人開発では同じ project で OK。 `event_source` で区別できる）

実装は `apps/server/src/lib/analytics.ts` に集約。関数の最小セット: `initServerAnalytics()` / `trackServerEvent(name, identity, props)` / `shutdownServerAnalytics()`。

`trackServerEvent` の identity 引数は `{ userId?: string; deviceId?: string }` を取り、 **両方 undefined なら drop + warn** という規約にする。

---

## 7. dev / prod 切り替え

1. Amplitude UI で **dev project と prod project を別に作る** （無料枠で複数 OK）
2. Web: `.env.development` / `.env.production` で API key を分ける（Vite が自動切替）
3. Mobile: `eas.json` の env で `EXPO_PUBLIC_AMPLITUDE_API_KEY` を環境別に出し分け
4. Server: deploy 環境変数で `AMPLITUDE_API_KEY_SERVER` を環境別にセット
5. dev 環境では `logLevel: Debug` を必ず ON
6. Chrome 拡張 [Amplitude Instrumentation Explorer](https://chrome.google.com/webstore/detail/amplitude-instrumentation/acehfjhnmhbmgkedjmjlobpgdicnhkbp) を入れる

---

## 8. 検証フロー（実装後に必ずやる）

dev で 4 系統それぞれを実機検証する:

| 系統   | 確認手順                                                                       |
| ------ | ------------------------------------------------------------------------------ |
| A (PV) | 全画面を遷移して `画面_表示` が画面数だけ届き、 `screen_path` がテンプレ化されている |
| B (Click) | 主要 CTA で `CTA_クリック.cta_id` が一意に届く。それ以外も autocapture / wrapper 経由で届く |
| C (Error) | API を 500 にする / `throw` を仕込んで `APIエラー_発生` / `クライアントエラー_発生` が届く |
| D (Server) | メール送信 / 決済 confirm / cron 実行で **同じ user_id / device_id** でサーバ event が届く |

確認手段:

1. DevTools Console / Metro log で `[Amplitude]` log が出ている
2. Amplitude UI → User Look-Up → 自分の device_id で event が並ぶ
3. event_properties が tracking plan と一致
4. ログアウト後の event は別 user として記録される

**「テストが通ったから OK」と判断しない** 。init タイミング / PV listener 漏れ / identity merge 失敗は UI 動作からしか拾えない。

---

## 9. アンチパターン集

- ❌ tracking plan を書く前にコードに `track("xxx")` を散らかす
- ❌ event 名の表記揺れ（`ウィッシュ_作成` / `ウィッシュ作成` / `wish_created` の混在）。日本語 `名詞_動詞過去形` で統一する
- ❌ event 名と property 名で言語を混ぜる（event は日本語、property は英語 snake_case に揃える）
- ❌ `screen_path` に raw id を入れて cardinality 爆発
- ❌ `reason_code` を自由文字列にする（必ず事前列挙）
- ❌ user_id にメールアドレス
- ❌ ログアウトで `reset()` を呼ばない
- ❌ サーバ event に device_id / user_id を渡さない
- ❌ `error_message` を raw で送る
- ❌ dev と prod を同じ Amplitude project に送る
- ❌ Amplitude key を `EXPO_PUBLIC_` 以外の env に入れて RN bundle で undefined
- ❌ EAS Environment Variables で `EXPO_PUBLIC_AMPLITUDE_API_KEY` を visibility `secret` で登録（ `EXPO_PUBLIC_*` でも client bundle に注入されず undefined になる。 client から読む値は `sensitive` か `plaintext` ）
- ❌ 自由記述本文を event_property に
- ❌ ページ離脱時の beacon flush を入れない
- ❌ `track()` を await する（fire-and-forget が前提。サーバ shutdown の flush だけは await）
- ❌ 「あとから event 名を変えればいい」と思って雑に命名 → 既存データと別 event 扱いで永遠に分断

---

## 10. 適用順序チェックリスト

1. Amplitude で **dev project と prod project を別に作成** し、各 API key を取得
2. `docs/analytics/tracking-plan.md` を §1 で書き、 **user に確認してもらう** （実装前）
3. `.env.example` に Web / Mobile / Server の key を追加
4. Web / Mobile / Server それぞれで SDK を install
5. `lib/analytics.ts` を §4 / §5 / §6 の方針で作る（関数の最小セットだけ実装）
6. アプリ起動時に `init()` を呼ぶ
7. Web: `setupBeaconFlush()` + `setupGlobalErrorTracking()` + Router listener コンポーネント
8. Mobile: `AppState` background で `flushOnBackground()` + `ErrorUtils` 監視 + Expo Router listener + `TrackedPressable` で主要 button を差し替え
9. Server: `SIGTERM` で flush + 各 route / worker / cron で `trackServerEvent`
10. ログインで `identifyUser`、ログアウトで `resetAnalytics`
11. API client に `X-Amp-Device-Id` ヘッダを差し込む
12. 4 系統の event を仕込む
13. `pnpm dev` で §8 の検証フローを **必ず実機実行**
14. Amplitude UI で「自分の user_id で全 event が届く」「サーバ event と client event が同じ user に紐づく」「event_properties が tracking plan 通り」を確認

13〜14 を省くと、本番後に「event 名がブレてた」「user merge が壊れてた」「サーバ event が別 user に行ってた」が発覚して過去データが救えなくなる。
