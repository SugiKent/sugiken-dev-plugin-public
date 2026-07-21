---
name: 110-implement-all-openspec-changes
description: "単一の Claude Code セッションで、openspec/changes 配下のすべての承認済み OpenSpec change を最後まで実装しきるためのオーケストレーションスキル。apply のたびに change 専属の apply SubAgent を 1 つ起動し、その SubAgent がさらに専門サブエージェント（apply-frontend / apply-backend で実装、apply-review で多段レビュー）を従え、E2E は 40-run-and-report-e2e skill を直接 invoke して 1 change を完遂する。完了後は apply-archive / apply-commit の専用サブエージェントで archive・commit する。最後に docs/e2e_case.md の全ケースがグリーンになり、結合レビューで OK が出るまで再帰的にブラッシュアップする。「openspec を全部実装」「changes を実装しきる」「MVP 全実装」「apply を回しきる」「全 change archive まで」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Agent, Skill, AskUserQuestion, mcp__codex__codex, mcp__codex__codex-reply
---

# OpenSpec Changes 完全実装スキル

`openspec/changes/` 配下に並んでいる **change をすべて、単一の Claude Code セッションで実装しきる** ためのスキル。

あなたは最上位の **オーケストレーター** に徹する。手は動かさない。**apply のたびに change 専属の apply SubAgent を 1 つ起動** し、実装・レビュー・E2E・archive・commit はすべて下位の専門サブエージェントに委ねる。あなた自身のコンテキストは常にクリーンに保つ。

## 専門サブエージェント（このスキルの実行部隊）

実装から commit までを、役割ごとに分けた専門サブエージェント（`orchestration` plugin の `agents/`、および `architect` plugin の `agents/`）へ委譲する。各サブエージェントは対応するスキルを読み込んで動くため、方針の重複記述はしない。

| サブエージェント | model | 役割 | 参照スキル |
|-----------------|-------|------|-----------|
| `apply-frontend` | sonnet | フロント実装（画面 / コンポーネント / クライアント状態） | `frontend-implementation` |
| `apply-backend` | opus | バックエンド実装（API / Service / Repository / スキーマ / migration） | `backend-implementation` |
| `apply-review` | opus | **多段レビュー統括**（配下で architect-* を pop して集約） | architect 各スキル |
| `apply-archive` | sonnet | change の archive と `openspec validate --strict` | `.claude/commands/openspec/archive.md` |
| `apply-commit` | sonnet | 意味のある単位での外科的コミット | `20-commit-meaningful-diffs`（basic plugin） |

> **E2E の実行・報告は agent ではなく skill 直接 invoke**。`40-run-and-report-e2e` skill（e2e plugin, `model: sonnet` + `context: fork`）を invoke すると、skill 自身が subagent へ fork してヘッドレス実行・報告する。専用の e2e agent は挟まない（二重 fork を避けるため）。

## 役割分担の大原則

- **実装は apply-frontend / apply-backend が担う**。フロントは sonnet、バックエンドは opus。write スコープが重ならなければ同時起動して並列実装する。
- **レビューは apply-review が多段で担う**。apply-review は自分では完結させず、配下で `architect-code-review` / `architect-principle` / `architect-security` / `architect-db-design` / `architect-doubt-driven-development` を pop し、各観点を集約して品質ゲートを判定する。
- **E2E（実行系）は `40-run-and-report-e2e` skill の直接 invoke で担う**。この skill は `context: fork` / `model: sonnet` を持ち、invoke すると自己 fork して subagent 内でヘッドレス実行・報告する。Codex はポート制限で Playwright を実行できないため、E2E は必ずこの Claude subagent が実行する。skill は **実行と報告に専念し、修正はしない**（修正は apply SubAgent が実装側で行う）。
- **archive は apply-archive、commit は apply-commit** が担う。あなた自身では archive も commit もしない。
- **Codex（Codex MCP / Codex CLI fugu）は実装の任意アクセラレータ**。apply-frontend / apply-backend が、Playwright・ブラウザ操作を伴わないアプリコード実装の補助として使ってよい。レビューの本線は apply-review であり、Codex はレビューの主役ではない。使った経路は報告に明記する。

