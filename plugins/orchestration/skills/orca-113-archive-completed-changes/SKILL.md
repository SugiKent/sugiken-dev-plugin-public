---
name: orca-113-archive-completed-changes
description: "個人開発プロジェクトで、tasks.md が完了している（全タスクが `- [x]`）OpenSpec change それぞれに Orca の pane（ターミナル分割）を1つずつ作り、各 pane で Claude エージェントを起動して /opsx:archive スキルでアーカイブまで完了させる一連の手順スキル。worktree は一切作らず、現在のチェックアウト上で 1pane / 1archive で並行アーカイブさせる。完了 change の判定（tasks.md 全 [x]）・pane 分割・Claude 起動→タスク化して dispatch --inject・監視付きディスパッチ（orchestration の check --wait で worker_done を待ち、archive/ への移動で最終確認）・確認待ちでブロックさせない指示・同一チェックアウト共有の注意・やってはいけないことをまとめる。「完了した change を archive」「tasks.md が完了している change を opsx:archive」「change ごとに pane を作って archive」「完了 change を並行でアーカイブ」「change のアーカイブを自動化」等の発話・タスク要求時に使用。引数は不要（完了 change を自動検出する）。"
---

# tasks.md 完了済み OpenSpec change を Orca pane で並行アーカイブする

`openspec/changes/` 配下の **tasks.md が完了している（全タスクが `- [x]`）** change を検出し、それぞれに
Orca の pane（`orca terminal split`）を1つ作り、各 pane で Claude エージェントを起動して [[orca-cli]] +
`/opsx:archive` でアーカイブまで完了させる。親オーケストレーター（このセッション）は **アーカイブさせ、
監視付きディスパッチで各 change のアーカイブ完了を構造的に検知する** ところまでが責務で、アーカイブ
そのもの（デルタ仕様同期 + `mv`）は各 pane の Claude が担う。

着手側の [[orca-111-apply-unstarted-changes]] と対をなす **アーカイブ側**。pane 運用・
shared checkout・監視付きディスパッチの前提はそちらと同じ。

**worktree は一切作らない。** すべての pane は **現在のチェックアウト（main 作業ツリー）を共有する**。

関連スキル: pane/terminal 操作の基礎は [[orca-cli]]、worker への dispatch と完了待ち（task-create /
dispatch --inject / check --wait）は [[orchestration]]、アーカイブの中身はプロジェクトの
`openspec-archive-change`（= `/opsx:archive`）、着手側は
[[orca-111-apply-unstarted-changes]]。

**引数は不要。** 完了 change はコードベースから自動検出する。

---

## 0. 前提・絶対に守ること

- **このセッション（親）はアーカイブしない。** pane を作り、各 Claude に archive させたら、監視付き
  ディスパッチでの完了検知（§6）に徹する。親が現在のチェックアウトのファイルを編集したり `mv` したりしない。
- **orchestration の experimental 機能が有効であること**（Settings > Experimental）。本 skill の主手段である
  監視付きディスパッチは `orca orchestration` の dispatch / check --wait に依存する。**着手前に有効かどうかを
  確認する**こと。無効な場合は、§5 の dispatch --inject と §6 の check --wait は使えないので、従来の
  `orca terminal send` でのプロンプト送信＋ title / `archive/` 配下のポーリング監視へフォールバックする。
- **dispatch --inject は agent CLI が起動している pane が条件。** §3 で `--command "claude"` 起動し §4 で
  `tui-idle` を確認した pane だけが対象。bare shell の pane には inject できない。
- **アーカイブが完了した pane は閉じる。** change ディレクトリが `archive/` へ移動した（＝決定論的に完了確認できた）
  pane は、親が `orca terminal close` で閉じて後片付けする（§7）。自分（オーケストレーター）や無関係な既存
  pane は絶対に閉じない。
- **branch を切り替えない / stash しない。** この skill は worktree も
  ブランチも作らないので、現在のブランチ・作業ツリーをそのまま使う。
