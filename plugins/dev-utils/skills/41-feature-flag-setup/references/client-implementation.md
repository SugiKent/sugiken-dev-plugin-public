# クライアント実装テンプレ

React SPA 前提。

## 1. lib/featureFlags.ts — window 参照 + フォールバック（決定4 / 決定1）

```ts
// apps/client/src/lib/featureFlags.ts

declare global {
  interface Window {
    __FEATURE_FLAGS__?: Record<string, string>;
  }
}

function rawFlag(name: string): string | undefined {
  // bootstrap スクリプトが未到達 / 失敗でも undefined で安全に倒れる
  return typeof window !== "undefined" ? window.__FEATURE_FLAGS__?.[name] : undefined;
}

/** boolean フラグ。未定義・未知値は安全側（既定値）。 */
function boolFlag(name: string, fallback: boolean): boolean {
  const raw = rawFlag(name);
  if (raw === undefined) return fallback;
  return raw === "true";
}

// 移行した既存ハードコードフラグを、ここから読む形に置き換える。
// 既定値は旧ハードコード値（安全側）をそのまま使う。
export const REAL_CALL_FEATURE_ENABLED = boolFlag("REAL_CALL_FEATURE_ENABLED", false);
```

- 既定値は **旧ハードコード値（安全側）** にする。 サーバ側ルートを外しても挙動が旧来に戻るだけで壊れない（ロールバック耐性）。
- `window` 参照は同期。 bootstrap スクリプトが先に走っているのでトップレベル評価で確定する。

## 2. index.html — render-blocking で先頭読み込み（決定4）

`<head>` 内、 **React バンドル（`<script type="module" src="/src/main.tsx">` 等）より前**に置く:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <!-- Feature Flag bootstrap: React より前に同期実行（ブリンク防止） -->
    <script src="/api/feature-flags.js"></script>
    <!-- 以降に React バンドル -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- `async` / `defer` を付けない（同期 render-blocking で確定させたい）。
- HTML は静的配信のまま。 `/api/feature-flags.js` だけサーバ経路を通る → CDN 無改修（決定4）。

## 3. admin 管理画面（決定5）

admin role でのみ到達できるページ。 一覧表示 + 値編集。

```tsx
// apps/client/src/pages/admin/FeatureFlags.tsx
export function FeatureFlagsAdminPage() {
  const { data: flags } = useQuery(orpc.featureFlag.list.queryOptions());
  const update = useMutation(orpc.featureFlag.set.mutationOptions());

  return (
    <table>
      <tbody>
        {flags?.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{f.description}</td>
            <td>
              <input
                defaultValue={f.value}
                onBlur={(e) => update.mutate({ name: f.name, value: e.target.value })}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- ルート登録 + admin にのみ導線（メニュー項目）を表示する。 既存の role ガード（`RequireRole` 等）でページ自体も保護する。
- 編集 UI は最小で良い（boolean なら true/false のトグル / select でも可）。 値はテキストとして送る（決定1）。

> 注意: 本番では admin が値を変えても各 Lambda インスタンスの反映は TTL（約60s）の結果整合（決定3）。 管理画面に「反映まで最大 1 分」程度の注記を出すと親切。