## 最終ゴール（最上位の成功条件）

**最終ゴール**: すべての change が `archive` され、`openspec validate --strict` がグリーンで、`docs/e2e_case.md`（ユーザー指定の `docs/e2e_cases.md` に相当する現行ファイル）の **すべての E2E ケースがグリーン** になり、最終的に結合レビューで **OK が出る** こと。

> `docs/e2e_case.md` の全ケース緑化は、このスキルの最終的な合格ラインである。change 単位の完了や archive だけで完了扱いにしてはいけない。

---

## 多段（ツリー）構造 — このスキルの核心

Claude Code の **ネスト SubAgent**（v2.1.172 以降）を活用し、以下のツリーを各 change ごとに構築する。ネストには 2 つの制約があり、このスキルはそれを満たすように設計されている。

- **子を起動する中間ノードは `tools` に `Agent` を持つ必要がある**。このスキルでは apply SubAgent は Agent ツールを持つ型（`general-purpose` 等）で起動し、`apply-review` は frontmatter で `tools: ... Agent` を明示している。
- **ネストの深さ上限は 5（固定）**。このツリーの最深経路は `main(0) → apply(1) → apply-review(2) → architect-*(3)` で深さ 3。上限内に収まっている。これ以上段を増やさない。

```
あなた（最上位オーケストレーター）
└─ apply SubAgent ★change ごとに 1 つ起動（apply のたびに必ず起動する）
   ├─ apply-frontend（sonnet） … フロント実装
   ├─ apply-backend（opus） … バックエンド実装
   ├─ apply-review（opus） … 多段レビュー統括
   │    ├─ architect-code-review（opus）
   │    ├─ architect-principle（opus）
   │    ├─ architect-security（opus）
   │    ├─ architect-db-design（opus）
   │    └─ architect-doubt-driven-development（opus）
   └─ /40-run-and-report-e2e（skill 直接 invoke → 自己 fork/sonnet） … E2E 実行・報告（修正なし）

apply SubAgent が「完了」を報告したら、あなた（最上位）が回収して:
   ├─ 完了確認 SubAgent … tasks.md と E2E 結果の検証
   ├─ apply-archive（sonnet） … archive + validate --strict
   └─ apply-commit（sonnet） … 意味のある単位でコミット
```

- **あなた（最上位）の責務**: 実装順序の決定 / apply SubAgent の起動と監督 / **完了確認・archive（apply-archive）・commit（apply-commit）の委譲と回収** / 結合レビュー / 報告。完了確認・archive・commit は自分の手で行わず、必ず下位サブエージェントに任せる。
- **apply SubAgent の責務**: 1 つの change を完遂する小オーケストレーター。実装を apply-frontend / apply-backend に委譲し、apply-review でレビューを承認まで再帰させ、`40-run-and-report-e2e` skill を invoke して E2E を回し結果を回収し、失敗があれば実装側を直して再 invoke する。「実装完了・レビュー承認・対応 E2E 緑」まで持っていく。
- **完了確認 SubAgent の責務**: apply SubAgent の報告を受けて `tasks.md` と E2E 結果を検証し、満たさなければ不足点を返す。
- **apply-review の責務**: 配下の architect サブエージェントを起動して各観点のレビューを集約し、承認 / 変更要求を判定する。修正はしない。
- **`40-run-and-report-e2e` skill の責務**: 自己 fork した subagent で E2E をヘッドレス実行し、結果と失敗原因の見立てを返す。実装・テストの修正はしない。

> apply のたびに SubAgent を起動するのが鉄則。あなたが直接アプリ実装・レビュー・E2E・archive・commit をやってはいけない。

---

## 前提：先に読むもの（あなた自身が読む）

実装を始める前に、あなた自身が以下を頭に入れる。委譲はしない（順序判断の土台になるため）。