- **全 pane は同一チェックアウトを共有する。** `/opsx:archive` はデルタ仕様を `openspec/specs/<capability>/spec.md`
  へ同期してから change ディレクトリを `archive/` へ `mv` する。
  - 並行アーカイブする change は、**互いに同期するメイン仕様（同じ capability）が重ならない**ことを
    前提にする。同じ capability を触る change が複数あれば、その旨を報告し、同時に走らせる本数を絞るか
    順次にする判断をユーザーに委ねる（`spec.md` の同時編集で取りこぼし／衝突が起きる）。
  - 各 Claude が `git` の add/commit/checkout を勝手にやると他 pane を巻き込むので、archive プロンプトで
    **コミット・ブランチ操作はしない**よう明示する（§5）。アーカイブ結果は未コミット差分として残る。
- **完了判定は tasks.md ベースで決定論的に行う。** 「完了してそう」を LLM の主観で決めない（§2）。
- 失敗・スキップは握り潰さない。pane 作成・Claude 起動・アーカイブが失敗したら、その change は
  アーカイブ済みにせず報告する。

---

## 1. 状態を確認する

```bash
orca status --json            # runtime が ready か。未起動なら orca open --json
orca terminal list --json     # 現在 worktree の既存 pane/ターミナル一覧（重複アーカイブの検出に使う）
ls openspec/changes/          # archive を除いた change ディレクトリ一覧
```

worktree も repoId も不要。pane は現在アクティブな worktree（このチェックアウト）に対して作る。

**分割は「現在開いているタブ」の中で行う。** `orca terminal split --terminal <handle>` は指定した handle が
属するタブの中に新しい pane を作るため、base handle には **現在アクティブなタブのアクティブ端末** を選ぶ。
新しいタブは作らない。`orca terminal list --json` の `visualLayouts` から、このチェックアウト
（`worktreePath` が現在の作業ツリー）の `activeTabId` を見つけ、その `activeTabId` に一致する tab の
アクティブな pane の `handle` を base として控える。

```bash
# 現在の作業ツリーで開いているタブ(activeTabId)のアクティブ pane handle を取り出す
orca terminal list --json | jq -r --arg wt "$PWD" '
  .result.visualLayouts[] | select(.worktreePath == $wt) as $l
  | $l.root.tabs[]? // $l.root
  | select(.tabId == $l.root.activeTabId)
  | (.panes.handle // .activeLeafId)'
```

`jq` の構造が環境で違う場合は `orca terminal list --json` を読み、`visualLayouts` 内で現在の
`worktreePath` を持つレイアウトの `activeTabId` と一致する tab の pane handle を目視で1つ選ぶ。
**この base handle で行う split はすべて同じタブ内に積まれる**ので、毎回同じ base を使ってよい。

## 2. 完了済み change を判定する

`openspec/changes/<name>/`（`archive/` は除く）のうち、**次をすべて満たすもの**を完了済みとみなす:

1. `tasks.md` が存在し、**未チェック（`- [ ]`）タスクが0件**かつ **チェック済み（`- [x]`）タスクが
   1件以上**（＝タスクがあって全部終わっている）。
2. その change 用の **pane がまだ無い**（`orca terminal list` の title に change 名が現れない）。
   Claude はアーカイブ着手後にタブ title を change 名へ書き換えるため（§6）、title で重複アーカイブを
   検出できる。

```bash
# 完了判定（unchecked が 0 かつ checked が 1 以上なら完了候補）
grep -c '^- \[ \]' openspec/changes/<name>/tasks.md   # 0 であること
grep -c '^- \[x\]' openspec/changes/<name>/tasks.md   # 1 以上であること
```

判定は決定論的にコードで行う（grep / terminal list の title 照合）。LLM の主観で判断しない。
該当が0件なら「アーカイブ対象（tasks.md 完了済み）の change はありません」と報告して終了する。

> 補足: `/opsx:archive` 側は `openspec status --change` で**成果物**の完了状態も確認するが、未完了でも
> 警告を出すだけでブロックしない。このスキルの親側の選別は **tasks.md の完了** を
> 基準にする。成果物が未完了な change が混ざりうる点は §8 で報告に含める。

