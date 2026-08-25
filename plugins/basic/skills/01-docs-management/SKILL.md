---
name: 01-docs-management
description: プロジェクトの `docs/` を、ドメイン知識・手順・品質基準・障害記録・エージェント記憶・MVP の永続的な知識として管理するスキル。文書を読む・参照する必要がある作業、または文書を新規作成・更新・整理・移動する必要がある作業では必ず使用する。実装、調査、障害対応、テスト、レトロ、MVP の判断で docs を扱うときにも使用する。
---

# Docs management

`docs/` は一時的なメモ置き場ではなく、プロダクトと開発を継続して理解するための正本である。作業の前に関係する文書を読み、作業で得た再利用可能な知識は適切な場所へ残す。既存の文書を見失わせないことを優先する。

## 固定ディレクトリ構成

```text
docs/
├── domain/        # 領域ごとのフォルダに、業務ルールやドメイン知識を置く
├── playbooks/     # 実装・調査・障害対応の手順
├── quality/       # UI・テスト・セキュリティの基準
├── postmortems/   # 障害と再発防止
├── agent-memory/  # AI エージェントが直接読む短い実行知識
└── mvp/           # MVP の構想、決定、実装順序、検証計画
```

`docs/` 直下に文書ファイルを置かない。新しいカテゴリが必要に見えても、まずこの6分類の配下に収める。分類に迷う場合は、内容を次の基準で選ぶ。

`docs/domain/` はファイルを直接置かない。必ず業務領域ごとのフォルダを作り、その中に文書を置く。領域をまたぐ文書は、最も責務を持つ領域に置き、相互にリンクする。これはドメイン知識が増えても一覧性と所有範囲を失わないためである。

| 内容 | 保存先 |
|---|---|
| 用語、状態遷移、業務ルール、データの意味 | `docs/domain/<領域>/` |
| 作業を再現する手順、調査・復旧方法 | `docs/playbooks/` |
| UI 方針、E2E ケース・結果、テスト／セキュリティ基準 | `docs/quality/` |
| 実際の障害、影響、原因、再発防止 | `docs/postmortems/` |
| 次回のエージェントがすぐ実行する短い注意点 | `docs/agent-memory/` |
| MVP 定義、意思決定、実装タスク、検証計画 | `docs/mvp/` |

## 運用

1. 作業開始時に、目的に関係する `docs/<分類>/` を読む。特に MVP 実装中も `docs/mvp/` を継続して参照する。
2. 文書を作る前に保存先を決め、必要なディレクトリを作成する。ドメイン文書なら先に領域フォルダを決める。ファイル名は内容が分かる kebab-case にする。
3. 実装結果・手順変更・障害対応で正本が変わったら、同じ作業内で文書も更新する。実装完了を理由に `docs/mvp/` を参照対象から外さない。
4. 一時的な作業ログやコードの詳細を `agent-memory` に蓄積しない。そこには次回の実行判断に必要な、短く検証可能な知識だけを書く。
5. 旧来の `docs/MVP.md`、`docs/MVP_IMPL_TASKS.md`、`docs/e2e_case.md`、`docs/howToDevelopment/`、`e2e/cases/` を新規の正本として使わない。既存資産の移行が必要なら、内容を対応する分類へ移して参照元も更新する。

## 時系列・鮮度の扱い

知識の有効時点が重要なものは、作成時刻をパスへ含める。複数文書が同じ出来事・調査・実行に属する場合は `<timestamp>-<slug>/` のフォルダを作り、その配下にまとめる。単一文書なら `<timestamp>-<slug>.md` とする。タイムスタンプは常に `YYYY-MM-DD-HHmm` を使う。

- **必ずタイムスタンプを含める**: `docs/postmortems/`、`docs/agent-memory/` の時点依存メモ、`docs/quality/e2e/cases/` のケース・実行結果。
- **継続更新する正本**: MVP 定義、ドメインルール、品質基準、playbook はファイル名を安定させてよい。その代わり、鮮度が判断に影響する文書には冒頭の `最終更新: YYYY-MM-DD-HHmm` と末尾の変更履歴（日時・変更内容・理由）を残す。
- **判断記録**: `docs/mvp/decisions.md` は各決定に `YYYY-MM-DD-HHmm` の決定日時を付ける。古い決定を上書きで消さず、変更日時と変更理由を追記する。

現在の状態だけが必要な短い注意点を `agent-memory` に置く場合も、作成日時を必ず付け、古くなったら更新・置換・削除を判断できるようにする。

## 必須パス

- ドメイン文書: `docs/domain/<area>/<document>.md`（例: `docs/domain/billing/refund-policy.md`）
- 障害記録: `docs/postmortems/2026-08-25-1430-payment-timeout.md`
- エージェント向け時点依存メモ: `docs/agent-memory/2026-08-25-1430-deploy-caveat.md`
- MVP 定義: `docs/mvp/mvp.md`
- MVP 実装タスク: `docs/mvp/implementation-tasks.md`
- MVP の技術的意思決定: `docs/mvp/decisions.md`
- MVP 検証計画: `docs/mvp/validation-plan.md`
- E2E ケース: `docs/quality/e2e/cases/<timestamp>-cases.md`
- 全 change 横断の E2E 台帳: `docs/quality/e2e/all-changes-cases.md`