| 何を | パス | 用途 |
|------|------|------|
| 実装順序の素案 | `docs/MVP_IMPL_TASKS.md` | 章・Wave・依存関係の大枠 |
| OpenSpec の規約 | `openspec/AGENTS.md` | apply / archive / validate の正本 |
| apply の手順 | `.claude/commands/openspec/apply.md` | 1 change を実装する標準手順（**apply SubAgent に必ず参照させる**） |
| 仕様の正本 | `docs/initial_plan.md` / `docs/ARCHITECTURE.md` / `docs/DESIGN.MD` + `docs/design-sample.png` / `docs/e2e_case.md` | 機能 / 技術 / デザイン / 受け入れ基準 |

各専門サブエージェントが読むスキル（`frontend-implementation` / `backend-implementation` / architect 各スキル / `40-run-and-report-e2e` / `20-commit-meaningful-diffs` / archive.md）は、各サブエージェント側で読むため、あなたが精読する必要はない。

> Proposal スキルは使わない（提案は完成済み前提）。使うのは **Apply** と **Archive** のみ。

### Codex（任意の実装アクセラレータ）

apply-frontend / apply-backend は、Playwright・アプリ起動・ブラウザ操作を伴わない **アプリコード実装** の補助として Codex を使ってよい。第一選択は Codex MCP（`mcp__codex__codex` / `mcp__codex__codex-reply`）、第二選択は Codex CLI の `fugu` profile。

```bash
# 非対話実行（fugu profile = 別系統の高性能モデル）
codex exec -p fugu -C . "アプリコード実装の依頼をここに書く"

# 長い依頼 / 結果をファイル回収する場合
mkdir -p tmp/codex-results
cat <<'PROMPT' | codex exec -p fugu -C . -o tmp/codex-results/<CHANGE_ID>-codex.md -
<実装依頼。Playwright・実行系は依頼しない>
PROMPT
```

Codex は **実行系（E2E・ブラウザ）を担当できない**。レビューの本線は apply-review。Codex を使ったかどうか（MCP / fugu / 不使用）は報告に明記する。

---

## 全体フロー

```
Phase 0  全 change の把握（Codex の利用可否確認を含む）
Phase 1  実装順序の確定（依存グラフ / Wave 分割）
Phase 2  change ごとに apply SubAgent を起動（多段ツリーで 1 change 完遂）
           → 戻ってきたら 完了確認 SubAgent → apply-archive → apply-commit
Phase 3  全 change 完了後の結合レビュー（再帰・OK が出るまで）
Phase 4  報告
```

---

## Phase 0: 全 change の把握

1. `openspec list` で残っている change と進捗（`N/M tasks`）を一覧化する。
2. **Codex の利用可否を確認**する（実装アクセラレータの確認）。`mcp__codex__codex` が使えるか、使えなければ `codex exec -p fugu -C . "..."` が使えるかを確認し、apply SubAgent に伝える。どちらも使えなければ apply-frontend / apply-backend は自前実装のみで進める。**E2E（Playwright 実行）は最初から `40-run-and-report-e2e` skill（自己 fork）が担当**する前提にする。
3. 「前提」のドキュメントを読み、技術スタック・デザイン方針・受け入れ基準を把握する。
4. 各 change の `proposal.md` / `tasks.md` の **タイトルと Impact だけ** を軽く見て依存関係の手掛かりを集める（中身の精読は apply SubAgent とその配下に任せる。深掘りでコンテキストを潰さない）。
5. change ごとの依存関係と write スコープを把握し、**同時に着手できる change 群** を洗い出す。共有基盤・DB スキーマ・共通 UI・認証認可・同一ファイル編集などの依存や競合があるものは直列にし、競合しないものは同一 Wave の並列候補にする。

---

## Phase 1: 実装順序の確定

