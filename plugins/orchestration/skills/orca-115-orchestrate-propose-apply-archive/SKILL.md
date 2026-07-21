---
name: orca-115-orchestrate-propose-apply-archive
description: "個人開発プロジェクトで、ユーザーの指示を断続的に受けながら、Orca のオーケストレーションで OpenSpec の Propose → Apply → アーカイブ のライフサイクルを依存関係に注意しつつ回す手順スキル。アイデア1件ごとに段ごとの新規 pane（1段=1pane）を作り、各 pane の Claude に /opsx:propose → /opsx:apply → /opsx:archive を実行させ、各段の worker_done を check --wait（バックグラウンド・メインスレッドをロックしない）で構造的に回収してから次段へ進む段間ゲートで進める。worktree は作らず現在のチェックアウトを全 pane で共有し、触るファイルが重なる change は直列化、重ならない change は並行着手してよい（依存判断は親の責務）。pane でユーザー入力（質問・承認・decision_gate）が必要になったら Orca の通知でユーザーが対応する前提とし、親は自動 reply で介入しない。「Orca でオーケストレーション」「propose から archive まで回す」「アイデアから change を回す」「対話的に propose/apply/archive」「Orca で change ライフサイクルを回す」「アイデアを聞いて propose して実装してアーカイブまで」等の発話・タスク要求時に使用。"
---

# Orca で OpenSpec の Propose → Apply → アーカイブ を対話的にオーケストレーションする

ユーザーから **断続的にアイデア（作りたいもの・直したいもの）を受け取り**、アイデア1件につき
OpenSpec の **Propose → Apply → アーカイブ** のライフサイクルを、Orca の pane（`orca terminal split`）と
監視付きディスパッチ（[[orchestration]] の task-create / dispatch --inject / check --wait）で回す。
**各段（Propose / Apply / アーカイブ）ごとに新規 pane を1つ作り（1段=1pane）**、その pane の Claude に
`/opsx:propose` / `/opsx:apply` / `/opsx:archive` を実行させる。親オーケストレーター（このセッション）は
**pane を作り・dispatch し・段の完了を構造的に待って次段を起動する**ところまでが責務で、propose 文書の
執筆・change の実装・アーカイブそのものは各 pane の Claude が担う。

着手側 [[orca-111-apply-unstarted-changes]] / アーカイブ側
[[orca-113-archive-completed-changes]] と pane 運用・shared checkout・監視付きディスパッチの
前提は同じ。本スキルはそれらを **1アイデアの propose→apply→archive という縦のライフサイクル**として束ね、
かつ **対話起点**（ユーザーにアイデアを尋ねて始める）である点が違う。

関連スキル: pane/terminal 操作の基礎は [[orca-cli]]、worker への dispatch と完了待ち（task-create /
dispatch --inject / check --wait / reply）は [[orchestration]]、各段で pane の Claude が実行する中身は
`openspec-propose`（= `/opsx:propose`）/ `openspec-apply-change`（= `/opsx:apply`）/
`openspec-archive-change`（= `/opsx:archive`）。

**引数は不要。** 開始時はアイデアを持っていない前提で、ユーザーに尋ねるところから始める（§1）。

---

## 0. 前提・絶対に守ること

- **このセッション（親）は実装も propose 執筆もアーカイブもしない。** pane を作り、各段の Claude に
  dispatch したら、監視付きディスパッチでの完了待ち（§3）と次段の判断・起動に徹する。親が現在の
  チェックアウトのファイルを編集・`mv`・執筆しない。
- **orchestration の experimental 機能が有効であること**（Settings > Experimental）。本 skill の主手段である
  監視付きディスパッチは `orca orchestration` の dispatch / check --wait に依存する。**着手前に有効かどうかを
  確認する**こと。無効な場合は §2 の dispatch --inject と §3 の check --wait は使えないので、従来の
  `orca terminal send` でのプロンプト送信＋ title ポーリング監視へフォールバックする。
- **branch を切り替えない / stash しない**。この skill は worktree も
  ブランチも作らない。現在のブランチ・作業ツリーをそのまま使う。
- **worktree を作らない。全 pane は同一チェックアウト（現在の作業ツリー）を共有する。** これは worktree
  方式との最大の違い。だからこそ §4 で change 間の依存・ファイル衝突を把握し、重なるものは直列化する。
