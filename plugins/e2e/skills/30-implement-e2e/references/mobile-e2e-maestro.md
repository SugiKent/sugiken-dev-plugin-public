# モバイル E2E リファレンス（Maestro）

モバイル版 E2E は **Maestro**（mobile.dev）を使う。Expo + React Native を前提に、個人開発 MVP で「人間ポチポチを完全代替」できる E2E を構築するためのリファレンス。

---

## 1. なぜ Maestro か

- YAML だけでフローが書け、学習コストが低い
- 自動 wait（assertVisible は標準 7 秒リトライ）で flake が出にくい
- `maestro studio` で実機を見ながら GUI でフロー生成可能
- Maestro MCP server が公式に存在し、Claude Code との接続が `claude mcp add maestro -- maestro mcp` の 1 行で完結
- Detox より圧倒的に保守コストが低く、個人開発 MVP では Maestro 単独で 90% カバー可能

---

## 2. セットアップ

### 2-1. インストール

```bash
# macOS / Linux / WSL
curl -fsSL "https://get.maestro.mobile.dev" | bash

# あるいは Homebrew
brew tap mobile-dev-inc/tap
brew install maestro

# バージョン固定（チーム・CI で一致させる）
export MAESTRO_VERSION=1.37.0
```

Java 17+ が必須（Android Emulator 経由）。`maestro --version` で確認。

### 2-2. ディレクトリ構成

```
.maestro/
  config.yaml                  # workspace 全体設定
  flows/                       # シナリオ（ケース ID 単位）
    C-001_smoke_launch.yaml
    C-010_auth_happy.yaml
    C-011_auth_empty.yaml
    C-020_core_journey.yaml
  subflows/                    # 再利用部品
    login.yaml
    reset_state.yaml
e2e/
  cases/                       # テストケース md（このスキルの成果物）
    2026-05-17-1430_cases.md
.env.maestro                   # APP_ID, TEST_EMAIL 等
```

### 2-3. .maestro/config.yaml

```yaml
# workspace 共通設定
includeTags:
  - smoke    # CI で常に実行
excludeTags:
  - wip
executionOrder:
  flowsOrder:
    - C-001_smoke_launch
    - C-010_auth_happy
```

### 2-4. アプリ側の準備（必須）

#### testID を全インタラクティブ要素に付与

命名規則: `{screen}_{action}_{target}` 推奨。例:

```tsx
<TextInput testID="login_email_input" />
<Button testID="login_submit_button" onPress={...} />
<View testID="home_screen" />  {/* 画面到達判定用 */}
```

#### E2E フラグでアニメ無効化

```tsx
import { LaunchArguments } from 'react-native-launch-arguments';

export const IS_E2E = !!LaunchArguments.value<{ isE2E?: boolean }>().isE2E;

if (IS_E2E) {
  LogBox.ignoreAllLogs();
  // analytics 停止、splash 短縮、アニメ無効化 など
}
```

#### Expo: Dev Client / 内部配布ビルドを使う

Expo Go では `launchApp` の `appId` 制御が効かないため、**E2E は必ず Dev Client / EAS Build で**。

```json
// eas.json
{
  "build": {
    "e2e-test": {
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    }
  }
}
```

---

## 3. フロー作成のベストプラクティス

### 3-1. Element selection 優先順位

1. `id`（= React Native の `testID`）← **最優先**
2. `text`（i18n やコピー変更で壊れやすい、最終手段）
3. `accessibilityText`

```yaml
# ✅ 推奨
- tapOn:
    id: "login_submit_button"

# ❌ 避ける（コピー変更で壊れる）
- tapOn: "ログイン"
```

### 3-2. 基本コマンド

| コマンド | 用途 |
|---------|------|
| `launchApp` | アプリ起動（`clearState`, `clearKeychain`, `permissions`, `arguments`） |
| `tapOn` | タップ（`retryTapIfNoChange` でゴーストタップ対策） |
| `inputText` | テキスト入力（フォーカスのある input に） |
| `hideKeyboard` | キーボード閉じる |
| `assertVisible` / `assertNotVisible` | 検証（標準 7 秒自動リトライ） |
| `extendedWaitUntil` | 長い待機（API レスポンス待ちなど） |
| `waitForAnimationToEnd` | アニメ終了待ち |
| `scroll` / `swipe` | スクロール / スワイプ |
| `back` | 戻る |
| `runFlow` | subflow 呼び出し（再利用） |
| `repeat` | ループ |
| `runScript` / `evalScript` | JavaScript 実行（条件分岐、出力変数） |
| `takeScreenshot` | スクショ取得 |
| `startRecording` / `stopRecording` | 動画録画 |
| `setPermissions` | 権限設定 |
| `openLink` | deeplink |

### 3-3. フロー雛形