`docs/MVP_IMPL_TASKS.md` の章・Wave 構造を **正の素案** とし、`openspec list` の change ID と突き合わせて実装順序を確定する。最終的な順序は **あなたが判断して決める**（素案に盲従しない）。このとき change ごとの依存関係を明示的に整理し、直列ブロックと並列 Wave に分ける。

### 原則

- **土台は逐次**: 共有依存（モノレポ基盤・Prisma スキーマ・org スコープ機構・認証認可・共通 UI・E2E ハーネス）を持つ change は 1 つずつ直列に実装する。前段が緑になるまで次へ進まない。
- **Wave 内は並列可、可能なら同時起動する**: write スコープ（ファイル / モジュール）が重ならず、前後依存もない change は、同一 Wave 内で複数の apply SubAgent を同時に立てて並列実装する。依存関係上安全な change 群はまとめて起動する。
- **依存を跨ぐ並列は禁止**: 後段 Wave は前段 Wave が archive されるまで着手しない。
- `MVP_IMPL_TASKS.md` の Wave 対応（典型例。実際の ID は `openspec list` で確認）:
  - 逐次土台: 基盤 → 開発 CLI → データ基盤 → テナント/oRPC → mailer/storage・UI/E2E 基盤 → 認証・認可
  - Wave A（並列）: 資格マスタ / 求人管理 / メール設定
  - Wave B（並列）: 公開応募フォーム / 候補者管理
  - Wave C（並列）: 選考・評価 / 日程調整 / 社内コメント / 内定者管理
  - Wave D（並列）: レポート / ダッシュボード
  - Wave E（逐次・総仕上げ）: 長尺ライフサイクル / 空状態網羅 / 異常系・セキュリティ横断

### 成果物

実装順序（直列ブロックと並列 Wave）を作業メモとして確定させる。各 Wave には、同時起動する apply SubAgent の change ID、所有スコープ、並列可能と判断した理由、直列に残した理由を記録する。これが Phase 2 のスケジュールになる。

---

## Phase 2: change ごとに apply SubAgent を起動

実装順序に従い、change ごとに **apply SubAgent を 1 つずつ起動**する。Wave 内で依存関係と write スコープが衝突しない change が複数あれば、**複数の apply SubAgent を同時に起動**して並列実装に取り組む。あなたは起動と回収・監督に徹する。

### 2-1. apply SubAgent への委譲指示（必ず含める）

apply SubAgent には「1 change を完遂する小オーケストレーター」として振る舞わせる。**apply SubAgent は配下の専門サブエージェント（apply-frontend / apply-backend / apply-review）を起動し、さらに `40-run-and-report-e2e` skill を invoke する必要があるため、Agent ツールと Skill ツールを持つ型（`general-purpose` など）で起動する**（型を制限して Agent / Skill を落とすと多段・E2E が黙って壊れる）。委譲メッセージに以下を必ず含める。

- 対象 change ID と、`.claude/commands/openspec/apply.md` に従って実装する旨。
- **所有スコープ（write 範囲）の明示**: この change が縦に所有するファイル / モジュール / ルート群（API・Service/Repository・画面）。フロント範囲とバックエンド範囲を区別して渡す。
- **「あなたは 1 人ではない」警告**: 他の apply SubAgent / 配下の実装サブエージェントが並列で作業している。他者の編集を巻き戻さず、衝突は自分側で吸収する。共有変更（スキーマ追加等）は土台へ寄せ、波の途中で他スライスを書き換えない。
- **配下の専門サブエージェント / E2E skill を使う指示**（下記 2-2 を委譲文に展開して渡す）。
- **tasks.md は一度の apply で完了させる**: ユニットテスト・静的解析・DB migration（ORM の正当な手段で実行まで）も含め、完了できるものは全て完了。人間作業が必要なタスクのみ理由付きで残す。
- **E2E ハートビート遵守**: `40-run-and-report-e2e` skill が定める規約どおり、E2E 実行直前に `E2E_HERTBEAT.md` へ記述を書き込み、完了後に必ず消す。**他に記述があるときは E2E を実行しない**。中途半端な記述を残すのは厳禁。
- **CLI を E2E で使わない**。
- **完了報告に含めること**: 変更した全ファイルパス、tasks.md の最終状態、実装経路（apply-frontend / apply-backend / Codex 使用有無）、apply-review の最終判定（承認）、`40-run-and-report-e2e` の緑化結果、未完了タスクとその理由。