## 3. change ごとに pane を作り、Claude を起動する

完了 change 1つにつき pane を1つ作る（**1 pane / 1 archive**）。`--command "claude"` で分割と同時に
Claude を起動できる:

```bash
orca terminal split \
  --terminal <base handle> \
  --direction vertical \
  --command "claude" \
  --json
```

**ポイント:**

- `--terminal` には §1 で控えた **現在開いているタブのアクティブ端末 handle** を渡す。新 pane はその
  タブの中に作られる。**新しいタブを作らない**（`orca terminal new` などは使わない）。
- `terminal split` の `--json` 出力に **新しい pane の handle** が返る。以降の send / wait はこの handle を
  使う（active 任せにしない。直後に active なのが狙った pane とは限らない）。
- `--direction vertical` は上下分割、`--direction horizontal` は左右分割（直感と逆なので注意）。
- 起点は毎回同じ base handle でよい（すべて同じ＝現在開いているタブ内に積まれる）。本数が多いと1つ1つが
  小さくなるので、実務上は **同時アーカイブは数本まで** にし、終わった pane を再利用するか順次に切り替える。
  アーカイブ自体は短時間で終わる。
- **pane は1つずつ作り、`wait`（§4）+ `show` で `writable: true` を確認してから次を split する。** 同じ
  base へ連続で素早く split すると、先に作った pane が `connected: false / writable: false /
  paneRuntimeId: -1` の **orphan（送信不可）になって `terminal list` から消える**ことがある。orphan は
  `send` できないので作り直す。戻り handle ごとに writable を確認すれば確実。
- 依存パッケージ（node_modules など）は既存チェックアウトに既にあるため install は不要。

## 4. TUI の起動を待つ

Claude Code は TUI なので `tui-idle` で入力受付状態を検出できる:

```bash
orca terminal wait --terminal <pane handle> --for tui-idle --timeout-ms 120000 --json
```

`tui-idle` が返らない場合は §6 の title 確認で生存を見る。タイムアウトしたら、その change は
アーカイブ済みにせず報告する。

## 5. タスク化して dispatch --inject でアーカイブさせる

TUI 起動後、change ごとのアーカイブを **orchestration のタスク**にし、`--inject` 付きで pane の Claude へ
dispatch する。`orca terminal send` でプロンプトを直接送る旧来の方式は使わず、この dispatch に一本化する。
`--inject` は task spec に加えて **coordinator preamble**（＝「終わったら親へ `worker_done` を返せ」）を
worker の Claude CLI に注入するため、親はアーカイブ完了を構造的に検知できる（§6）。

```bash
# 1) アーカイブ内容をタスク化（spec に下記の必須 3 点を入れる）。--json の戻りに task id が返る
orca orchestration task-create --spec \
  "OpenSpec change '<change名>' をアーカイブする。/opsx:archive スキルを change 名 '<change名>' を指定して実行する。この change は tasks.md が完了済み。デルタ仕様が存在する場合は『今すぐ同期する』を選んでメイン仕様へ同期した上でアーカイブまで完了させ、確認のために処理を止めない（AskUserQuestion で止まらず自分で同期して進める）。この作業は worktree ではなく共有チェックアウト上で他の change と並行で進むため、git のブランチ切り替え・commit・stash は行わない（アーカイブ結果は未コミット差分のまま残してよい）。" \
  --json

# 2) §3 の戻り handle（§4 で tui-idle 確認済み）へ inject 付き dispatch
orca orchestration dispatch --task <task_id> --to <pane handle> --inject --json
```

> **spec に必ず含める3点:** (1) change 名を指定して選択プロンプトをスキップさせる、(2) デルタ仕様同期の
> 確認で AskUserQuestion に止まらず自分で「今すぐ同期する」を選んで進めさせる、(3) 共有チェックアウトを
> 守るため **ブランチ/commit/stash 禁止**。(1)(2) を書かないと worker が入力待ちで固まる。