- **dispatch --inject は agent CLI が起動している pane が条件。** §2 で `--command "claude"` 起動し
  `tui-idle` を確認した pane だけが対象。bare shell の pane には inject できない。
- **メインスレッドで `check --wait` を同期ブロックしない**（§3 の最重要設計点）。会話プロセスがロックして
  ユーザーの次のアイデアを受けられなくなる。監視は **バックグラウンド実行**（Bash の `run_in_background`）
  にし、親は常に応答可能な状態を保つ。worker 完了通知を受けるたびに次段を判断・起動するイベント駆動にする。
- **pane でユーザー入力が必要になったら、親は自動介入しない**（§5）。各 pane の Claude が質問・承認・
  `decision_gate` で一時停止すると **Orca の画面でユーザーに通知が行く**。親は decision_gate に勝手に
  答えず、ユーザーが Orca 通知経由で対応する前提で、他トラックの監視を続け、`worker_done` が来たら次へ進む。
  （※ [[orca-111-apply-unstarted-changes]] では親が `reply` する作法だが、本スキルは
  「ユーザーに委ねる」方針である点が両者の違い。）
- 失敗・スキップは握り潰さない。pane 作成・Claude 起動・dispatch・各段の処理が失敗したら、その段は
  完了済みにせず報告する。

---

## 1. 開始 — 何を始めるかユーザーに尋ねる

初期状態では **指示が無い前提**でスタートする。`AskUserQuestion` を **オープンエンド（プリセット選択肢を
置かず）** で使い、ユーザーに尋ねる:

> 「何を始めますか？ 作りたいもの・直したいものを説明してください。」

**ユーザーが何を作りたいか理解せずに先へ進まない。** アイデアが曖昧なら、propose に渡せる程度まで
（何を・なぜ）を AskUserQuestion で確認する。複数アイデアを一度に渡された場合は、各アイデアを1本の
ライフサイクル（§2〜§5）として扱い、§4 で依存・衝突を判断してから着手する。

以降、ユーザーは **断続的に**追加のアイデアや指示を投げてくる。親は応答可能な状態（§3 のバックグラウンド
監視）を保ち、新しいアイデアが来たら §4 の依存判断を挟んで新しいライフサイクルを開始する。

## 2. 各段の pane を作り、Claude を起動して dispatch する（1段=1pane）

アイデア1件のライフサイクルは **Propose →（完了後）Apply →（完了後）アーカイブ** の順。
**各段でそれぞれ新規 pane を1つ作って作業開始する（1段=1pane）。** 前段の pane を使い回さない。

分割の起点 base ターミナルは [[orca-cli]] の `orca terminal list --json` から控える（現在開いているタブの
アクティブ端末。新しいタブは作らない）。

### 2-a. pane を作る → tui-idle を待つ

```bash
# base ターミナルを分割し、新 pane で claude を起動
orca terminal split \
  --terminal <base handle> \
  --direction vertical \
  --command "claude" \
  --json

# Claude Code は TUI。入力受付状態を待つ
orca terminal wait --terminal <pane handle> --for tui-idle --timeout-ms 120000 --json
```

- `terminal split` の `--json` 戻りに **新しい pane の handle** が返る。以降の dispatch / show はこの handle を
  使う(active 任せにしない。直後に active なのが狙った pane とは限らない)。
- `--direction vertical` は上下分割、`--direction horizontal` は左右分割（直感と逆なので注意）。
- pane は **1つずつ作り、`wait` の tui-idle + `show` で `writable: true` を確認してから次を split する。**
  連続で素早く split すると先発 pane が orphan（`connected:false / writable:false / paneRuntimeId:-1`、
  送信不可）になり `terminal list` から消えることがある。
- `tui-idle` がタイムアウトしたら、その段は完了済みにせず報告する。
- worktree を作らないので依存パッケージ install 待ち（`--setup run` / 依存インストール）は不要。

### 2-b. タスク化して dispatch --inject で実行させる

TUI 起動後、その段の作業を **orchestration のタスク**にし、`--inject` 付きで pane の Claude へ dispatch する。
`orca terminal send` の直接送信は使わずこの dispatch に一本化する。`--inject` は task spec に加えて
**coordinator preamble**（＝「終わったら親へ `worker_done` を返せ」）を worker の Claude CLI に注入するため、
親は段の完了を構造的に待てる（§3）。