### 2-2. apply SubAgent 内部の多段プレイブック（委譲文に展開する内容）

apply SubAgent は以下を自分で回す（あなたはこの手順を委譲文として渡す）。

1. **整合レビュー**: 着手前に proposal / design / tasks / spec delta の矛盾・欠落を確認する。
2. **実装を分担して委譲**:
   - フロント範囲を **apply-frontend**（sonnet）に、バックエンド範囲を **apply-backend**（opus）に委譲する。両者の write スコープが重ならなければ同時起動して並列実装する。データ契約（API の型）は両者で齟齬が出ないよう spec / design を正として渡す。
   - 各サブエージェントは Codex（MCP / fugu）を実装アクセラレータとして使ってよい（実行系は不可）。
3. **レビューを apply-review に委譲**:
   - 実装差分・対象 change・仕様を **apply-review**（opus）に渡す。apply-review は配下で architect-* を pop し、各観点を集約して承認 / 変更要求を返す。
   - 変更要求なら、指摘に従い apply-frontend / apply-backend（または自分）で修正し、**apply-review が承認するまで再帰**する（1 回で打ち切らない）。
   - 同一 change で 3 周しても承認が出なければ、その旨を上位（あなた）に報告して指示を仰ぐ。
4. **E2E は `40-run-and-report-e2e` skill を直接 invoke**（実行と報告のみ。修正はしない）:
   - 対象 change の E2E ドメイン（例: 求人=`E2E-JOB-*`）と DB reset 要否を渡して skill を invoke する。skill は自己 fork（model sonnet）してヘッドレス実行する。ハートビート・CLI 使用禁止は skill 側が担保する。
   - skill は結果と失敗原因の見立てを返す。**修正はしない**ので、失敗があれば apply SubAgent 自身が実装側（apply-frontend / apply-backend）で直し、skill を **再 invoke** する。これを **緑になるまで再帰** する。
5. **完遂条件**: tasks.md 全完了（人間作業除く）＋ apply-review 承認 ＋ 対応 E2E ドメイン緑。これを満たして初めて上位に「完了」を報告する。

### 2-3. 完了確認（完了確認 SubAgent）

apply SubAgent の報告が来たら、**完了確認 SubAgent を起動**し、`tasks.md` と E2E 結果を確認させる。あなた自身では確認しない。満たしていなければ不足点を受け取り、**同じ apply SubAgent に差し戻す**（乱立させない）。

### 2-4. archive（apply-archive）

**apply-archive を起動**し、`.claude/commands/openspec/archive.md` に従わせる。あなた自身では archive しない。前提（tasks 完了・E2E 緑・レビュー承認）が満たされていなければ apply-archive が差し戻すので、その場合は apply SubAgent に戻す。apply-archive は `openspec archive <id> --yes` → spec 更新確認 → `openspec validate --strict` グリーンまでを担う。

### 2-5. commit（apply-commit）

archive 後に **apply-commit を起動**し、`20-commit-meaningful-diffs` スキルに従って外科的にコミットさせる。あなた自身では commit しない。1 change（または 1 Wave）= 1 コミットを基本とし、メッセージに change ID を含める。無関係な変更を巻き込まない。

---

## Phase 3: 全 change 完了後の結合レビュー

すべての change が archive・commit されたら、システム全体の結合レビューを行う。