**ポイント:**

- `--inject` は **claude / codex など認識済みの agent CLI が pane で起動している**ことが条件（§0）。bare
  shell の pane には inject できないので、その場合は §0 のフォールバック（terminal send）へ退避する。
- `--to` には §3 の **戻り handle** を渡す（active 任せにしない。狙った pane に dispatch するため）。
- dispatch の `--json` 戻りに `dispatchId` が含まれる。worker_done は `taskId` + `dispatchId` で識別される
  ため、複数 change を並行 dispatch しても完了を取り違えない。控えた task id / pane handle は §6・§7 で使う。

## 6. 監視付きディスパッチでアーカイブ完了を検知する

アーカイブ完了の検知は **orchestration の `check --wait`** を主手段にする。sleep ポーリングではなく、
worker の完了（`worker_done`）・エスカレーション（`escalation`）・判断要求（`decision_gate`）を構造的に待つ:

```bash
orca orchestration check --wait --types worker_done,escalation,decision_gate --timeout-ms 900000 --json
```

- `check --wait` は **1件ずつ** メッセージを返す。複数 change を並行 dispatch したなら、各 change の
  アーカイブ完了を **1件ずつ回収する**ため check --wait を繰り返す。
- `decision_gate`（worker が同期確認などで判断を仰いでいる）が来たら、`orca orchestration reply --id
  <msg_id> --body <回答> --json` で答えてから **待ち続ける**。§5 で spec に「自分で同期して進める」を
  入れていれば通常は gate を出さずに進むが、出た場合はここで答える。
- **タイムアウトや `{count:0}` は worker 失敗ではなく checkpoint** として扱い、worker_done / escalation が
  来るか pane が消えるまで rolling に `check --wait` し直す。勝手に pane を kill / 再 dispatch しない。
- `escalation` が来たら握り潰さず、内容を確認して対処する。

**worker_done は最終確認ではない。** worker_done を回収したら、アーカイブが本当に成立したかを
**change ディレクトリが `openspec/changes/archive/YYYY-MM-DD-<name>/` へ移動した**ことで決定論的に確認する
（これが §7 で pane を閉じてよい唯一の根拠）:

```bash
ls openspec/changes/ | grep -q '<change名>' && echo "まだ移動していない" || echo "changes 直下から消えた"
ls openspec/changes/archive/ | grep '<change名>'   # YYYY-MM-DD-<change名> が出れば移動済み
```

**liveness 確認のフォールバック（check --wait が無反応のとき）:** rolling wait が連続で `{count:0}` のとき、
worker が生きているかを title で確認する。**`orca terminal read` の `tail` は TUI の代替スクリーンバッファを
拾わない**ため、tail だけ見て「起動していない／終わった」と誤判定しないこと。状態確認は
**`orca terminal show` の `title`** を見る（処理中はスピナー文字 `⠐` `⠂` が付く）。これは completion 判定の
主手段ではなく、check --wait の補助である（orchestration が無効な環境ではこれと `archive/` 配下確認が主監視）:

```bash
orca terminal show --terminal <pane handle> --json   # title に change 名 + スピナーが出ていれば稼働中
```

## 7. アーカイブ完了後に pane を閉じる

§6 で **change ディレクトリが `archive/YYYY-MM-DD-<name>/` へ移動したことを決定論的に確認できた** pane は、
親が閉じて後片付けする。閉じるのは **アーカイブ済みを確認できた pane だけ**:

```bash
orca terminal close --terminal <pane handle> --json   # PTY ごと閉じる
```

**注意点:**

- 閉じる前に必ず `archive/` 配下の存在で完了を確認する。`title` のスピナーが消えただけ／`tui-idle` だけでは
  閉じない（同期途中の idle がありうる）。**移動が確認できていない pane は閉じず §8 で報告する**。
- `orca terminal close` は **PTY ごと kill する**。アーカイブ結果（`mv` と `openspec/specs/` 同期）は
  既にディスクに反映済みなので、閉じてもアーカイブ成果は失われない。
