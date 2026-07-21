---
name: orca-111-apply-unstarted-changes
description: "個人開発プロジェクトで、未着手の OpenSpec change それぞれに Orca の pane（ターミナル分割）を1つずつ作り、各 pane で Claude エージェントを起動して openspec-apply-change スキルで実装を着手させる一連の手順スキル。worktree は一切作らず、現在のチェックアウト上で 1pane / 1apply で並行着手させる。着手前に change 間の依存関係を把握し、着手後は監視付きディスパッチ（orchestration の check --wait で worker_done/escalation を待つ）で各 change の完了を構造的に回収しながら注意深く進める。未着手 change の判定・依存把握・pane 分割・Claude 起動→タスク化して dispatch --inject・check --wait による完了待ち（title/terminal read ポーリングは liveness フォールバック）・TUI 起動確認の勘所・同一チェックアウト共有の注意・やってはいけないことをまとめる。「未着手の change を着手」「orca で change を apply」「change ごとに pane を作って実装開始」「未着手 change を並行で進める」「change の着手を自動化」等の発話・タスク要求時に使用。引数は不要（未着手 change を自動検出する）。"
---

# 未着手 OpenSpec change を Orca pane で並行着手させる

`openspec/changes/` 配下の **未着手** change を検出し、それぞれに Orca の pane（`orca terminal split`）を
1つ作り、各 pane で Claude エージェントを起動して [[orca-cli]] + `/openspec-apply-change` で実装を着手させる。
親オーケストレーター（このセッション）は **着手させ、監視付きディスパッチで各 change の完了を構造的に待つ**
ところまでが責務で、実装そのものは各 pane の Claude が担う。

**worktree は一切作らない。** すべての pane は **現在のチェックアウト（main 作業ツリー）を共有する**。
ブランチ分離が無いため、複数 change が同じファイルを触ると pane 同士で衝突しうる。だからこそ、
**着手前に change 間の依存関係を把握し（§2.5）、着手後は監視付きディスパッチで各 change の完了を待ちつつ衝突の兆候を巡回する（§6）** ことで
注意深く進める。

関連スキル: pane/terminal 操作の基礎は [[orca-cli]]、worker への dispatch と完了待ち（task-create /
dispatch --inject / check --wait）は [[orchestration]]、実装の中身はプロジェクトの `openspec-apply-change`、
アーカイブ側は [[orca-113-archive-completed-changes]]。

**引数は不要。** 未着手 change はコードベースから自動検出する。

---

## 0. 前提・絶対に守ること

- **このセッション（親）は実装しない。** pane を作り、各 Claude に着手させたら、監視付きディスパッチでの
  完了待ち（§6）に徹する。親が現在のチェックアウトのファイルを編集しない。
- **orchestration の experimental 機能が有効であること**（Settings > Experimental）。本 skill の主手段である
  監視付きディスパッチは `orca orchestration` の dispatch / check --wait に依存する。**着手前に有効かどうかを
  確認する**こと。無効な場合は、§5 の dispatch --inject と §6 の check --wait は使えないので、従来の
  `orca terminal send` でのプロンプト送信＋ title / terminal read ポーリング監視へフォールバックする
  （§6 のフォールバック手順を主監視に格上げして運用する）。
- **dispatch --inject は agent CLI が起動している pane が条件。** §3 で `--command "claude"` 起動し §4 で
  `tui-idle` を確認した pane だけが対象。bare shell の pane には inject できない。
- **branch を切り替えない / stash しない。** この skill は worktree も
  ブランチも作らないので、現在のブランチ・作業ツリーをそのまま使う。
- **全 pane は同一チェックアウトを共有する。** これは worktree 方式との最大の違い。並行着手の前に
  §2.5 で change 間の依存関係を把握し、着手後は §6 で各 pane を巡回して、衝突の兆候を早期に拾う。
- 失敗・スキップは握り潰さない。pane 作成や Claude 起動が失敗したら、その change は着手済みにせず報告する。

---

## 1. 状態を確認する

```bash
orca status --json            # runtime が ready か。未起動なら orca open --json
orca terminal list --json     # 現在 worktree の既存 pane/ターミナル一覧（重複着手の検出に使う）
ls openspec/changes/          # archive を除いた change ディレクトリ一覧
```

worktree も repoId も不要。pane は現在アクティブな worktree（このチェックアウト）に対して作る。
分割の起点にする **base ターミナルの handle** を `orca terminal list --json` から1つ控えておく
（active なものでよい）。

## 2. 未着手 change を判定する

`openspec/changes/<name>/`（`archive/` は除く）のうち、**次をすべて満たすもの**を未着手とみなす:

1. `tasks.md` が存在し、**チェック済み（`- [x]`）タスクが1つも無い**（＝全タスク未着手）。
2. その change 用の **pane がまだ無い**（`orca terminal list` の title に change 名が現れない）。
   Claude は着手後にタブ title を change 名へ書き換えるため（§6）、title で重複着手を検出できる。
   （worktree 方式と違いブランチが無いので、ブランチ存在では判定できない。）

