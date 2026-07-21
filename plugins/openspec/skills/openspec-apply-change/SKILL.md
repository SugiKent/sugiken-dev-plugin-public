---
name: openspec-apply-change
description: OpenSpec の change の tasks を実装する。ユーザーが実装を始めたい・続けたい・tasks を進めたいときに使う。
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.5.0"
---

OpenSpec の change の tasks を実装する。

**ストアの選択:** ユーザーがストア（このマシンに登録された単体の OpenSpec リポジトリ）を指定した場合、または作業がストア内にある場合は、`openspec store list --json` を実行して登録済みストアの id を調べ、specs や changes を読み書きするコマンド（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`）に `--store <id>` を渡す。他のコマンドはこのフラグを取らない。コマンドが出力するヒントには既にフラグが含まれているので、後続でもそれを維持する。ストアがなければ、コマンドは最も近いローカルの `openspec/` ルートに対して作用する。

**入力**: 任意で change 名を指定できる。省略された場合は、会話のコンテキストから推測できるか確認する。曖昧・不明瞭なら、利用可能な changes を必ず提示して選ばせる。

**手順**

1. **change を選択する**

   名前が与えられていればそれを使う。そうでなければ:
   - ユーザーが change に言及していれば、会話のコンテキストから推測する
   - アクティブな change が 1 つだけなら自動選択する
   - 曖昧なら、`openspec list --json` で利用可能な changes を取得し、**AskUserQuestion ツール**でユーザーに選ばせる

   常に「Using change: <name>」と、上書き方法（例: `/opsx:apply <other>`）を告知する。

2. **スキーマを理解するために status を確認する**
   ```bash
   openspec status --change "<name>" --json
   ```
   JSON をパースして次を理解する:
   - `schemaName`: 使われているワークフロー（例: 「spec-driven」）
   - `planningHome`、`changeRoot`、`actionContext`: planning のスコープと編集の制約
   - どの成果物が tasks を含むか（spec-driven なら通常「tasks」、他は status を確認）

3. **apply の指示を取得する**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   これは次を返す:
   - `contextFiles`: 成果物 ID -> 具体的なファイルパスの配列（スキーマにより変わる - proposal/specs/design/tasks かもしれないし spec/tests/implementation/docs かもしれない）
   - 進捗（total、complete、remaining）
   - 状態付きの task リスト
   - 現在の状態に基づく動的な指示

   **状態の扱い:**
   - `state: "blocked"`（成果物が不足）なら: メッセージを表示し、openspec-continue-change の利用を提案する
   - `state: "all_done"` なら: 祝福し、archive を提案する
   - それ以外: 実装へ進む

4. **コンテキストファイルを読む**

   apply の指示の出力の `contextFiles` に列挙された全ファイルパスを読む。
   ファイルは使われているスキーマに依存する:
   - **spec-driven**: proposal、specs、design、tasks
   - 他のスキーマ: CLI 出力の contextFiles に従う

5. **現在の進捗を表示する**

   次を表示する:
   - 使われているスキーマ
   - 進捗: 「N/M tasks complete」
   - 残りの tasks の概要
   - CLI からの動的な指示

6. **tasks を実装する（完了かブロックまでループ）**

   保留中の各 task について:
   - どの task に取り組んでいるかを表示する
   - 必要なコード変更を行う
   - 変更は最小かつ焦点を絞る
   - tasks ファイルで task を完了にする: `- [ ]` → `- [x]`
   - 次の task へ続ける

   **次の場合は一時停止する:**
   - task が不明瞭 → 明確化を求める
   - 実装で設計上の問題が判明 → 成果物の更新を提案する
   - エラーやブロッカーに遭遇 → 報告して指示を待つ
   - ユーザーが割り込む

7. **完了または一時停止時に status を表示する**

   次を表示する:
   - このセッションで完了した tasks
   - 全体の進捗: 「N/M tasks complete」
   - 全完了なら: archive を提案する
   - 一時停止なら: 理由を説明して指示を待つ

**実装中の出力**

```
## Implementing: <change-name> (schema: <schema-name>)

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**完了時の出力**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

All tasks complete! Ready to archive this change.
```

**一時停止時の出力（問題に遭遇）**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**ガードレール**
- 完了かブロックまで tasks を進め続ける
- 開始前に必ずコンテキストファイルを読む（apply の指示の出力から）
- task が曖昧なら、実装せず一時停止して尋ねる
- 実装で問題が判明したら、一時停止して成果物の更新を提案する
- コード変更は最小に、各 task のスコープに絞る
- 各 task を完了したら直ちに task のチェックボックスを更新する
- エラー・ブロッカー・不明瞭な要件では一時停止する - 推測しない
- CLI 出力の contextFiles を使い、特定のファイル名を仮定しない

**流動的なワークフローとの統合**

このスキルは「change に対するアクション」モデルを支える:

- **いつでも呼び出せる**: 全成果物が完了する前（tasks が存在すれば）、部分的な実装の後、他のアクションと交互に
- **成果物の更新を許容する**: 実装で設計上の問題が判明したら、成果物の更新を提案する - フェーズに固定されず、流動的に作業する

---

## SubAgent による整合性レビュー

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

spec ごとに実装が完了したら SubAgent にコードレビューをさせ実装したコードを更にブラッシュアップする。
複数の changes spec を作業対象に指示された場合も spec ごとに SubAgent を起動してコードレビューと修正を行う。
コードレビューを行う際は `35-architect-code-review` スキルを参照し、正確性・可読性・アーキテクチャ・セキュリティ・パフォーマンス等の多軸でレビューすること。アーキテクチャ／設計構造の是非（変更容易性・SOLID・KISS/YAGNI・DRY・過剰設計の見極め）を深く問う際は `35-architect-principle` スキルの判断基準を参照すること。

## セキュリティハードニング

ユーザー入力・認証・認可・データ保存・外部連携を扱うコードを実装する際は、`35-architect-security` スキルを参照し、脆弱性に対するハードニングを行うこと。

## tasks への執着について

tasks.md は、ユニットテストなど実際のアプリケーションの動作以外の要素も含めて一度の apply の指示ですべて完了させることを強い言葉で明記する。
人間が作業が必要なタスクのみを残して良い。

## db 操作について

開発環境用の db migration などは、その ORM などのライブラリの正当な手段を用いて一度の apply の指示で実行まで行うこと。
