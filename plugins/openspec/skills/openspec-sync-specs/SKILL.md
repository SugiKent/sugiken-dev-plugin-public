---
name: openspec-sync-specs
description: change のデルタ仕様をメイン仕様へ同期する。change を archive せずに、デルタ仕様の変更でメイン仕様を更新したいときに使う。
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.5.0"
---

change のデルタ仕様をメイン仕様へ同期する。

これは **エージェント駆動** の操作である - デルタ仕様を読み、メイン仕様を直接編集して変更を適用する。これにより賢いマージができる（例: 要件全体をコピーせずにシナリオだけを追加する）。

**ストアの選択:** ユーザーがストア（このマシンに登録された単体の OpenSpec リポジトリ）を指定した場合、または作業がストア内にある場合は、`openspec store list --json` を実行して登録済みストアの id を調べ、specs や changes を読み書きするコマンド（`new change`、`status`、`instructions`、`list`、`show`、`validate`、`archive`、`doctor`、`context`）に `--store <id>` を渡す。他のコマンドはこのフラグを取らない。コマンドが出力するヒントには既にフラグが含まれているので、後続でもそれを維持する。ストアがなければ、コマンドは最も近いローカルの `openspec/` ルートに対して作用する。

**入力**: 任意で change 名を指定できる。省略された場合は、会話のコンテキストから推測できるか確認する。曖昧・不明瞭なら、利用可能な changes を必ず提示して選ばせる。

**手順**

1. **change 名が与えられていなければ、選択を促す**

   `openspec list --json` で利用可能な changes を取得する。**AskUserQuestion ツール**でユーザーに選ばせる。

   デルタ仕様（`specs/` ディレクトリ配下）を持つ changes を表示する。

   **重要**: change を推測・自動選択しない。必ずユーザーに選ばせる。

2. **change のコンテキストを解決する**

   実行する:
   ```bash
   openspec status --change "<name>" --json
   ```

3. **デルタ仕様を見つける**

   status JSON の `artifactPaths.specs.existingOutputPaths` をデルタ仕様ファイルのリストとして使う。

   各デルタ仕様ファイルには次のようなセクションが含まれる:
   - `## ADDED Requirements` - 追加する新しい要件
   - `## MODIFIED Requirements` - 既存要件への変更
   - `## REMOVED Requirements` - 削除する要件
   - `## RENAMED Requirements` - リネームする要件（FROM:/TO: 形式）

   デルタ仕様が見つからなければ、ユーザーに通知して止める。

4. **各デルタ仕様について、メイン仕様へ変更を適用する**

   CLI が返すリポジトリローカルの capability デルタ仕様パスごとに:

   a. **デルタ仕様を読み**、意図された変更を理解する

   b. **メイン仕様を読む**（`openspec/specs/<capability>/spec.md`。まだ存在しないこともある）

   c. **賢く変更を適用する**:

      **ADDED Requirements:**
      - メイン仕様に要件が存在しなければ → 追加する
      - 要件が既に存在すれば → 一致するよう更新する（暗黙の MODIFIED として扱う）

      **MODIFIED Requirements:**
      - メイン仕様の中で要件を見つける
      - 変更を適用する - これは次のいずれか:
        - 新しいシナリオの追加（既存のものをコピーする必要はない）
        - 既存シナリオの変更
        - 要件の説明の変更
      - デルタに触れられていないシナリオ／内容は保持する

      **REMOVED Requirements:**
      - メイン仕様から要件ブロック全体を削除する

      **RENAMED Requirements:**
      - FROM の要件を見つけ、TO へリネームする

   d. **capability がまだ存在しなければ、新しいメイン仕様を作成する**:
      - `openspec/specs/<capability>/spec.md` を作成する
      - Purpose セクションを追加する（簡潔でよい、TBD と記してよい）
      - ADDED の要件を含む Requirements セクションを追加する

5. **要約を表示する**

   全変更を適用した後、次を要約する:
   - どの capability が更新されたか
   - どんな変更がなされたか（要件の追加／変更／削除／リネーム）

**デルタ仕様のフォーマット参照**

```markdown
## ADDED Requirements

### Requirement: New Feature
The system SHALL do something new.

#### Scenario: Basic case
- **WHEN** user does X
- **THEN** system does Y

## MODIFIED Requirements

### Requirement: Existing Feature
#### Scenario: New scenario to add
- **WHEN** user does A
- **THEN** system does B

## REMOVED Requirements

### Requirement: Deprecated Feature

## RENAMED Requirements

- FROM: `### Requirement: Old Name`
- TO: `### Requirement: New Name`
```

**核心原則: 賢いマージ**

プログラム的なマージと違い、**部分更新**を適用できる:
- シナリオを追加するには、MODIFIED の下にそのシナリオだけを含める - 既存シナリオはコピーしない
- デルタは *意図* を表すのであって、まるごと置換ではない
- 変更を筋の通る形でマージするために自分の判断を使う

**成功時の出力**

```
## Specs Synced: <change-name>

Updated main specs:

**<capability-1>**:
- Added requirement: "New Feature"
- Modified requirement: "Existing Feature" (added 1 scenario)

**<capability-2>**:
- Created new spec file
- Added requirement: "Another Feature"

Main specs are now updated. The change remains active - archive when implementation is complete.
```

**ガードレール**
- 変更する前に、デルタとメインの両方の仕様を読む
- デルタに触れられていない既存の内容は保持する
- 何かが不明瞭なら、明確化を求める
- 進めながら、何を変更しているかを表示する
- 操作は冪等であるべき - 2 回実行しても同じ結果になる