**(a) Propose 段**

```bash
orca orchestration task-create --spec \
  "OpenSpec change を新規提案する。/opsx:propose スキルを使い、次のアイデアを propose する: 「<アイデア本文>」。proposal.md / design.md / tasks.md を生成する。プロジェクトの開発ルール（コーディング前に考える・各ステップ後のチェックポイント・失敗は大声で報告）に従う。生成した change 名（openspec/changes/ 直下のディレクトリ名）を最後に明示して報告する。この作業は worktree ではなく共有チェックアウト上で進むため、git のブランチ切り替え・commit・stash は行わない。" \
  --json

orca orchestration dispatch --task <task_id> --to <pane handle> --inject --json
```

**(b) Apply 段**（Propose の worker_done を §3 で回収し、change 名が確定してから）

```bash
orca orchestration task-create --spec \
  "OpenSpec change '<change名>' を実装する。/opsx:apply スキルを change 名 '<change名>' を指定して実行し、openspec/changes/<change名>/tasks.md のタスクを順に実装する。プロジェクトの開発ルールに従う。この作業は worktree ではなく共有チェックアウト上で他の change と並行で進むため、git のブランチ切り替え・commit・stash は行わない。" \
  --json

orca orchestration dispatch --task <task_id> --to <pane handle> --inject --json
```

**(c) アーカイブ段**（Apply の worker_done を §3 で回収してから）

```bash
orca orchestration task-create --spec \
  "OpenSpec change '<change名>' をアーカイブする。/opsx:archive スキルを change 名 '<change名>' を指定して実行する。デルタ仕様が存在する場合は『今すぐ同期する』を選んでメイン仕様へ同期した上でアーカイブまで完了させ、確認のために処理を止めない。この作業は worktree ではなく共有チェックアウト上で進むため、git のブランチ切り替え・commit・stash は行わない（アーカイブ結果は未コミット差分のまま残してよい）。" \
  --json

orca orchestration dispatch --task <task_id> --to <pane handle> --inject --json
```

**ポイント:**

- `--inject` は **claude / codex など認識済みの agent CLI が pane で起動している**ことが条件（§0）。bare
  shell の pane には inject できない。inject 不可なら §0 のフォールバック（terminal send）へ退避する。
- `--to` には §2-a の **戻り handle** を渡す（active 任せにしない。狙った pane に dispatch するため）。
- dispatch の `--json` 戻りに `dispatchId` が含まれる。worker_done は `taskId` + `dispatchId` で識別される
  ため、複数アイデア／段を並行 dispatch しても完了を取り違えない。控えた task id / pane handle は §3・§6 で使う。
- **task spec には実行させる指示だけ**を入れる。衝突回避や直列化は親が §4 の依存把握と §3 の監視で担う。
  禁止事項や人間への判断伺いを spec に埋め込まない（ただし共有チェックアウト保護の git 操作禁止は明示する）。
- Propose 段の spec には **生成した change 名を最後に報告させる指示**を必ず入れる。Apply / アーカイブ段は
  その change 名を `--spec` に直接埋め込む（選択プロンプトをスキップさせる）。

## 3. 段間ゲート — check --wait をバックグラウンドで回し、worker_done で次段へ

各段は **前段の `worker_done` を構造的に回収してから次段へ進む**（段間ゲート）。完了待ちは
**orchestration の `check --wait`** を主手段にする。sleep ポーリングではなく、worker の完了（`worker_done`）・
エスカレーション（`escalation`）・判断要求（`decision_gate`）を構造的に待つ:

