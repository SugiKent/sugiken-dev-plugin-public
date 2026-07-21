# Web E2E リファレンス（Playwright）

Web 版 E2E は **Playwright** (`@playwright/test`) を使う。本ドキュメントは個人開発の MVP 段階で「人間ポチポチを完全代替」できる E2E を構築するためのデフォルト構成・ベストプラクティス・Claude Code 連携をまとめたもの。

---

## 1. セットアップ

### 1-1. インストール

```bash
pnpm add -D @playwright/test
npx playwright install              # ブラウザバイナリ取得
npx playwright install --with-deps  # CI 環境（Linux）
```

### 1-2. ディレクトリ構成（推奨）

```
e2e/
  cases/                       # テストケース md（このスキルの成果物）
    2026-05-17-1430_cases.md
  tests/                       # 実テストファイル（ケース ID 単位）
    auth/
      C-001_signup_happy.spec.ts
      C-002_signup_validation.spec.ts
    post/
      C-010_create_post.spec.ts
  pages/                       # Page Object Model
    SignupPage.ts
    HomePage.ts
  fixtures.ts                  # test 拡張（POM 注入、API client）
  auth.setup.ts                # storageState 生成
  visual/                      # toHaveScreenshot 専用
playwright/.auth/              # storageState（必ず .gitignore）
playwright.config.ts
```

### 1-3. playwright.config.ts（最小推奨）

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: { timeout: 10_000 },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
    // MVP 初期は chromium のみ。リリース前に firefox / webkit を追加
    // {
    //   name: 'mobile',
    //   use: { ...devices['iPhone 14'], storageState: 'playwright/.auth/user.json' },
    //   dependencies: ['setup'],
    // },
  ],
});
```

### 1-4. .gitignore に必須追加

```
playwright/.auth/
test-results/
playwright-report/
blob-report/
```

---

## 2. ベストプラクティス

### 2-1. Locator 優先順位

ユーザー視点の semantic locator を最優先する。下に行くほど fallback。

1. `page.getByRole('button', { name: '送信' })` ← **第一選択**
2. `page.getByLabel('メールアドレス')`（フォーム要素）
3. `page.getByPlaceholder('you@example.com')`（label がない時）
4. `page.getByText('ようこそ')`（本文）
5. `page.getByAltText('ロゴ')` / `page.getByTitle('...')`
6. `page.getByTestId('signup-submit')` ← 最終手段（`data-testid` を明示付与）

**禁止**: CSS / XPath の長いチェーン、`first()` / `last()` / `nth()` の濫用。

複数候補を絞る時は `filter` で chain：

```ts
page.getByRole('listitem')
  .filter({ hasText: 'Product 2' })
  .getByRole('button', { name: 'Add to cart' });
```

### 2-2. Web-first assertion（必須）

```ts
// ✅ 推奨（auto-retry）
await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

// ❌ 禁止（同期比較・flaky 原因）
expect(await page.getByRole('heading').isVisible()).toBe(true);
```

auto-retry 対象 matcher: `toBeVisible / toHaveText / toContainText / toHaveURL / toHaveCount / toHaveScreenshot / toBeEnabled / toBeChecked / toHaveAttribute` 等。

### 2-3. 待機戦略

- `page.waitForTimeout(N)` は **完全禁止**（flaky の最大要因）。
- 動作の前後で「何を待つか」を明示する：
  - クリック後に表示される要素を `expect(...).toBeVisible()`
  - API レスポンス待ちは Promise-first パターン：

```ts
const responsePromise = page.waitForResponse(/\/api\/users/);
await page.getByRole('button', { name: '保存' }).click();
await responsePromise;
```

### 2-4. テスト独立性

各テストは独立した `BrowserContext` で動く。`beforeEach` で初期状態を作り、テスト間でデータを共有しない。作ったテストデータは `try/finally` または fixture teardown で必ずクリーンアップ。

### 2-5. 認証は storageState で使い回す

ログイン UI を毎回叩くと flaky・遅い。**API ログイン → storageState 保存** が定石。

```ts
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test';
import fs from 'node:fs';

