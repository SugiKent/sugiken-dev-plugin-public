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

5. **実装前に他の change との整合性を確認する**

   実装に着手する前に、対象 change 以外の `openspec/changes` を確認する。`openspec list --json` で未完了の change を列挙し、各 change の成果物（少なくとも proposal、specs、design、tasks）を読んで、対象 change との関係を整理する。

   次の観点を確認する:
   - 前提となる change が未完了で、実装順序の依存関係がないか
   - 同じコードファイル、API、route、service、UI領域を変更する change がないか
   - 同じ DB テーブル、model、enum、index、制約、migration を追加・変更する change がないか
   - 片方の change の設計や migration をもう片方でも重複して定義していないか
   - 並行実装した場合に、tasks の完了順や成果物の統合でコンフリクトしないか

   確認結果を「依存なし」「依存あり」「競合・重複あり」に分類して表示する。未完了の前提 change がある場合、またはコード/API/DB設計の競合・重複を解消できない場合は実装を開始せず、対象 change と相手 change、競合箇所、推奨する実装順を報告して指示を待つ。問題がない場合のみ次へ進む。

6. **現在の進捗を表示する**

   次を表示する:
   - 使われているスキーマ
   - 進捗: 「N/M tasks complete」
   - 残りの tasks の概要
   - CLI からの動的な指示

7. **tasks を実装する（完了かブロックまでループ）**

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

8. **完了または一時停止時に status を表示する**

   次を表示する:
   - このセッションで完了した tasks
   - 全体の進捗: 「N/M tasks complete」
   - 全完了なら: 手順 10（Codex 横断レビュー）、手順 11（コメント掃除）、手順 12（振り返り）を済ませ、その結果を添えて archive を提案する
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

### Retro
<振り返りで反映したファイルと、ユーザーの判断を待つ項目を書く>

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

# 10. Codex による横断レビュー

spec ごとの実装が終わったら、テスト・型チェック・lint などのゲートを実行する**のと並行して**、Codex MCP に横断レビューを依頼する。ゲートの完了を待ってからレビューを始めない。独立したレビューを並走させ、ゲートが通っても見逃し得る設計との不整合や実装漏れを回収する。

レビュー依頼では必ず次を指定する。

- `sandbox: read-only`、`approval-policy: never` とし、対象リポジトリを変更できない状態にする
- レビュアーには**修正をさせず、指摘だけを返させる**。修正、整形、テスト実行、ファイル作成は依頼しない
- design の決定番号と実装ファイル一覧を明示して渡し、仕様・設計との突合対象を曖昧にしない
- 正確性、仕様/design との整合性、エッジケース、回帰、セキュリティ、可読性・保守性、テスト不足を観点に含める
- 指摘は `重大` / `中` / `Nit` の 3 段階に分類させる。各指摘に根拠となるファイル・行または該当箇所、影響、推奨対応を添えさせる

レビュー結果が返ったら、ゲート結果と合わせて確認する。`重大` と `中` は妥当性を確認してから、同じ change のスコープ内で修正し、必要なゲートを再実行する。`Nit` は修正するかを判断して報告する。指摘が 0 件だったこともレビュー実施結果として報告する。

## Codex MCP レビュー依頼の雛形

`<...>` を対象 change の情報に置き換えて Codex MCP へ渡す。

```text
あなたはコードレビュアーです。以下の OpenSpec change の実装を read-only でレビューしてください。

実行条件:
- sandbox: read-only
- approval-policy: never
- ファイルの編集・作成・削除、整形、テスト実行は一切しない
- 修正案のコードを書き換えず、指摘のみを返す

正本ファイル:
- proposal: <path>
- specs: <path(s)>
- design: <path>
- tasks: <path>

design の決定番号:
- <決定番号>: <決定の要約>
- <決定番号>: <決定の要約>

実装ファイル:
- <path>
- <path>

確認観点:
- proposal/specs/design/tasks と実装の整合性。特に上記 design の決定番号が実装に正しく反映されているか
- 正確性、エッジケース、エラー処理、既存機能への回帰
- 認証・認可、入力検証、データ露出、外部連携を含むセキュリティ
- 可読性、保守性、変更容易性、不要な複雑さ、テストの不足

出力形式:
- 先頭に結論: `重大: N件 / 中: N件 / Nit: N件`
- 各指摘を `重大`、`中`、`Nit` のいずれかに分類する
- 各指摘に、対象ファイルと行番号または該当箇所、問題、影響、推奨対応を記載する
- 指摘がない場合は `指摘なし` と明記する
```

## 補助的なレビュー観点

`35-architect-*` の接頭辞で始まる Skill は、必要に応じて横断レビューの観点として参照・指定する。特に設計品質は `35-architect-code-review`、設計原則は `35-architect-principle`、入力・認証・認可・データ保存・外部連携を扱う変更は `35-architect-security` を参照する。

# 11. コメント掃除（no-comments）

Codex の横断レビューとゲートが片付いたら、change の完了報告の前に必ずコメント掃除を回す。新鮮な視点を持つ `comment-sicko` サブエージェントの判断を尊重し、受け入れた指摘に対して手を動かす。

**スコープ:** この change で触ったファイル、または作業ツリーを含むベースブランチ（既定 `main`）との差分。