```yaml
# .maestro/flows/C-010_auth_happy.yaml
tags: [smoke, auth, happy, P0]
appId: ${APP_ID}
onFlowStart:
  - runFlow:
      file: ../subflows/reset_state.yaml
---
- launchApp:
    clearState: true
    clearKeychain: true
    arguments:
      isE2E: true
    permissions:
      all: allow

- assertVisible:
    id: "login_screen"

- tapOn:
    id: "login_email_input"
- inputText: "test@example.com"

- tapOn:
    id: "login_password_input"
- inputText: "test-password-1"
- hideKeyboard

- tapOn:
    id: "login_submit_button"
    retryTapIfNoChange: true

- assertVisible:
    id: "home_screen"
- takeScreenshot: artifacts/C-010_after_login.png
```

### 3-4. subflow による再利用

```yaml
# .maestro/subflows/login.yaml
appId: ${APP_ID}
---
- launchApp: { clearState: true }
- tapOn: { id: "login_email_input" }
- inputText: ${EMAIL}
- tapOn: { id: "login_password_input" }
- inputText: ${PASSWORD}
- hideKeyboard
- tapOn: { id: "login_submit_button" }
- assertVisible: { id: "home_screen" }
```

呼び出し側で env を注入：

```yaml
# .maestro/flows/C-020_create_post.yaml
appId: ${APP_ID}
onFlowStart:
  - runFlow:
      file: ../subflows/login.yaml
      env:
        EMAIL: "buyer@example.com"
        PASSWORD: "test-password-1"
---
- tapOn: { id: "home_create_post_button" }
# ...
```

### 3-5. flake 対策

- `sleep` を使わない。代わりに `assertVisible` の自動待機 or `extendedWaitUntil`。
- アニメーション後は `waitForAnimationToEnd`。
- タップが効きづらい箇所は `retryTapIfNoChange: true`。
- 起動時は必ず `launchApp.clearState: true`（状態汚染防止）。
- アプリ側で E2E 時はアニメを無効化（前述の `IS_E2E` フラグ）。

### 3-6. 権限拒否経路を必ずテスト

```yaml
- launchApp:
    clearState: true
    permissions:
      all: deny
- assertVisible: "通知を有効にしてください"  # 権限なしの画面
```

### 3-7. Deeplink で本質だけ検証

```yaml
- openLink: myapp://product/123
- assertVisible: { id: "product_detail_screen" }
```

### 3-8. dynamic appId（dev / staging / prod 共有）

```yaml
appId: ${APP_ID}
```

実行時に env で切替：

```bash
APP_ID=com.example.app.dev maestro test .maestro/flows
```

---

## 4. 網羅性確保（手動ポチポチ置換）

### 4-1. 9 観点チェックリスト

各画面・各ストーリーに以下を当てる：

| 観点 | モバイル特有の例 |
|------|----------------|
| Happy | 標準フロー成功 |
| Sad / Validation | 空欄、形式不正、すぐ submit |
| Boundary | 最大文字数、最大件数、最小値 |
| Empty state | データ 0 件、初回起動 |
| Error / Network | API 失敗、オフライン、タイムアウト |
| Permission | 通知拒否、位置情報拒否、カメラ拒否 |
| A11y | accessibilityLabel 付与、VoiceOver 操作 |
| OS 差異 | iOS / Android で動作差、画面サイズ差 |
| State | アプリ再起動後、deeplink 直接、バックグラウンド復帰 |

### 4-2. タグ運用

```yaml
tags: [smoke, regression, P0, auth, negative]
```

```bash
# CI 速攻
maestro test .maestro --include-tags=smoke

# nightly
maestro test .maestro --include-tags=regression

# WIP を除外
maestro test .maestro --exclude-tags=wip
```

### 4-3. 失敗証跡

```yaml
- takeScreenshot: artifacts/${STEP_NAME}.png
- startRecording: artifacts/flow.mp4
```

```bash
maestro test .maestro \
  --format html-detailed \
  --output build/report.html \
  --test-output-dir build/maestro-artifacts
```

---

## 5. Claude Code との連携

### 5-1. Maestro MCP 接続

```bash
# Maestro MCP server 起動（公式）
maestro mcp

# Claude Code に登録
claude mcp add maestro -- maestro mcp
```

### 5-2. 提供される MCP ツール

| ツール | 用途 |
|--------|------|
| `list_devices` | 接続中のデバイス一覧 |
| `inspect_screen` | 現在画面の view hierarchy（JSON / CSV） |
| `take_screenshot` | スクショ取得 |
| `run` | YAML フロー実行（インライン or ファイル） |
| `cheat_sheet` | Maestro 構文リファレンス |
| `list_cloud_devices` | Maestro Cloud 実機リスト |
| `run_on_cloud` | クラウド実行 |
| `get_cloud_run_status` | 実行結果取得 |