- **自分（オーケストレーターの pane）・他セッションの Claude・無関係な既存 pane を絶対に閉じない。**
  閉じてよいのは §3 でこの skill 自身が `split` して作った pane の handle のみ（戻り handle を控えておく）。
- pane を再利用して順次アーカイブした場合（§3 の「終わった pane を再利用」）は、その pane で担当した
  **全 change のアーカイブが終わってから** 最後に閉じる。
- 閉じたら `orca terminal list` で当該 handle が消えたことを確認する。

## 8. 報告する

worktree status の設定（worktree 方式の `orca worktree set`）は **不要**（worktree を作っていない）。

最後にユーザーへ、アーカイブさせた change・対応する pane handle・状態（移動済み&pane クローズ済み /
移動済みだが pane 未クローズ / 処理中 / 失敗）を表にして報告する。次の点も添える:

- 進捗の追い方（主手段は `orca orchestration check --wait`、フォールバックは `orca terminal show` /
  上記の `archive/` 配下確認）。pane handle に加え task id も控えておく。
- 全 pane が同一チェックアウトを共有している事実（同じ capability の spec 同時同期に注意）。
- アーカイブ結果は **未コミットの差分**として残っている（change ディレクトリの `mv` + `openspec/specs/`
  への同期）。コミット／push したい場合はそれが別作業である旨。
- `/opsx:archive` の成果物チェックで未完了警告が出た change があれば、その内容（黙ってアーカイブしない）。

---

## やってはいけないこと

- 親セッションで change を直接アーカイブする（並行性が失われ、pane を作る意味が無い）。
- worktree やブランチを作る（この skill は意図的に worktree を使わない）。
- 新しいタブを作る／別タブの端末を base に split する（pane は **現在開いているタブの中** に作る。
  base handle は §1 で控えた現在アクティブなタブのアクティブ端末を使う）。
- 同じ capability のメイン仕様を同期する change を無確認で同時に走らせる（共有チェックアウトの
  `openspec/specs/<capability>/spec.md` を同時編集して取りこぼす）。
- 各 pane の Claude に git commit / branch 切り替え / stash をさせる（他 pane を巻き込む）。
- task spec で **change 名の指定**と **同期確認を自分で進める指示**を省く（pane が
  AskUserQuestion の入力待ちで固まる）。
- `check --wait` のタイムアウトや `{count:0}` を worker 失敗と見なして pane を kill / 再 dispatch する
  （checkpoint として扱い、worker_done / escalation が来るまで rolling に待ち直す）。
- `worker_done` を受けただけで pane を閉じる（worker_done は完了報告であって最終確認ではない。閉じてよいのは
  `archive/` への移動を確認できた pane だけ＝§7）。
- `dispatch --inject` を bare shell の pane に対して使う（agent CLI が起動し `tui-idle` を確認した pane
  のみ。inject 不可なら §0 のフォールバックへ退避する）。
- `dispatch --to` で `terminal split` の戻り handle を使わず active 任せにする（狙った pane に届かない
  ことがある）。
- `terminal read` の tail だけ見て「Claude が起動していない／終わった」と判断する（TUI は別バッファ。
  完了は `archive/` 配下の存在で確認する）。
- アーカイブ完了（`archive/` への移動）を確認できていない pane を `terminal close` で閉じる（同期途中で
  kill すると取りこぼす）。移動を確認できた pane だけ閉じる（§7）。
- 自分（オーケストレーター）の pane・他セッションの Claude・無関係な既存 pane を閉じる（閉じてよいのは
  この skill が `split` で作った pane の handle のみ）。
- アーカイブ完了後も pane を開きっぱなしで放置する（完了 pane は §7 で閉じて後片付けする）。
- 完了判定を LLM の主観でやる（grep と terminal list の title で決定論的に判定する）。
- 失敗した change や成果物未完了の警告を黙って飛ばす。アーカイブできなかったもの・警告は明示的に報告する。
