---
name: openspec-archive-change
description: 実験的ワークフローで完了した change を archive する。実装が完了した後に change を確定・archive したいときに使う。
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.5.0"
---

実験的ワークフローで完了した change を archive する。

**ストアの選択:** ユーザーがストア（このマシンに登録された単体の OpenSpec リポジトリ）を指定した場合、または作業がストア内にある場合は、`openspec store list --json` を実行して登録済みストアの id を調べ、specs や changes を読み書きするコマンド（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`）に `--store <id>` を渡す。他のコマンドはこのフラグを取らない。コマンドが出力するヒントには既にフラグが含まれているので、後続でもそれを維持する。ストアがなければ、コマンドは最も近いローカルの `openspec/` ルートに対して作用する。

**入力**: 任意で change 名を指定できる。省略された場合は、会話のコンテキストから推測できるか確認する。曖昧・不明瞭なら、利用可能な changes を必ず提示して選ばせる。

**手順**

1. **change 名が与えられていなければ、選択を促す**

   `openspec list --json` で利用可能な changes を取得する。**AskUserQuestion ツール**でユーザーに選ばせる。

   アクティブな changes のみ表示する（既に archive 済みのものは除く）。
   利用可能なら各 change のスキーマも含める。

   **重要**: change を推測・自動選択しない。必ずユーザーに選ばせる。

2. **成果物の完了状態を確認する**

   `openspec status --change "<name>" --json` を実行して成果物の完了を確認する。

   JSON をパースして次を理解する:
   - `schemaName`: 使われているワークフロー
   - `planningHome`、`changeRoot`、`artifactPaths`、`actionContext`: パスとスコープのコンテキスト
   - `artifacts`: 成果物とその状態（`done` かそれ以外）のリスト

   **`done` でない成果物がある場合:**
   - 未完了の成果物を列挙した警告を表示する
   - **AskUserQuestion ツール**で続行の意思を確認する
   - ユーザーが確認したら続行する

3. **task の完了状態を確認する**

   tasks ファイル（通常 `tasks.md`）を読み、未完了の task を確認する。

   `- [ ]`（未完了）と `- [x]`（完了）の task を数える。

   **未完了の task が見つかった場合:**
   - 未完了 task の件数を示す警告を表示する
   - **AskUserQuestion ツール**で続行の意思を確認する
   - ユーザーが確認したら続行する

   **tasks ファイルが存在しない場合:** task 関連の警告なしで続行する。

4. **デルタ仕様の同期状態を評価する**

   status JSON の `artifactPaths.specs.existingOutputPaths` を使ってデルタ仕様を確認する。存在しなければ、同期の確認なしで続行する。

   **デルタ仕様が存在する場合:**
   - 各デルタ仕様を、対応するメイン仕様 `openspec/specs/<capability>/spec.md` と比較する
   - 適用される変更（追加・変更・削除・リネーム）を判定する
   - 同期前のログとして、まとめた要約を表示する

   **同期方針（このプロジェクトのカスタマイズ）:**
   - **デルタ仕様が存在する場合は、確認を挟まず固定で今すぐ同期する。** `AskUserQuestion` による同期可否の確認は行わない。
   - 同期は Task ツール（subagent_type: "general-purpose"、prompt: 「Skill ツールで change '<name>' に対し openspec-sync-specs を起動する。デルタ仕様の分析: <分析したデルタ仕様の要約を含める>」）で `openspec-sync-specs` を起動して行い、同期後にアーカイブへ進む。
   - デルタ仕様が存在しない場合は、これまで通り同期なしで続行する。

5. **archive を実行する**

   `planningHome.changesDir` の下に `archive` ディレクトリがなければ作成する:
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   現在の日付でターゲット名を生成する: `YYYY-MM-DD-<change-name>`

   **ターゲットが既に存在するか確認する:**
   - 存在する場合: エラーで失敗し、既存 archive のリネームか別の日付の使用を提案する
   - 存在しない場合: `changeRoot` を archive ディレクトリへ移動する

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/YYYY-MM-DD-<name>"
   ```

6. **要約を表示する**

   archive の完了要約を表示する。次を含める:
   - change 名
   - 使われたスキーマ
   - archive の場所
   - specs が同期されたか（該当する場合）
   - 警告（未完了の成果物 / tasks）についての注記

**成功時の出力**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** `planningHome.changesDir`/YYYY-MM-DD-<name>/ から導かれる archive パス
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**ガードレール**
- 与えられていなければ、必ず change の選択を促す
- 完了確認には成果物グラフ（openspec status --json）を使う
- 警告で archive をブロックしない - 通知して確認するだけ
- archive へ移動するとき .openspec.yaml を保持する（ディレクトリと一緒に移動する）
- 何が起きたかの明確な要約を表示する
- 同期が必要な場合は openspec-sync-specs の方式（エージェント駆動）を使う
- デルタ仕様が存在する場合は、必ず同期の評価を行い、まとめた要約を（プロンプトの前に）表示する