const USER_FILE = 'playwright/.auth/user.json';

setup('authenticate as user', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  if (!res.ok()) throw new Error('login failed');
  await request.storageState({ path: USER_FILE });
});
```

複数ロールが必要なら `admin.json` / `member.json` を別 setup で作り、テスト側で `test.use({ storageState: 'playwright/.auth/admin.json' })`。

### 2-6. Page Object Model（軽量）

flat tests は demo 用。MVP でも最低限の POM を入れる：

```ts
// e2e/pages/SignupPage.ts
import { Page, expect } from '@playwright/test';

export class SignupPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/signup');
    await expect(this.page.getByRole('heading', { name: 'サインアップ' })).toBeVisible();
  }

  async fillForm({ email, password }: { email: string; password: string }) {
    await this.page.getByLabel('メールアドレス').fill(email);
    await this.page.getByLabel('パスワード').fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: '登録する' }).click();
  }
}
```

```ts
// e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { SignupPage } from './pages/SignupPage';

export const test = base.extend<{ signupPage: SignupPage }>({
  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },
});
export { expect } from '@playwright/test';
```

```ts
// e2e/tests/auth/C-001_signup_happy.spec.ts
import { test, expect } from '../../fixtures';

test.use({ storageState: { cookies: [], origins: [] } }); // 未ログインで開始

test('C-001 サインアップハッピーパス', async ({ page, signupPage }) => {
  await signupPage.goto();
  await signupPage.fillForm({ email: 't@example.com', password: 'strong-pass-1' });
  await signupPage.submit();
  await expect(page.getByRole('heading', { name: 'ようこそ' })).toBeVisible();
});
```

### 2-7. 外部依存はモックする

OAuth、メール、決済、third-party API は `page.route()` で intercept。本物に当てると flaky + コスト + TOS 違反。

```ts
await page.route('**/api/external/**', (route) => {
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
});
```

### 2-8. アクセシビリティを E2E に同居

`@axe-core/playwright` を主要画面で相乗りさせる：

```ts
import AxeBuilder from '@axe-core/playwright';