```bash
orca orchestration check --wait --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

**【最重要設計点】この `check --wait` を親のメインスレッドで同期ブロックしない。** 同期ブロックすると会話
プロセスがロックし、ユーザーの次のアイデア（§1 の断続的入力）を受けられなくなる。**監視はバックグラウンド
実行**（Bash の `run_in_background`）にし、親は常に応答可能な状態を保つ。**worker 完了通知を受けるたびに
親が次段を判断・起動するイベント駆動**にする。

- `check --wait` は **1件ずつ** メッセージを返す。複数アイデア／段を並行 dispatch したなら、各完了を
  1件ずつ回収するため check --wait を繰り返す（バックグラウンドで rolling に回す）。
- **`worker_done` を1件回収するたびに、その段の次段を §2 で起動する**:
  - Propose の worker_done → 報告された change 名で **Apply 段**の pane を新規作成し dispatch。
  - Apply の worker_done → その change の **アーカイブ段**の pane を新規作成し dispatch。
  - アーカイブの worker_done → §6 で `archive/` への移動を確認して、そのライフサイクルを完了扱い。
- `decision_gate`（worker が判断を仰いでいる）が来ても、**親は自動 reply で介入しない**（§5）。
  ユーザーが Orca 通知経由で対応する前提で、他トラックの監視を続け worker_done を待つ。
- `heartbeat`（alive）は **進捗確認のための情報であり完了通知ではない**（§7）。reply 不要・段遷移の
  トリガーにしない。だから `check --wait` の `--types` は `worker_done,escalation,decision_gate` に絞る
  （heartbeat を完了と誤認しないため）。
- **タイムアウトや `{count:0}` は worker 失敗ではなく checkpoint** として扱う。実装は 15〜60 分かかることが
  あるので、worker_done / escalation が来るか、pane が消えるか、ユーザーが止めるまで rolling に
  `check --wait` し直す。勝手に pane を kill / 再 dispatch しない。
- `escalation` が来たら握り潰さず、内容を確認して対処する（依存元の完了待ち・順序調整・ユーザーへの報告）。

**liveness 確認のフォールバック（check --wait が無反応のとき）:** rolling wait が連続で `{count:0}` のとき、
worker が生きているかを title で確認する。**`orca terminal read` の `tail` は TUI の代替スクリーンバッファを
拾わない**ため、tail だけ見て「起動していない／終わった」と誤判定しないこと。状態確認は
**`orca terminal show` の `title`** を見る（Claude は title を change 名へ書き換え、処理中はスピナー文字
`⠐` `⠂` が付く）。これは completion 判定の主手段ではなく check --wait の補助である:

```bash
orca terminal show --terminal <pane handle> --json   # title にスピナーが出ていれば稼働中
```

## 4. 依存関係を把握し、直列化／並行を判断する

複数アイデア／change が並行しうる場合、**全 pane が同一チェックアウトを共有する前提**で依存・衝突を判断する。
この判断はオーケストレーター（親セッション）の責務であり、ユーザーへ丸投げしない。

各 change の `design.md` / `tasks.md` / `specs/` デルタ（propose 完了後は生成物）を読み、次を洗い出す:

- 各 change が **どのファイル・モジュールを触るか**（重なれば衝突リスク）。
- change 間に **前後関係（A の成果に B が依存する）** があるか。
- 共有スキーマ（例: ORM のスキーマ定義ファイル）・共有設定・同じ capability のメイン仕様（`openspec/specs/
  <capability>/spec.md`）など、**直列化すべき変更**があるか。

判断の指針:

- **触るファイルが重ならない change** は **並行着手してよい**（それぞれ独立に §2〜§3 のライフサイクルを回す）。
- **触るファイルが重なる／依存がある change** は **直列化する**。とくに **依存元の Apply 完了を待ってから
  依存先の Propose に着手する**。依存先の propose は依存元の実装済み状態を反映する必要があるため
  （未実装の前提で propose すると設計がずれる）。
- 同じ capability のメイン仕様を同期するアーカイブ段が複数あれば、`spec.md` の同時編集を避けるため
  アーカイブを直列化する。

把握した依存関係・着手順序は §6 の報告に含める。

## 5. ユーザー介入は Orca 通知に委ねる（親は自動介入しない）

各 pane の Claude が **ユーザー入力（質問・承認・`decision_gate` 等）を求めて一時停止**すると、**Orca の
画面上でユーザーに通知が行く**。したがって **親（オーケストレーター）が無理に介入（自動 reply）する必要は
ない**。

- 親は `decision_gate` に **勝手に答えない**（ユーザーの判断を奪わない）。`check --wait` で `decision_gate` を
  受けても、`orca orchestration reply` で自動回答せず、ユーザーが Orca 通知経由で対応するのを前提にする。
- 親は他トラックの監視を続け、その pane の `worker_done` が来たら次段へ進む。
- これは [[orca-111-apply-unstarted-changes]]（親が reply する作法）との **明確な差分**。
  本スキルでは「ユーザーに委ねる」方針を採る。
- 例外: `escalation`（worker がオーケストレーターへ明示的にエスカレートした）は握り潰さず、内容を確認して
  対処（順序調整・ユーザーへの報告）する。これはユーザー判断を奪う自動 reply とは別物。

## 6. 報告する

worktree status の設定（worktree 方式の `orca worktree set`）は不要（worktree を作っていない）。

ユーザーへ、着手した各アイデア／change について次を **表**にして報告する:

- change 名（Propose 完了後に確定）。
- 各段（Propose / Apply / アーカイブ）の **pane handle** と **task id**。
- 各段の状態（dispatch 済み・処理中 / worker_done 回収済み / decision_gate でユーザー対応待ち / 失敗）。
- アーカイブ段は `archive/` への移動で完了を決定論的に確認した旨（`ls openspec/changes/archive/ | grep
  <change名>` で `YYYY-MM-DD-<change名>` が出れば移動済み）。

あわせて次も添える:

- §4 で把握した change 間の依存関係と着手順序（直列化した組・並行着手した組）。
- 進捗の追い方（主手段は **バックグラウンドの `orca orchestration check --wait`**、フォールバックは
  `orca terminal show` の title）。
- 全 pane が同一チェックアウトを共有している事実。アーカイブ・実装結果は **未コミットの差分**として
  残っている（コミット／push はプロジェクトのコミット用スキルを使う旨）。
- ユーザー対応待ち（decision_gate）の pane があれば、どの pane で何を聞かれているか（Orca 通知で対応を促す）。

---

## やってはいけないこと

- **メインスレッドで `check --wait` を同期ブロックする**（会話プロセスがロックしてユーザーの断続的な
  アイデアを受けられなくなる。監視はバックグラウンド実行にし、親は応答可能を保つ＝§3 の最重要点）。
- **`heartbeat`（alive）を完了と誤認する**（heartbeat は進捗情報。段遷移のトリガーにしない。完了は
  `worker_done` のみ。`--types` を `worker_done,escalation,decision_gate` に絞る）。
- **`decision_gate` に親が勝手に答えてユーザー判断を奪う**（本スキルはユーザーに委ねる方針。親は自動 reply
  しない。ユーザーが Orca 通知経由で対応する＝§5）。
- 親セッションで propose 執筆 / 実装 / アーカイブを直接やる（並行性が失われ、pane を作る意味が無い。
  親は pane 作成・dispatch・監視・次段起動だけ）。
- **worktree やブランチを作る**（この skill は意図的に worktree を使わない。branch 切替・stash も禁止）。
- 依存関係を把握せずに並行着手する（§4 を飛ばすと共有チェックアウトで衝突する。触るファイルが重なる
  change は直列化し、依存元の Apply 完了を待ってから依存先の Propose に着手する）。
- 前段の pane を使い回して次段を回す（**1段=1pane**。各段で新規 pane を作る）。
- アイデアを理解せずに propose を始める（§1 で AskUserQuestion をオープンエンドで使い、何を作るか
  理解してから着手する）。
- task spec に禁止事項・判断保留・人間への指示伺いを埋め込む（実行させる指示だけ。共有チェックアウト
  保護の git 操作禁止は明示してよい）。Propose 段で change 名の報告指示を省く（後続段で名前が確定できない）。
- `check --wait` のタイムアウトや `{count:0}` を worker 失敗と見なして pane を kill / 再 dispatch する
  （checkpoint として扱い、worker_done / escalation が来るまで rolling に待ち直す）。
- worker の完了を sleep ポーリングだけで判断する（`worker_done` を `check --wait` で構造的に回収する。
  title / terminal read は liveness のフォールバックで completion 判定の主手段にしない）。
- `dispatch --inject` を bare shell の pane に対して使う（agent CLI が起動し `tui-idle` を確認した pane
  のみ。inject 不可なら §0 のフォールバックへ退避する）。
- `dispatch --to` で `terminal split` の戻り handle を使わず **active 任せ**にする（狙った pane に届かない
  ことがある）。
- 連続で素早く split して先発 pane を orphan 化させる（1つずつ `wait` + `show` の writable 確認をしてから
  次を split する）。
- `terminal read` の tail だけ見て「Claude が起動していない／終わった」と判断する（TUI は別バッファ。
  アーカイブ完了は `archive/` 配下の存在で確認する）。
- 失敗した段を黙って飛ばす。pane 作成・dispatch・各段の処理ができなかったものは明示的に報告する。