### 5-3. AI 駆動ワークフロー

1. シミュレータ / エミュレータで対象画面を開く
2. Claude に「この画面のスモークテストを書いて」と依頼
3. Claude が `list_devices` → `inspect_screen` で hierarchy 取得
4. `cheat_sheet` で構文確認 → YAML 生成 → `run` で即実行検証
5. 失敗時は `take_screenshot` + `inspect_screen` を再取得 → Claude が原因解析 → 修正
6. **必ず 1 回は人間が目視確認してから commit**（初回成功率 70〜80% の前提）

### 5-4. Claude が守るべき規約（CLAUDE.md に書く想定）

- Element 指定は `id`（testID）優先、`text` は最終手段
- `sleep` 禁止、`assertVisible` の自動待機を使う
- 各フロー冒頭は `launchApp.clearState: true`
- 失敗修復は推測でなく `inspect_screen` を読んでから
- 1 フロー = 1 ストーリー、10 アサート以下
- フローファイルは `.maestro/flows/<C-XXX>_<slug>.yaml`
- 共通操作は `.maestro/subflows/` に切り出す

---

## 6. 実行コマンド集

```bash
# Studio（フロー作成・実機操作）
maestro studio

# 全実行
maestro test .maestro

# 特定ファイル
maestro test .maestro/flows/C-010_auth_happy.yaml

# タグ指定
maestro test .maestro --include-tags=smoke

# HTML レポート + 動画/スクショ
maestro test .maestro \
  --format html-detailed \
  --output build/report.html \
  --test-output-dir build/maestro-out

# JUnit（CI 連携）
maestro test .maestro --format junit --output build/junit.xml

# CI で flake 対策のリトライ
maestro test .maestro --retry-times=2

# デバイス確認
maestro list-devices
```

---

## 7. CI 連携（EAS Workflows が最短）

```yaml
# .eas/workflows/e2e-test-ios.yml
name: e2e-test-ios
on:
  pull_request:
    branches: ['*']
jobs:
  build_ios:
    type: build
    params: { platform: ios, profile: e2e-test }
  maestro_test:
    needs: [build_ios]
    type: maestro
    params:
      build_id: ${{ needs.build_ios.outputs.build_id }}
      flow_path: ['.maestro/flows']
```

GitHub Actions 自前構築の場合は `mobile-dev-inc/action-maestro-cloud` を使う。

---

## 8. 個人開発 MVP のデフォルト構成（要約）

| 採用 | 見送り |
|------|--------|
| Maestro 単体 | Detox 併用 |
| Dev Client / EAS Build | Expo Go |
| testID（screen_action_target 命名） | text セレクタ |
| `IS_E2E` フラグでアニメ無効化 | 本番ビルドで E2E |
| `subflows/login.yaml` で認証共有 | 毎回 UI ログイン |
| ローカルシミュレータ実行 | Maestro Cloud 課金（初期不要） |
| `--include-tags=smoke` でリリース前手動実行 | フル CI（後で導入） |
| Maestro MCP + Claude で生成 → 1 回人が確認 | MCP 生成を盲信 |

---

## 9. やらないことリスト（MVP 段階）

- Maestro Cloud 課金（無料 + ローカルで十分）
- Detox 併用（学習コスト過大、Maestro で 90% カバー）
- 過剰な subflow 分割（3 回コピペが出てから切り出す）
- 巨大フロー（1 フローに 10+ アサート詰めない）
- text セレクタ多用（i18n / コピー変更で必ず壊れる）

---

## 主要出典

- https://docs.maestro.dev/get-started/quickstart
- https://docs.maestro.dev/get-started/supported-platform/react-native
- https://docs.maestro.dev/maestro-studio/run-tests-with-maestro-studio
- https://docs.maestro.dev/get-started/maestro-mcp
- https://docs.maestro.dev/maestro-flows/flow-control-and-logic/nested-flows
- https://docs.maestro.dev/maestro-flows/flow-control-and-logic/hooks
- https://docs.maestro.dev/maestro-flows/workspace-management/test-discovery-and-tags
- https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts
- https://docs.maestro.dev/advanced/configuring-permissions
- https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- https://docs.maestro.dev/cloud/ci-integration/github-actions
- https://maestro.dev/insights/how-to-avoid-flaky-tests-with-built-in-tolerance
- https://maestro.dev/insights/checklist-for-designing-maintainable-test-flows
- https://maestro.dev/blog/maestro-mcp-an-introduction
- https://verygood.ventures/blog/maestro-mcp-claude-mobile-ui-test-automation/
- https://dev.to/retyui/best-tips-tricks-for-e2e-maestro-with-react-native-2kaa
