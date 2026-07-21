# パフォーマンスチェックリスト

Web アプリケーションのパフォーマンスのためのクイックリファレンス。`35-architect-code-review` スキルのパフォーマンス軸とあわせて使用する。

## 目次

- [Core Web Vitals の目標値](#core-web-vitals-の目標値)
- [TTFB の診断](#ttfb-の診断)
- [フロントエンドチェックリスト](#フロントエンドチェックリスト)
- [バックエンドチェックリスト](#バックエンドチェックリスト)
- [計測コマンド](#計測コマンド)
- [よくあるアンチパターン](#よくあるアンチパターン)

## Core Web Vitals の目標値

| 指標 | Good | 要改善 | Poor |
|------|------|--------|------|
| LCP (Largest Contentful Paint) | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| INP (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |

## TTFB の診断

TTFB が遅い（> 800ms）とき、DevTools の Network ウォーターフォールで各コンポーネントをチェックする:

- [ ] **DNS 解決**が遅い → 既知のオリジンに `<link rel="dns-prefetch">` または `<link rel="preconnect">` を追加する
- [ ] **TCP/TLS ハンドシェイク**が遅い → HTTP/2 を有効化し、エッジデプロイを検討し、keep-alive を確認する
- [ ] **サーバ処理**が遅い → バックエンドをプロファイルし、遅いクエリをチェックし、キャッシュを追加する

## フロントエンドチェックリスト

### 画像
- [ ] モダンな形式（WebP・AVIF）を使う
- [ ] レスポンシブにサイズ指定されている（`srcset` と `sizes`）
- [ ] 画像と `<source>` 要素に明示的な `width` と `height` がある（アートディレクションでの CLS を防ぐ）
- [ ] ファーストビュー外の画像は `loading="lazy"` と `decoding="async"` を使う
- [ ] ヒーロー / LCP 画像は `fetchpriority="high"` を使い、遅延ロードしない

### JavaScript
- [ ] バンドルサイズは gzip 後 200KB 未満（初期ロード）
- [ ] ルートや重い機能に対し、動的 `import()` でコード分割している
- [ ] Tree shaking が有効（依存が ESM を提供し `sideEffects: false` を宣言しているか確認）
- [ ] `<head>` にブロッキングな JavaScript がない（`defer` または `async` を使う）
- [ ] 重い計算は Web Worker にオフロードされている（該当する場合）
- [ ] 同じ props で再レンダリングする高コストなコンポーネントに `React.memo()`
- [ ] `useMemo()` / `useCallback()` は、プロファイリングで効果が示された箇所のみ
- [ ] 長いタスク（> 50ms）を分割し、メインスレッドを空けておく — INP の主要なレバー
- [ ] 長時間ループ内で `yieldToMain` パターンを使い、チャンク間で入力イベントを実行できるようにする
- [ ] 利用可能ならモダンなスケジューリング API を使う: `scheduler.yield()`（推奨）・優先度付き `scheduler.postTask()`・必要なときだけ譲るための `isInputPending()`
- [ ] 遅延可能で緊急でない処理（analytics の flush・プリフェッチ・ウォームアップ）に `requestIdleCallback`
- [ ] 緊急でない処理（analytics・ロギングなど）をイベントハンドラの外に遅延させ、インタラクションへの応答を遅らせない
- [ ] サードパーティスクリプトは `async` / `defer` でロードし、サイズを監査し、重いもの（チャットウィジェット・埋め込み）はファサードで前面を覆う

### CSS
- [ ] クリティカル CSS はインライン化またはプリロードされている
- [ ] 非クリティカルなスタイルにレンダリングをブロックする CSS がない
- [ ] 本番で CSS-in-JS のランタイムコストがない（抽出を使う）

### フォント
- [ ] フォントファミリーは 2〜3、各ウェイトも 2〜3 に限定（ウェイトを追加するごとにリクエストが増える）
- [ ] WOFF2 形式のみ（最小・普遍的サポート — WOFF/TTF/EOT は省く）
- [ ] 可能なら自前ホスト（サードパーティのフォント CDN は DNS + TCP + TLS の往復を増やす）
- [ ] LCP に重要なフォントはプリロード: `<link rel="preload" as="font" type="font/woff2" crossorigin>`
- [ ] `font-display: swap`（非クリティカルなら `optional`）でレンダリングをブロックする FOIT を回避
- [ ] `unicode-range` でサブセット化し、各ページが必要とするグリフのみを配信
- [ ] 複数のウェイト / スタイルが必要なら可変フォントを検討（1 ファイルで多くを置き換え）
- [ ] フォント切り替え時の CLS を減らすため、`size-adjust`・`ascent-override`・`descent-override` でフォールバックフォントのメトリクスを調整
- [ ] カスタムフォントの前にシステムフォントスタックを検討

### ネットワーク
- [ ] 静的アセットは長い `max-age` + コンテンツハッシュでキャッシュ
- [ ] 適切な箇所で API レスポンスをキャッシュ（`Cache-Control`）
- [ ] HTTP/2 または HTTP/3 が有効
- [ ] 既知のオリジンにリソースをプリコネクト（`<link rel="preconnect">`）
- [ ] 画像以外のクリティカルなリソース（重要な `<link rel="preload">`・ファーストビューの `<script>` など）にも `fetchpriority` を使う — `<img>` だけではない
- [ ] 不要なリダイレクトがない

### レンダリング
- [ ] レイアウトスラッシング（強制同期レイアウト）がない
- [ ] アニメーションは `transform` と `opacity` を使う（GPU アクセラレーション）
- [ ] 長いリストは仮想化を使う（`react-window` など）
- [ ] 不要なページ全体の再レンダリングがない
- [ ] 画面外のセクションは `content-visibility: auto` と `contain-intrinsic-size` を使い、非表示領域のレイアウト / ペイントをスキップ
- [ ] HTML レスポンスに `unload` イベントハンドラと `Cache-Control: no-store` がない — back/forward キャッシュ（bfcache）の対象資格を保つ

## バックエンドチェックリスト

### データベース
- [ ] N+1 クエリのパターンがない（eager loading / join を使う）
- [ ] クエリに適切なインデックスがある
- [ ] リストエンドポイントはページネーションされている（`SELECT * FROM table` は使わない）
- [ ] コネクションプーリングが設定されている
- [ ] 遅いクエリのロギングが有効

### API
- [ ] レスポンスタイムが 200ms 未満（p95）
- [ ] リクエストハンドラ内に同期的な重い計算がない
- [ ] 個別呼び出しのループではなく一括操作を使う
- [ ] レスポンス圧縮（gzip/brotli）
- [ ] 適切なキャッシュ（インメモリ・Redis・CDN）

### インフラ
- [ ] 静的アセットに CDN
- [ ] サーバがユーザーの近くにある（またはエッジデプロイ）
- [ ] 水平スケーリングが設定されている（必要な場合）
- [ ] ロードバランサ用のヘルスチェックエンドポイント

## 計測コマンド

### INP のフィールドデータと DevTools ワークフロー

1. **まずフィールドデータ** — 最適化の前に [CrUX Vis](https://developer.chrome.com/docs/crux/vis) や RUM ツールで実ユーザーの INP を確認する
2. **遅いインタラクションを特定** — DevTools → Performance パネルを開き、操作しながら記録; クリック / キー入力が引き起こす長いタスクを探す
3. **ミドルレンジの Android でテスト** — INP の問題は遅いハードウェアでのみ表面化することが多い; 実機または DevTools の CPU スロットリング（4〜6 倍の減速）を使う

```bash
# Lighthouse CLI
npx lighthouse https://localhost:3000 --output json --output-path ./report.json

# バンドル解析
npx webpack-bundle-analyzer stats.json
# または Vite の場合:
npx vite-bundle-visualizer

# バンドルサイズのチェック
npx bundlesize

# コード内の Web Vitals
import { onLCP, onINP, onCLS } from 'web-vitals';
onLCP(console.log);
onINP(console.log);
onCLS(console.log);

# インタラクションレベルの詳細を含む INP（attribution ビルド）
import { onINP } from 'web-vitals/attribution';
onINP(({ value, attribution }) => {
  const { interactionTarget, inputDelay, processingDuration, presentationDelay } = attribution;
  console.log({ value, interactionTarget, inputDelay, processingDuration, presentationDelay });
});
```

## よくあるアンチパターン

| アンチパターン | 影響 | 修正 |
|---|---|---|
| N+1 クエリ | DB 負荷の線形増加 | join・include・バッチローディングを使う |
| 上限のないクエリ | メモリ枯渇・タイムアウト | 必ずページネーション、LIMIT を追加 |
| インデックス欠如 | データ増加に伴う読み取り遅延 | フィルタ / ソートする列にインデックスを追加 |
| レイアウトスラッシング | カクつき・フレーム落ち | DOM の読み取りをまとめ、その後に書き込みをまとめる |
| 最適化されていない画像 | LCP 遅延・帯域の浪費 | WebP・レスポンシブサイズ・遅延ロードを使う |
| 大きなバンドル | Time to Interactive の遅延 | コード分割・tree shaking・依存の監査 |
| メインスレッドのブロッキング | 低い INP・反応しない UI | `scheduler.yield()` / `yieldToMain` で長いタスクを分割、Web Worker にオフロード |
| メモリリーク | メモリ増加・最終的にクラッシュ | リスナー・interval・ref をクリーンアップ |