test('C-006 ホームの a11y', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

### 2-9. Visual Regression

組み込みの `toHaveScreenshot()` をログイン後の主要 3 画面のみに当てるのが MVP の現実解：

```ts
await expect(page).toHaveScreenshot('home.png', { maxDiffPixels: 100 });
```

スケールしたら Argos / Chromatic に移行。

---

## 3. 網羅性確保のチェックリスト

ケース洗い出し時に **必ず** これを通す：

| 観点 | 例 |
|------|-----|
| Happy | 通常フロー成功 |
| Validation | 必須空、形式不正、最大長超過 |
| Boundary | 0 件、1 件、N 件最大、文字数境界 |
| Empty state | データなし画面、初回画面 |
| Error | 4xx / 5xx をモック、ネットワーク失敗、タイムアウト |
| Auth boundary | 未認証で保護画面、別ロールで保護画面 |
| A11y | キーボード操作、axe 違反 0、role / label 正しい |
| Responsive | iPhone 14、iPad、desktop 1280px |
| State | リロード、deeplink、戻る/進む、storageState 失効 |

---

## 4. Claude Code との連携

### 4-1. Playwright MCP

```bash
# プロジェクト共有スコープで登録（推奨）
claude mcp add --scope project playwright npx @playwright/mcp@latest
```

MCP は accessibility tree YAML を context として返すので、locator の生成精度が高く、CSS / class 変更にも追従しやすい。

**注意**: バージョンは `@latest` でなく `@<固定>` 推奨（挙動の安定）。

### 4-2. テスト生成の使い分け

- **構造生成**: `npx playwright codegen <url>` でブラウザ操作を spec 化 → Claude にリファクタ依頼（POM 化、`getByRole` 統一、assertion 追加）
- **探索 / 自己 QA**: Playwright MCP で「画面を見て試す」フェーズに使う
- **テスト生成のコスト**: MCP より CLI codegen の方が 3〜4 倍トークン安い

### 4-3. Playwright Test Agents（任意）

`npx playwright init-agents --loop=claude` で 3 つの subagent（Planner / Generator / Healer）を `.claude/agents/` に生成できる。本スキルの workflow と相性が良いので、ケース実装が大規模なら導入候補。

### 4-4. 失敗 → 修正のループ

1. テスト失敗 → `test-results/<name>/trace.zip` が残る
2. `npx playwright show-trace test-results/<name>/trace.zip` で trace viewer 起動
3. Claude には trace のスクショと error-context、対象 spec、対象 POM を context として渡す
4. **テスト側の locator / wait 不足** か **実装側のバグ** かを Claude に判定させる
5. 修正案は diff で提示させ、人間が承認してから apply（盲目的 apply は禁止）

### 4-5. Claude が守るべき規約（CLAUDE.md に書く想定）

- Locator は `getByRole` / `getByLabel` / `getByTestId` のみ
- assertion は `await expect(locator).toX()` 形式のみ
- `waitForTimeout` 禁止
- storageState 認証、UI ログイン繰り返し禁止
- 自動 fix 禁止、diff を提示してから apply
- テストは `e2e/tests/<domain>/<C-XXX>_<slug>.spec.ts` に配置

---

## 5. Flaky 対策 10 則

1. `waitForTimeout` 禁止 → web-first assertion で待つ
2. Promise-first パターン（先に `waitForResponse` を握ってから操作）
3. user-facing locator のみ使う
4. ElementHandle 禁止、Locator のみ
5. 外部依存はモック、`serviceWorkers: 'block'`
6. アニメ無効化（`reducedMotion: 'reduce'`）
7. `page.clock.install()` で時刻固定
8. cookie バナーは `page.addLocatorHandler()` で自動消化
9. CI で `retries: 2` 上限、3 以上にしない
10. `forbidOnly: true` を CI で

---

## 6. 実行コマンド集

```bash
# 全実行
npx playwright test

# 特定ファイル
npx playwright test e2e/tests/auth/C-001_signup_happy.spec.ts

# ヘッド付きデバッグ
npx playwright test --headed --debug

# 失敗のみ再実行
npx playwright test --last-failed

# UI モード（対話的）
npx playwright test --ui

# trace viewer
npx playwright show-trace test-results/<name>/trace.zip

# HTML レポート
npx playwright show-report

# codegen
npx playwright codegen http://localhost:3000 --output e2e/tests/_raw.spec.ts
```

---

## 7. 個人開発 MVP のデフォルト構成（要約）

| 採用 | 見送り |
|------|--------|
| 軽量 POM（`pages/` 数本）+ fixtures | Screenplay Pattern |
| API ログイン + storageState | UI ログイン毎回 |
| `@axe-core/playwright` を主要画面に相乗り | 専用 a11y スイート |
| `toHaveScreenshot()` を主要 3 画面のみ | Argos / Chromatic |
| `page.route()` で外部 API モック | 本物の third-party 接続 |
| chromium 単体で開始（高速） | 多ブラウザ matrix |
| Playwright MCP（探索）+ codegen（雛形） | MCP で全テスト生成 |

これだけで「主要 3〜5 フローを E2E + a11y + 主要画面 VRT」がカバーでき、Claude Code が自走できる土台になる。

---

## 主要出典

- https://playwright.dev/docs/best-practices
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/pom
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/test-fixtures
- https://playwright.dev/docs/test-assertions
- https://playwright.dev/docs/test-snapshots
- https://playwright.dev/docs/trace-viewer
- https://playwright.dev/docs/ci
- https://playwright.dev/docs/accessibility-testing
- https://playwright.dev/docs/test-agents
- https://github.com/microsoft/playwright-mcp
- https://testdino.com/blog/claude-code-with-playwright
- https://alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright/
