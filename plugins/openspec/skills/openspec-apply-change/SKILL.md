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

**進め方:** 下の手順 1〜8 の太字の行と、後述の手順 9〜12 の見出しを、そのままタスクリストに写す。やらない手順も消さず、`skip: <理由>` を添えて残す。手順を飛ばしたことが後から見えるようにするため。各手順は、次の skill と参照を必要な場面で読む。

| 場面 | 使うもの |
|---|---|
| 手順 7 の各 task | 性質に応じて `references/task-feature.md`（新しい振る舞い）、`references/task-bug-fix.md`（不具合）、`references/task-refactoring.md`（構造だけ） |
| 手順 7 のスケッチとの照合 | `architect:35-architect-sketch` の Phase D と Phase E |
| 実装と確認の拠り所 | `architect:35-architect-principle` の「作業の原則」（当てる原則のファイルを読む） |
| 判断が要る場面 | 決めずに一時停止し、`openspec-propose` へ戻す（下の「apply では判断しない」） |
| 手順 10 の横断レビュー | `architect:35-architect-interrogate`（探す役の `architect:architect-interrogate-reviewer` と Codex プラグイン、確かめる役の `architect:architect-interrogate-verifier`） |
| 手順 11 のコメント掃除 | `openspec:comment-sicko` エージェント。design を変える形の変更は `openspec-propose` へ戻す |
| 手順 12 の振り返り | `basic:01-retro` |
| 完了報告・一時停止の報告 | `references/report-writing.md` |
| 無人実行・長い作業 | `references/decision-trail.md` |

**apply では判断しない:** apply は、propose で決めたことを実行し、propose で決めた基準で確かめるだけにする。仕様・設計の判断、数値の根拠になる実測、AI による仮置きの確定が要る場面に来たら、apply の中で決めない。その場で一時停止し、何が決まっていないかと、それがどの task を止めているかを書いて、`openspec-propose`（成果物の更新とグリリング）へ戻す。手順を最後まで回すために判断を補うより、止まるほうを選ぶ。apply の中で決めた判断は、グリリングとレビューを通らず、成果物にも残らないため。何を propose で済ませるか、apply が決めてよい局所の選択は何かの正本は、`openspec-propose` の「apply に判断を残さない」にある。戻した後の手順は `openspec-propose` の「apply から戻ったとき」にある。

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
   - `state: "blocked"`（成果物が不足）なら: メッセージを表示し、`openspec-propose` の「apply から戻ったとき」で足りない成果物を作るよう提案する
   - `state: "all_done"` なら: 祝福し、archive を提案する
   - それ以外: 実装へ進む

4. **コンテキストファイルを読む**

   apply の指示の出力の `contextFiles` に列挙された全ファイルパスを読む。
   ファイルは使われているスキーマに依存する:
   - **spec-driven**: proposal、specs、design、tasks
   - 他のスキーマ: CLI 出力の contextFiles に従う

   読んだ成果物に、決まっていない判断（`openspec-propose` の「apply に判断を残さない」の 3 つ）が残っていたら実装を始めない。`openspec-propose` の `scripts/check-undecided.sh` に `<changeRoot>` を渡して回し、当たった行と、根拠の書かれていない数値を挙げて `openspec-propose` へ戻す。

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

   最初の task に入る前に:
   - design に書かれたデータの形と、それをまとめる構造（`architect:35-architect-principle` の Model the Domain）を名指しする。apply で新しく選ばない。design に型のスケッチがあれば、それが約束になる（`architect:35-architect-sketch` の Phase D）。書かれていなければ `openspec-propose` へ戻す。
   - スループット点検を書く（`references/task-feature.md` の手順 1）。独立した作業の流れがあり、書き込むファイルが互いに素なら、サブエージェントに分けてよい（同じファイルの「サブエージェントに任せるとき」）。その差分は自分でレビューし、要約も自分で書く。

   保留中の各 task について:
   - どの task に取り組んでいるかを表示する
   - task の性質に合う手順を内側で使う。新しい振る舞いは `references/task-feature.md`、不具合は `references/task-bug-fix.md`（自分で再現してから直し、失敗するテストか再現を修正より先に置く）、構造だけの変更は `references/task-refactoring.md`（構造を動かす前に振る舞いを固定する）。
   - 必要なコード変更を行う
   - 変更は最小かつ焦点を絞る
   - コメントは書きながらきれいにする。残すのはコードでは示せない自明でない「なぜ」だけ。検証スクリプトやテストに段階を実況するコメント（`// Phase 1: カードを追加`）を書かず、手順の意味は assert やログの文字列に語らせる（`assert(ok, '再起動後も保持されている')`）。サブエージェントが書いた差分も同じ。手順 11 の掃除は、書くときの手抜きを取り返す場ではない
   - task に書かれた確認を実行し、緑になってから完了にする。赤のまま次の task へ進めば、壊れた土台の上に次の変更を積むことになる
   - tasks ファイルで task を完了にする: `- [ ]` → `- [x]`
   - 次の task へ続ける

   スケッチからの逸脱は黙って吸収せず、表に出す。成果物にない引数・型・状態が要る逸脱は、1 回でも apply の中で吸収せず、一時停止して `openspec-propose` へ戻す。`35-architect-sketch` の Phase E が挙げる兆し（同じ形の回避策の繰り返し、型の逃げ道、「ロックが要る」という反射）が型として現れたときも同じ。修正が同じ関門で失敗し続けるなら、Attack the Premise の止まる条件に従い、次の修正の前に前提を確かめる。

   **次の場合は一時停止する:**
   - task を実行するのに、成果物に書かれていない判断（仕様、設計の形、数値とその根拠、仮置きの確定）が要る → 決めずに一時停止し、`openspec-propose` へ戻す（「apply では判断しない」）
   - 実装で設計上の問題が判明 → apply で設計を直さず、`openspec-propose` へ戻して成果物を更新する
   - エラーやブロッカーに遭遇 → 報告して指示を待つ
   - ユーザーが割り込む