判定は決定論的にコードで行う（grep / terminal list の title 照合）。LLM の主観で「着手済みっぽい」と
判断しない。

```bash
# チェック済みタスクの有無（0 件なら未着手候補）
grep -c '^- \[x\]' openspec/changes/<name>/tasks.md
```

該当が0件なら「未着手の change はありません」と報告して終了する。

## 2.5. 依存関係を把握する

全 pane が同一チェックアウトを共有するため、**着手前に change 間の依存関係を把握する**。各未着手 change の
`design.md` / `tasks.md` / `specs/` デルタを読み、次を洗い出す:

- 各 change が **どのファイル・モジュールを触るか**（重なりがあれば衝突リスク）。
- change 間に **前後関係（A の成果に B が依存する）** があるか。
- 共有スキーマ（例: ORM のスキーマ定義ファイル）・共有設定・マイグレーションなど、**直列化すべき変更**があるか。

把握した結果から、並行着手のグルーピングと順序を決める:

- **触るファイルが重ならない change** は同時に着手してよい。
- **依存・衝突がある change** は、依存元を先に着手し、後続は依存元の進捗を §6 のウォッチで見ながら着手する。
  むやみに本数を絞らず、依存を踏まえて注意深く投入する。

この把握は親（このセッション）の責務であり、ユーザーへ判断を丸投げしない。把握した依存関係は §7 の報告に含める。

## 3. change ごとに pane を作り、Claude を起動する

未着手 change 1つにつき pane を1つ作る（**1 pane / 1 apply**）。`--command "claude"` で分割と同時に
Claude を起動できる:

```bash
# base ターミナル（§1 で控えた handle）を分割し、新 pane で claude を起動
orca terminal split \
  --terminal <base handle> \
  --direction vertical \
  --command "claude" \
  --json
```

**ポイント:**

- `terminal split` の `--json` 出力に **新しい pane の handle** が返る。以降の send / wait はこの handle を
  使う(active 任せにしない。直後に active なのが狙った pane とは限らない)。
- `--direction vertical` は上下分割、`--direction horizontal` は左右分割（直感と逆なので注意）。
- 起点は毎回同じ base handle でよい（同方向に pane が積まれる）。本数が多いと1つ1つが小さくなるので、
  実務上は **同時着手は数本まで**にし、終わった pane を再利用するか順次に切り替える。
- 依存パッケージ（node_modules など）は既存チェックアウトに既にあるため install は不要。worktree 方式の
  `--setup run` / 依存インストール待ちは **この skill では行わない**。

## 4. TUI の起動を待つ

Claude Code は TUI なので `tui-idle` で入力受付状態を検出できる:

```bash
orca terminal wait --terminal <pane handle> --for tui-idle --timeout-ms 120000 --json
```

`tui-idle` が返らない場合は §6 の title 確認で生存を見る。タイムアウトしたら、その change は着手済みに
せず報告する。

## 5. タスク化して dispatch --inject で着手させる

TUI 起動後、change ごとの実装を **orchestration のタスク**にし、`--inject` 付きで pane の Claude へ
dispatch する。`orca terminal send` でプロンプトを直接送る旧来の方式は使わず、この dispatch に一本化する。
`--inject` は task spec に加えて **coordinator preamble**（＝「終わったら親へ `worker_done` を返せ」）を
worker の Claude CLI に注入するため、親は完了を構造的に待てる（§6）。

```bash
# 1) 実装内容をタスク化（spec に着手指示を入れる）。--json の戻りに task id が返る
orca orchestration task-create --spec \
  "OpenSpec change '<change名>' を実装する。/openspec-apply-change スキルを使い、openspec/changes/<change名>/tasks.md のタスクを順に実装する。プロジェクトの開発ルール（コーディング前に考える・各ステップ後のチェックポイント・失敗は大声で報告）に従う。" \
  --json

# 2) §3 の戻り handle（§4 で tui-idle 確認済み）へ inject 付き dispatch
orca orchestration dispatch --task <task_id> --to <pane handle> --inject --json
```

**ポイント:**

- `--inject` は **claude / codex など認識済みの agent CLI が pane で起動している**ことが条件（§0）。bare
  shell の pane には inject できないので、その場合は §0 のフォールバック（terminal send）へ退避する。
- `--to` には §3 の **戻り handle** を渡す（active 任せにしない。狙った pane に dispatch するため）。
- task spec には **着手させる実装指示だけ** を入れる。衝突回避や直列化は親が §2.5 の依存把握と §6 の
  監視で担うものであり、禁止事項や判断保留の指示を spec に埋め込まない。
- dispatch の `--json` 戻りに `dispatchId` が含まれる。worker_done は `taskId` + `dispatchId` で識別されるため、
  複数 change を並行 dispatch しても完了を取り違えない。控えた task id / pane handle は §6・§7 で使う。