1. Agent ツールで `subagent_type: "comment-sicko"` を起動し、スコープを渡す。comment-sicko のルールを言い直さない。
2. 報告と差分を検査する。アプリケーションコードの編集、スコープ外への逸脱、例外で守られるコメントの削除、`MUST KILL` 理由の誤り、意図して残したコードを有罪扱いするフラグは却下する。自分たちのコードの驚きに対する改形フラグは対応対象のまま残し、そのコメントは復元しない。残す判定は、こちらで変えられないものについてだと証明できた場合だけ生き残る。スコープ内で見逃された lint / TypeScript の抑制を監査し、正確性・安全性に関わる抑制は対応対象の `MUST KILL` とする。削除の復元は、例外に正確に当てはまりスコープ内の証明があるときだけ。中身の薄い `IMPORTANT` / `do not remove` 系の削除・残す判定を受け入れる前に、そのシンボルの定義・呼び出し元・Git 履歴を読み、どう動くか・なぜそうなっているかを確かめる。削除が曖昧なら復元しない。残す判定が反証された、または曖昧なままなら削除する。却下した報告は 1 回だけ差し戻し（変更を revert し、失敗理由を名指しして再実行）、2 回目も却下なら未解決として報告し、コメント掃除を失敗扱いにする。
3. 受け入れた単純なフラグは直接直す（死んだ経路の削除、引数の削除、本物の API の使用）。形の変更が必要な修正があれば、受け入れたフラグ一式と周辺コードを対象に `architect:architect-principle` サブエージェントを 1 回だけ起動し、設計スケッチで止めさせる。形はアーキテクトが決め、実装は次の手順で行う。
4. スコープ内で最小の根本原因修正を実装する。名指しされた回避策はすべて取り除く。根本原因がスコープ外なら、スコープ内の最小修正を入れて残りを未解決として報告する。症状を抑えるガードを後付けしない。修正後はゲート（テスト・型チェック・lint）を再実行する。
5. 制約コメント（`do not remove`、`文言を変えないで`、`変更前に X に相談` など）のうち、こちらで変えられないものについての残す判定はそのまま残す。それ以外は、スコープ内で最も安い型・ランタイム検査・テスト・CI lint による強制を提案し、対話的な承認を待つ。無人実行（Routine など）では呼び出し元の事前承認がある場合のみ実施する。承認されたら強制を実装してからコメントを削除する。承認されなければコメントを削除し、制約を未解決として報告し、スコープ外の作業をスケッチする。
6. 削除数、復元したコメント、差し戻し回数、アーキテクトのスケッチ、修正内容、強制の提案、実装した強制、強制されていない制約、その他の未解決事項を、手順 8 の完了報告に含める。

この仕組みは [cursor/plugins の pstack `no-comments` スキル](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md) と `comment-sicko` エージェントを参考に、このリポジトリの apply フローへ組み込んだもの。

# 12. 振り返り

コメント掃除まで済んだら、archive を提案する前に、apply をしたこのセッションの中で振り返る。ゴールは、この apply で得た判断の経緯・詰まった点・ユーザーの指摘を、ドキュメントとリンターに固定して次の change で同じ失敗をしないことである。

**同じセッションか別セッションか:**

* 原則はこのセッションで振り返る。apply の文脈（判断の経緯、エラーと詰まった点、ユーザーの指摘）をそのまま使えるため。
* 別セッションに回してよいのは、apply のセッションの会話記録を、ツールの結果を含めて全文読める手段を呼び出し元が渡した場合だけ。タブの表示や末尾だけの要約では、途中の詰まりと指摘が落ちるので足りない。

**手順:**

1. `basic:01-retro` スキルで振り返り、ドキュメント・リンター・スキルへの反映候補を出す。
2. 下の「反映の扱い」に従って反映する。この手順の中では、01-retro の「Phase 4: 承認とDoc-ship連携」が求める承認待ちより、下の扱いを優先する。
3. 振り返りの結果を、リポジトリの決まった置き場（無ければ `docs/quality/`）に残す。
4. テスト・lint を通し、振り返りの変更を実装とは別のコミットにする。

**反映の扱い:**

* ドキュメントとリンター（lint のルール、カスタムリンター）への反映候補は、エージェントが積極的に採用し、ユーザーに聞かずに入れる。リンターのルールを足したら lint を再実行し、スコープ内の違反を直す。
* そのリポジトリの中のスキルとルール（`<リポジトリ>/.claude/skills`、`.claude/rules` など）は、エージェントがユーザーに聞かずに直す。
* ユーザー全体のスキルやプラグインのスキルの変更と、外部リポジトリへの Issue 作成は、エージェントが実行しない。何をどう変えるかと理由を書き、ユーザーの判断を仰ぐ。無人実行（Routine など）では対話で止まらず、完了報告（PR 本文など）に書く。

# tasks への執着について

tasks.md は、ユニットテストなど実際のアプリケーションの動作以外の要素も含めて一度の apply の指示ですべて完了させることを強い言葉で明記する。
人間が作業が必要なタスクのみを残して良い。

# db 操作について

開発環境用の db migration などは、その ORM などのライブラリの正当な手段を用いて一度の apply の指示で実行まで行うこと。

# UI の文言について

画面・ボタン・空状態・ヘルパーテキスト・ダイアログなど UI の文言を書く task では、`stop-describing-ui` スキル（design plugin）に従って書く。説明文の多い UI は利用者に読む負担を強いるため、操作ラベルと配置で伝える。Codex による横断レビューでも、UI を含む change ではこのスキルを観点に加える。