8. **完了または一時停止時に status を表示する**

   次を表示する:
   - このセッションで完了した tasks
   - 全体の進捗: 「N/M tasks complete」
   - 全完了なら: 手順 9（実物で確かめる）、手順 10（多モデルの横断レビュー）、手順 11（コメント掃除）、手順 12（振り返り）を済ませ、その結果を添えて archive を提案する。手順 9 の INCONCLUSIVE か、手順 10 で `openspec-propose` へ戻した Act on が残るなら、archive を提案せず「一時停止時の出力」で終える。マージを止める問題が残ったまま archive されるのを防ぐため
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

### Verification
<手順 9 の判定（VERIFIED / NOT VERIFIED / INCONCLUSIVE）と、実行したコマンドと出力を書く>

### Review
<手順 10 の Act on / Consider / Noted / Dismissed、合意に届かなかった指摘、直したもの>

### Principles
<適用した原則と、それで変わった選択。このセッションでファイルを読んだ原則だけ>

### Retro
<振り返りで反映したファイル、作成した Issue、ユーザー全体のスキルへの提案、反映しなかった候補とその理由を書く>

All tasks complete! Ready to archive this change.
```

この出力を使うのは、手順 8 の archive の条件を満たすときだけ。

完了報告は `references/report-writing.md` で書く。誰のための change で、その人に何が変わるかを実装の詳細より先に書き、主張には実測・推測・当て推量のラベルを付ける。

**一時停止時の出力（問題に遭遇）**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

### Undecided
<判断が要って止まったときに書く。決まっていない判断、それが止めている task、集めた証拠。`openspec-propose` の「apply から戻ったとき」の入力になる>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**ガードレール**
- 完了かブロックまで tasks を進め続ける
- 開始前に必ずコンテキストファイルを読む（apply の指示の出力から）
- task が曖昧なとき、実装で設計の問題が判明したときは、「apply では判断しない」に従う
- コード変更は最小に、各 task のスコープに絞る
- 各 task を完了したら直ちに task のチェックボックスを更新する
- エラー・ブロッカー・不明瞭な要件では一時停止する - 推測しない
- CLI 出力の contextFiles を使い、特定のファイル名を仮定しない
- Never Block on the Human は、決まったことの実行にだけ当てる。決まったことは尋ねずに進め、結果を見せる。判断が要る場面では、尋ねて決めることも自分で決めることもせず、「apply では判断しない」に従う
- 取り消せない操作（`architect:35-architect-principle` の `references/principles/never-block-on-the-human.md` が挙げるもの）の前は必ず止まる。組織・プロジェクト・ハーネスの規則が求める確認は、これより優先する
- 「止まらないで」「終わるまで回して」が覆うのも、決まったことの実行だけ。その実行では確認を挟まない。判断が要る task は止めて `openspec-propose` へ戻す判断事項にし、それに依存しない残りの task だけを進める。無人実行や長い apply では `references/decision-trail.md` で記録を残す
- 作業中に壊れた skill を見つけたら、作業は止めず、黙って回避もしない。手順 12 の振り返りで直す提案にする
- サブエージェントが同じ作業ツリーで動いている間は、ファイルを一時的に壊す確認（テストが赤になることの実測）をしない。サブエージェントが壊れた状態を読み、存在しないエラーを報告するため。行うなら、委譲したサブエージェントの完了を待つか、サブエージェントを `isolation: "worktree"` で起動する。サブエージェントから型エラーやテストの赤の報告を受けたら、自分が壊していた時間帯と重なっていないかを先に確かめる

**流動的なワークフローとの統合**

このスキルは「change に対するアクション」モデルを支える:

- **いつでも呼び出せる**: 全成果物が完了する前（tasks が存在すれば）、部分的な実装の後、他のアクションと交互に
- **成果物の更新を許容する**: 実装で設計上の問題が判明したら、`openspec-propose` の「apply から戻ったとき」で成果物を更新する。判断は propose に置いたまま、行き来は流動的に行う

---

# 9. 実物で確かめる

全 task が完了したら、ゲート（テスト・型チェック・lint）とは別に、変更した面で実物を動かして確かめる（`architect:35-architect-principle` の Prove It Works）。型チェックとテストの成功だけでは、利用者に見える振る舞いの証明にならない。

- 確認は変更の種類に合わせる。CLI は実際のコマンドを実行する。UI は動いているアプリで変わった流れを通す（E2E や Playwright）。パーサや migration は保存した入力を再生する。保存の変更は書いた値を読み戻す。性能の変更は変更前後を計測し、Explain the Number を当ててから数字を書く。task に確かめ方が書かれていれば、それを使う。
- 判定は Prove It Works の 3 つ（VERIFIED / NOT VERIFIED / INCONCLUSIVE）のどれかで書き、合格は VERIFIED だけにする。別の面で確かめただけのものも合格にしない。
- 確認はできるだけ再実行できるスクリプトかテストにし、そのコマンドと出力を完了報告に添える。
- 確認に人間の手が要るなら、その理由と、自動化を試してどこまで届いたかを書く。
- 合否の基準になる数値は、propose が design に書いた値を使う。ここで測るのは基準を満たすかの確認で、基準値そのものは決めない。基準が書かれていなければ、判定を INCONCLUSIVE にして `openspec-propose` へ戻す。

# 10. 多モデルの横断レビュー

spec ごとの実装が終わったら、テスト・型チェック・lint などのゲートを実行する**のと並行して**、`architect:35-architect-interrogate` の手順 1〜5 で横断レビューを走らせる。ゲートの完了を待ってからレビューを始めない。独立したレビューを並走させ、ゲートが通っても見逃し得る設計との不整合や実装漏れを回収する。

- レビュアーとその起動の仕方は、interrogate の手順 3 に従う。既定は Codex プラグイン（`codex:codex-rescue`）と `architect:architect-interrogate-reviewer` の 2 つで、どちらもこの apply の会話を持たない新しいコンテキストで差分を読む。どちらにも interrogate の `references/reviewer-prompt.md` を同じ形で埋めて渡す。依頼文を揃えると、2 つの系統の指摘の違いがモデルの差だけになり、両方が挙げた指摘を信頼できる信号として扱える。
- 依頼文の意図の欄には、proposal と design の要約に加えて、正本ファイル（proposal、specs、design、tasks）のパスと、突き合わせてほしい design の決定（番号か節の名前）を書く。差分の欄には、実装ファイルの一覧と差分の取り方（`git diff <base>...HEAD`）を書く。レビュアーは差分の外もたどるので、変更が触れる呼び出し元・共有する状態や設定の場所も添える。
- 実行の証拠の欄には、手順 9 で実行したコマンドと出力、ここまでに通したゲートの出力をそのまま貼る。「テストは通った」のような要約で済ませない。レビュアーが証拠の抜けを指摘できるのは、出力そのものを見たときだけだから。
- 意図は成果物から取る。interrogate と、その `references/lead-judgment.md` が「利用者に尋ねる」とする場面では、apply では尋ねず、`openspec-propose` へ戻す判断事項として報告する。

レビュー結果が返ったら、ゲート結果と合わせて確認する。interrogate の手順 4 で両方のレビュアーの指摘を統合し、探したレビュアーとは別の検証役に確かめさせ、合意の取れた指摘だけを手順 5 でリードとして Act on / Consider / Noted / Dismissed に仕分ける。合意に届かなかった指摘は直さず、完了報告に一覧で載せる。

- Act on のうち、成果物が決めた範囲で直せるもの（仕様・設計からのずれ、実装の誤り）は、同じ change のスコープ内で直し、必要なゲートと手順 9 の確認を再実行する。
- 直すのに成果物にない判断が要る Act on（design の誤り、design の形を変える組み替え）は、apply では直さず、`openspec-propose` へ戻す判断事項として報告する。
- Consider は apply で直すかを決めず、判断事項として報告する。Noted は一覧で、Dismissed は理由を付けて報告する。指摘が 0 件だったこともレビュー実施結果として報告する。
- PR に付いたレビュー bot やセキュリティレビューの指摘も、lead-judgment の「外部レビューの指摘」で仕分ける。

## 補助的なレビュー観点

`35-architect-*` の接頭辞で始まる Skill は、必要に応じて横断レビューの観点として参照・指定する。特に設計品質は `35-architect-code-review`、設計原則は `35-architect-principle`、入力・認証・認可・データ保存・外部連携を扱う変更は `35-architect-security` を参照する。

# 11. コメント掃除（no-comments）

手順 10 の横断レビューと、手順 9 の E2E を含むすべてのゲートが緑になり、編集が止まってから、change の完了報告の前に必ずコメント掃除を回す。comment-sicko が走っている間は、スコープ内のファイルを親が編集しない。走行中に書き換えると、comment-sicko が消したコメントと親の変更が混ざり、どちらの差分かを検査できなくなるため。新鮮な視点を持つ `comment-sicko` サブエージェントの判断を尊重し、受け入れた指摘に対して手を動かす。

**スコープ:** この change で触ったファイル、または作業ツリーを含むベースブランチ（既定 `main`）との差分。

1. Agent ツールで `subagent_type: "openspec:comment-sicko"` を起動し、スコープを渡す。comment-sicko のルールを言い直さない。
2. 報告と差分を検査する。アプリケーションコードの編集、スコープ外への逸脱、例外で守られるコメントの削除、`MUST KILL` 理由の誤り、意図して残したコードを有罪扱いするフラグは却下する。自分たちのコードの驚きに対する改形フラグは対応対象のまま残し、そのコメントは復元しない。残す判定は、こちらで変えられないものについてだと証明できた場合だけ生き残る。スコープ内で見逃された lint / TypeScript の抑制を監査し、正確性・安全性に関わる抑制は対応対象の `MUST KILL` とする。削除の復元は、例外に正確に当てはまりスコープ内の証明があるときだけ。中身の薄い `IMPORTANT` / `do not remove` 系の削除・残す判定を受け入れる前に、そのシンボルの定義・呼び出し元・Git 履歴を読み、どう動くか・なぜそうなっているかを確かめる。削除が曖昧なら復元しない。残す判定が反証された、または曖昧なままなら削除する。却下した報告は 1 回だけ差し戻し（変更を revert し、失敗理由を名指しして再実行）、2 回目も却下なら未解決として報告し、コメント掃除を失敗扱いにする。
3. 受け入れた単純なフラグは直接直す（死んだ経路の削除、引数の削除、本物の API の使用）。design の範囲に収まる局所的な直し（改名、呼び出し元が 1 つの包みを畳む、型で不変条件を表す）もここで行う。形の変更が design の決定（モジュールの境界、公開 API、データの形）を変えるなら、apply では形を決めず、受け入れたフラグ一式を添えて `openspec-propose` へ戻す。
4. スコープ内で最小の根本原因修正を実装する。名指しされた回避策はすべて取り除く。根本原因がスコープ外なら、スコープ内の最小修正を入れて残りを未解決として報告する。症状を抑えるガードを後付けしない。手順 10 の review fix を外す変更は、外すと赤になるテストを先に作る。作れないなら外さず、判断事項として報告する。外した差分は横断レビューを通っていないため。修正後はゲート（テスト・型チェック・lint）を再実行する。
5. 制約コメント（`do not remove`、`文言を変えないで`、`変更前に X に相談` など）のうち、こちらで変えられないものについての残す判定はそのまま残す。それ以外は、その制約を確かめるテストか型で強制できて、強制が design の範囲に収まるなら、強制を入れてからコメントを削除する。強制の形が design の決定（公開 API、データの形、CI の構成）に触れるなら、apply では決めない。コメントを残し、強制の案を完了報告の判断事項に書く。対話の承認は待たない（「apply では判断しない」）。
6. 削除数、復元したコメント、差し戻し回数、`openspec-propose` へ戻した形の変更、修正内容、強制の提案、実装した強制、強制されていない制約、その他の未解決事項を、手順 8 の完了報告に含める。

この仕組みは [cursor/plugins の `no-comments` スキル](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md) と `comment-sicko` エージェントを参考に、このリポジトリの apply フローへ組み込んだもの。

# 12. 振り返り

コメント掃除まで済んだら、archive を提案する前に、apply をしたこのセッションの中で振り返る。振り返りの実行から反映、コミットまでを、ユーザーに確認せずに通す。途中で承認を待たない。ゴールは、この apply で詰まった点・ユーザーの指摘・propose へ戻した判断を、ドキュメント・リンター・skill に固定して、次の change で同じ失敗をしないことである。

**同じセッションか別セッションか:**

* 原則はこのセッションで振り返る。apply の文脈（判断の経緯、エラーと詰まった点、ユーザーの指摘）をそのまま使えるため。
* 別セッションに回してよいのは、apply のセッションの会話記録を、ツールの結果を含めて全文読める手段を呼び出し元が渡した場合だけ。タブの表示や末尾だけの要約では、途中の詰まりと指摘が落ちるので足りない。

**手順:**

1. `basic:01-retro` スキルで振り返る。セッションが自明でなければ、01-retro の「三つのレンズで並行に読む」を回し、統合役が「採用」「構造へ回す」に入れたものを反映候補にする。
2. 下の「反映の扱い」に従って、候補をそのまま反映する。01-retro の「Phase 3: 差分プレビューの生成」で止まらず、「Phase 4: 承認とDoc-ship連携」の承認も待たない。
3. 振り返りの結果を、リポジトリの決まった置き場（無ければ `docs/quality/`）に残す。反映したファイル、作成した Issue、反映しなかった候補とその理由を書く。
4. テスト・lint を通し、振り返りの変更を実装とは別のコミットにする。

**反映の扱い:**

* ドキュメントとリンター（lint のルール、カスタムリンター）への反映候補は、エージェントが積極的に採用し、ユーザーに聞かずに入れる。リンターのルールを足したら lint を再実行する。この change のコードに出た違反は、振る舞いを変えない機械的な直しで済むものだけ直す。直せない違反が残るなら、違反の行に例外を置かず（01-retro は例外に人間の承認を求めるため）、そのルールは入れずに、次の change の提案として手順 3 の記録に書く。
* 01-retro の「強制の階段」の 1 段目（アーキテクチャで消す）に当たる候補は、この change の設計を変えるので、ここでは入れない。次の change の提案として手順 3 の記録に書く。
* そのリポジトリの中のスキルとルール（`<リポジトリ>/.claude/skills`、`.claude/rules` など）は、エージェントがユーザーに聞かずに直す。
* plugin 経由で配布されているスキルの改善は、install 先のキャッシュを直接編集せず、01-retro の「Phase 4: 承認とDoc-ship連携」の手順 1 に従って plugin repo に GitHub Issue を作る。ユーザーに聞かずに作る。作る前に同じ内容の Issue が開いていないかを検索し、あればそこにコメントを足す。Issue には対象ファイル、変更の理由、提案する変更、このセッションでの根拠を書く。
* ユーザー全体のスキル（`~/.claude/skills` など）はリポジトリの外にあり、レビューもコミットもできないので編集しない。何をどう変えるかと理由を、手順 3 の記録と完了報告に書く。
* この change の仕様・設計・実装コードは、振り返りで変えない。振り返りで仕様や設計の問題が見つかったら、それは propose の仕事なので、手順 3 の記録と完了報告に書く。この change の完了を左右するなら、「apply では判断しない」に従って `openspec-propose` へ戻す。
* Issue の作成に失敗したとき（権限がない、ネットワークに届かない）は止まらず、作るはずだった内容を手順 3 の記録と完了報告に書く。

# tasks への執着について

tasks.md は、ユニットテストなど実際のアプリケーションの動作以外の要素も含めて一度の apply の指示ですべて完了させることを強い言葉で明記する。
人間が作業が必要なタスクのみを残して良い。

# db 操作について

開発環境用の db migration などは、その ORM などのライブラリの正当な手段を用いて一度の apply の指示で実行まで行うこと。

# UI の文言について

UI の文言は、`openspec-propose` の「UI の文言について」で決めて成果物に書いたものを当てる。書かれていない文言が要るなら、「apply では判断しない」に従う。手順 10 の横断レビューでも、UI を含む change では `stop-describing-ui` スキル（design plugin）を観点に加える。