- `docs/e2e_case.md` の全ケース E2E ヘッドレス全流し（緑確認）は **`40-run-and-report-e2e` skill を直接 invoke**（実行と報告のみ）。失敗があれば該当 change の apply SubAgent（実装修正）に差し戻し、再度 skill を invoke して再実行する。E2E ハートビート遵守。
- デザイン忠実度チェックリスト（`docs/DESIGN.MD` §9）と機能横断のコードレビューは **apply-review に委譲**（配下の architect-* が横断観点で評価）。
- 機能横断の不整合・依存崩れ・回帰がないか確認させる。
- 指摘があれば該当 change の apply SubAgent（実装修正）に差し戻して修正し、**再度結合レビュー** に回す。**最終 OK が出るまで再帰**する。

この **`docs/e2e_case.md` 全ケース緑化 + 結合レビュー最終 OK** がこのスキルのゴールである。

---

## Phase 4: 報告

```
## OpenSpec 全 change 実装完了

### 実装した change
- 直列土台: [ID 一覧]
- Wave A〜E: [ID 一覧]（各 archive 済み）

### 多段構成の稼働
- apply SubAgent: change ごとに起動（N 体）
- 実装: apply-frontend（sonnet）/ apply-backend（opus）（Codex アクセラレータ使用有無を明記）
- レビュー: apply-review（opus）が architect-* を pop して集約（各 change で承認まで再帰）
- E2E: `40-run-and-report-e2e` skill（自己 fork/sonnet）が実行・報告、apply SubAgent が実装側を修正して緑化
- archive: apply-archive / commit: apply-commit

### 検証
- 全 change: archive 済み / `openspec validate --strict` グリーン
- E2E: `docs/e2e_case.md` の全ケース緑（全ケース流し済み）
- デザイン忠実度チェック: 完了

### レビュー
- 各 change レビュー: 最終承認（apply-review）
- 結合レビュー: 最終 OK（`docs/e2e_case.md` 全ケース緑化と合わせてゴール達成）

### 残課題（あれば）
- 人間作業が必要な未完了タスク: [内容と理由]
```

---

/goal すべての changes の実装完了とアーカイブ。そして @docs/e2e_case.md の完全グリーンを達成してください。すべての実装が完了したら db reset 後に e2e を実行して all green になるまで挑戦してください.

## オーケストレーションの鉄則

- **apply のたびに SubAgent を起動する**: あなたが直接アプリ実装・レビュー・E2E・archive・commit をやらない。必ず change 専属の apply SubAgent を立てる。
- **多段を徹底する**: apply SubAgent は apply-frontend / apply-backend（実装）・apply-review（多段レビュー）を起動し、`40-run-and-report-e2e` skill（E2E 実行）を invoke して回収し、1 change を完遂する。
- **役割を取り違えない**: Codex は Playwright をポート制限で実行できない。**E2E（実行系）は必ず `40-run-and-report-e2e` skill（自己 fork）**。Codex は apply-frontend / apply-backend の任意アクセラレータで、レビューの主役ではない（レビューは apply-review）。
- **E2E skill は修正しない**: E2E の失敗修正は apply SubAgent が実装側で行い、`40-run-and-report-e2e` skill には再 invoke（再実行）だけ依頼する。
- **コンテキストを守る**: change の中身を最上位で精読しない。精読は apply SubAgent とその配下に任せ、あなたは報告とログだけ見る。
- **change ごとの依存関係を把握してから起動する**: proposal / tasks のタイトルと Impact、write スコープ、共有基盤への依存を見て、直列ブロックと並列 Wave を明示する。
- **並列は write スコープが重ならない範囲のみ。ただし可能なら同時起動する**。土台は必ず逐次。
- **E2E ハートビートを必ず守る**: 並列で複数の E2E が同時に走ると壊れる。書き込み・消去を徹底させる。
- **完了を偽らない**: tasks.md を実態に合わせ、対応 E2E が緑・apply-review 承認になってからしか apply-archive に archive させない。サイレントスキップ厳禁。
- **レビューは承認が出るまで再帰**: 1 回で終わらせない。ただし 3 周で承認が出なければ停止して報告。
- **詰まったら止めて報告**: 想定外の状態（archive 済み spec を壊す修正が必要等）に遭遇したら続行せず判断を仰ぐ。