- **依存のある後続 change はこの時点では dispatch しない。** §2.5 で依存ありと判断した後続は、依存元の
  `worker_done` を §6 で回収してから dispatch する（波状運用）。

## 6. 監視付きディスパッチで完了を待つ

着手後の監視は **orchestration の `check --wait`** を主手段にする。sleep ポーリングではなく、worker の
完了（`worker_done`）・エスカレーション（`escalation`）・判断要求（`decision_gate`）を構造的に待つ:

```bash
orca orchestration check --wait --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

- `check --wait` は **1件ずつ** メッセージを返す。複数 change を並行 dispatch したなら、各 change の完了を
  **1件ずつ回収する**ため check --wait を繰り返す。`worker_done` を1件回収するたびに、§2.5 で依存ありと
  判断した後続 change を §5 で dispatch する **波状運用**にする。
- `decision_gate`（worker が判断を仰いでいる）が来たら、`orca orchestration reply --id <msg_id>
  --body <回答> --json` で答えてから **待ち続ける**（待ちを終わらせない）。
- **タイムアウトや `{count:0}` は worker 失敗ではなく checkpoint** として扱う。実装は 15〜60 分かかることが
  あるので、worker_done / escalation が来るか、pane が消えるか、ユーザーが止めるまで rolling に
  `check --wait` し直す。勝手に pane を kill / 再 dispatch しない。
- `escalation` が来たら握り潰さず、内容を確認して対処（依存元の完了待ち・順序調整など）する。

**liveness 確認のフォールバック（check --wait が無反応のとき）:** rolling wait が連続で `{count:0}` のとき、
worker が生きているかを title / terminal read で確認する。**`orca terminal read` の `tail` は TUI の代替
スクリーンバッファを拾わない**ため、tail だけ見て「起動していない」と誤判定しないこと。状態確認は
**`orca terminal show` の `title`** を見る（Claude は title を change 名へ書き換え、処理中はスピナー文字
`⠐` `⠂` などが付く）:

```bash
orca terminal show --terminal <pane handle> --json   # title にスピナーが出ていれば稼働中
orca terminal read --terminal <pane handle> --json   # 直近の出力で進捗・衝突の兆候を確認
```

フォールバックで見るべきこと:

- **生存**: title が動いていて出力が進んでいれば生存（＝ `check --wait` に戻って待ち続ける）。これは
  completion 判定の主手段ではなく、check --wait の補助である（orchestration が無効な環境ではこれが主監視）。
- **衝突の兆候**: §2.5 で依存ありと判断した change 同士が同じファイルに到達していないか、エラーや
  予期せぬ diff が出ていないか。兆候があれば、依存元の完了を待って後続を着手するなど順序を調整する。

異常を見つけたら握り潰さず報告する。

## 7. 報告する

worktree status の設定（worktree 方式の `orca worktree set`）は **不要**（worktree を作っていない）。

最後にユーザーへ、着手させた change・対応する pane handle・task id・状態（worker_done 回収済み / 着手中 /
失敗）を表にして報告する。あわせて、§2.5 で把握した change 間の依存関係と着手順序、進捗の追い方
（主手段は `orca orchestration check --wait`、フォールバックは `orca terminal show` /
`orca terminal read`）、全 pane が同一チェックアウトを共有している事実も添える。

---

## やってはいけないこと

- 親セッションで change を直接実装する（並行性が失われ、pane を作る意味が無い）。
- worktree やブランチを作る（この skill は意図的に worktree を使わない。worktree 方式が必要なら別運用）。
- 依存関係を把握せずに並行着手する（§2.5 を飛ばすと共有チェックアウトで衝突する）。
- task spec に禁止事項・判断保留・人間への指示伺いを埋め込む（着手させる指示だけにする。衝突回避は
  親が依存把握と監視付きディスパッチで担う）。
- `check --wait` のタイムアウトや `{count:0}` を worker 失敗と見なして pane を kill / 再 dispatch する
  （checkpoint として扱い、worker_done / escalation が来るまで rolling に待ち直す）。
- worker の完了を sleep ポーリングだけで判断する（worker_done を `check --wait` で構造的に回収する。
  title / terminal read は liveness のフォールバックであり completion 判定の主手段にしない）。
- `dispatch --inject` を bare shell の pane に対して使う（agent CLI が起動し `tui-idle` を確認した pane
  のみ。inject 不可なら §0 のフォールバックへ退避する）。
- `dispatch --to` で `terminal split` の戻り handle を使わず active 任せにする（狙った pane に届かない
  ことがある）。
- `terminal read` の tail だけ見て「Claude が起動していない」と判断する（TUI は別バッファ）。
- 未着手判定を LLM の主観でやる（grep と terminal list の title で決定論的に判定する）。
- 失敗した change を黙って飛ばす。着手できなかったものは明示的に報告する。
