# apply Skill の書き換え（毎回適用）

OpenSpec が更新されて再 install した場合、以下の書き換えは **その都度再適用** する必要がある（source 側に反映されていないため、上書きで消える）。

changes を作成するごとに、その中の各種ファイルの間で矛盾や齟齬、情報の欠落が発生していないか、SubAgent にレビューさせる。

## 作業順序

複数の spec の実装指示がされた場合は、依存関係に注意をして可能な限り SubAgent を用いて並列で効率的に作業をする。

## Codex / Codex Fugu の活用

実装系の SubAgent を起動する際、**Codex（Codex MCP）または Codex Fugu が利用可能な場合はそれらを使う**。Codex は実装のアクセラレータであり、第一選択は Codex MCP（`mcp__codex__codex` / `mcp__codex__codex-reply`）、第二選択は Codex CLI の `fugu` profile。

```bash
# 非対話実行（fugu profile = 別系統の高性能モデル）
codex exec -p fugu -C . "アプリコード実装の依頼をここに書く"

# 長い依頼 / 結果をファイルで回収する場合
mkdir -p tmp/codex-results
cat <<'PROMPT' | codex exec -p fugu -C . -o tmp/codex-results/<CHANGE_ID>-codex.md -
<実装依頼。Playwright・実行系は依頼しない>
PROMPT
```

Codex は **実行系（E2E・ブラウザ操作）を担当できない**。実行系・検証系はこれまで通り通常の SubAgent が担う。Codex を使ったかどうか（MCP / fugu / 不使用）は報告に明記する。

## コードレビュー

spec ごとに実装が完了したら SubAgent にコードレビューをさせ実装したコードを更にブラッシュアップする.
複数の changes spec を作業対象に指示された場合も spec ごとに SubAgent を起動してコードレビューと修正を行ってください.
コードレビューを行う際は `35-architect-code-review` スキルを参照し、正確性・可読性・アーキテクチャ・セキュリティ・パフォーマンス等の多軸でレビューすること. アーキテクチャ／設計構造の是非（変更容易性・SOLID・KISS/YAGNI・DRY・過剰設計の見極め）を深く問う際は `35-architect-principle` スキルの判断基準を参照すること.

## セキュリティハードニング

ユーザー入力・認証・認可・データ保存・外部連携を扱うコードを実装する際は、`35-architect-security` スキルを参照し、脆弱性に対するハードニングを行うこと.

## tasks への執着について

tasks.md は、ユニットテストなど実際のアプリケーションの動作以外の要素も含めて一度の apply の指示ですべて完了させることを強い言葉で明記する
人間が作業が必要なタスクのみを残して良い

## db 操作について

開発環境用の db migration などは、その ORM などのライブラリの正当な手段を用いて一度の apply の指示で実行まで行うこと
